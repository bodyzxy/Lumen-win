//! Standalone MCP stdio server for Lumen (Windows & cross-platform).
//! Speaks JSON-RPC 2.0 (MCP 2024-11-05) over stdin/stdout and forwards
//! commands to the live Lumen desktop window over localhost TCP IPC.

mod mcp_catalog;

use std::io::{self, BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

static REQ_COUNTER: AtomicU64 = AtomicU64::new(1);

fn ipc_info_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".lumen").join("lumen-win-ipc.json"))
}

fn read_ipc_port() -> Option<u16> {
    let path = ipc_info_path()?;
    let text = std::fs::read_to_string(path).ok()?;
    let val: Value = serde_json::from_str(&text).ok()?;
    val.get("port").and_then(|v| v.as_u64()).map(|p| p as u16)
}

fn connect_ipc() -> Option<TcpStream> {
    let port = read_ipc_port()?;
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(400)).ok()
}

fn find_lumen_executable() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidates = if cfg!(windows) {
                vec!["Lumen.exe", "lumen.exe"]
            } else {
                vec!["Lumen", "lumen"]
            };
            for name in candidates {
                let p = dir.join(name);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    if cfg!(windows) {
        let mut dirs = Vec::new();
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(&local).join("Lumen"));
            dirs.push(PathBuf::from(&local).join("Programs").join("Lumen"));
        }
        if let Some(pf) = std::env::var_os("ProgramFiles") {
            dirs.push(PathBuf::from(pf).join("Lumen"));
        }
        for d in dirs {
            let p = d.join("Lumen.exe");
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn ensure_lumen_running() -> Result<TcpStream, String> {
    if let Some(stream) = connect_ipc() {
        return Ok(stream);
    }
    let exe = find_lumen_executable()
        .ok_or_else(|| "Could not find Lumen executable. Please launch Lumen first.".to_string())?;
    Command::new(&exe)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch Lumen ({}): {e}", exe.display()))?;

    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(250));
        if let Some(stream) = connect_ipc() {
            return Ok(stream);
        }
    }
    Err("Timed out waiting for Lumen IPC server".into())
}

fn ipc_call(method: &str, params: Value) -> Result<Value, String> {
    let mut stream = ensure_lumen_running()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));
    let id = format!("mcp-{}", REQ_COUNTER.fetch_add(1, Ordering::Relaxed));
    let req = json!({ "id": id, "method": method, "params": params });
    let mut bytes = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    stream.write_all(&bytes).map_err(|e| format!("IPC write failed: {e}"))?;
    stream.flush().map_err(|e| format!("IPC flush failed: {e}"))?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|e| format!("IPC read failed: {e}"))?;
    if line.trim().is_empty() {
        return Err("Empty response from Lumen".into());
    }
    let resp: Value = serde_json::from_str(line.trim()).map_err(|e| format!("Invalid IPC JSON: {e}"))?;
    if let Some(err) = resp.get("error") {
        let msg = err.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown Lumen error");
        return Err(msg.to_string());
    }
    Ok(resp.get("result").cloned().unwrap_or_else(|| json!({})))
}

fn dispatch(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": { "listChanged": false },
                "resources": { "subscribe": false, "listChanged": false },
                "prompts": { "listChanged": false }
            },
            "serverInfo": {
                "name": "LumenMCP",
                "version": "1.0.0"
            }
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": mcp_catalog::tools() })),
        "tools/call" => {
            let name = params.get("name").and_then(|v| v.as_str()).ok_or("Missing tool name")?;
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            Ok(execute_tool(name, args))
        }
        "resources/list" => Ok(json!({ "resources": mcp_catalog::resources() })),
        "resources/read" => {
            let uri = params.get("uri").and_then(|v| v.as_str()).ok_or("Missing uri")?;
            let text = mcp_catalog::read_resource(uri).ok_or("Resource not found")?;
            let mime = if uri.ends_with("builtin") { "application/json" } else { "text/markdown" };
            Ok(json!({
                "contents": [{ "uri": uri, "mimeType": mime, "text": text }]
            }))
        }
        "prompts/list" => Ok(json!({ "prompts": mcp_catalog::prompts() })),
        "prompts/get" => {
            let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args = params.get("arguments");
            mcp_catalog::get_prompt(name, args).ok_or_else(|| "Unknown prompt".to_string())
        }
        _ => Err(format!("Method not supported: {method}")),
    }
}

fn execute_tool(name: &str, args: Value) -> Value {
    match ipc_call(name, args) {
        Ok(res) => {
            if name == "render_preview" {
                if let (Some(b64), Some(mime)) = (
                    res.get("base64").and_then(|v| v.as_str()),
                    res.get("mime_type").and_then(|v| v.as_str()),
                ) {
                    let mut meta = res.clone();
                    if let Some(obj) = meta.as_object_mut() {
                        obj.remove("base64");
                    }
                    let meta_text = serde_json::to_string_pretty(&meta).unwrap_or_else(|_| "{}".into());
                    return json!({
                        "content": [
                            { "type": "image", "data": b64, "mimeType": mime },
                            { "type": "text", "text": meta_text }
                        ],
                        "isError": false
                    });
                }
            }
            let text = serde_json::to_string_pretty(&res).unwrap_or_else(|_| "{}".into());
            json!({
                "content": [{ "type": "text", "text": text }],
                "isError": false
            })
        }
        Err(e) => json!({
            "content": [{ "type": "text", "text": format!("Error: {e}") }],
            "isError": true
        }),
    }
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<Value>(trimmed) else { continue };
        let Some(method) = req.get("method").and_then(|v| v.as_str()) else { continue };
        let Some(id) = req.get("id") else { continue };
        if id.is_null() {
            continue;
        }
        let params = req.get("params").cloned().unwrap_or_else(|| json!({}));
        let resp = match dispatch(method, &params) {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(msg) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": msg } }),
        };
        if let Ok(s) = serde_json::to_string(&resp) {
            let _ = out.write_all(s.as_bytes());
            let _ = out.write_all(b"\n");
            let _ = out.flush();
        }
    }
}
