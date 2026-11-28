use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct McpBridgeState {
    pending: Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>,
    ready: AtomicBool,
}

impl Default for McpBridgeState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            ready: AtomicBool::new(false),
        }
    }
}

pub fn ipc_info_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".lumen").join("lumen-win-ipc.json"))
}

pub fn cleanup_ipc_info() {
    if let Some(path) = ipc_info_path() {
        let _ = std::fs::remove_file(path);
    }
}

#[tauri::command]
pub fn mcp_ready(state: State<'_, McpBridgeState>) {
    state.ready.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn mcp_respond(
    state: State<'_, McpBridgeState>,
    id: String,
    ok: bool,
    result: Option<Value>,
    error: Option<String>,
) {
    let tx = state.pending.lock().ok().and_then(|mut m| m.remove(&id));
    if let Some(tx) = tx {
        let payload = if ok {
            Ok(result.unwrap_or_else(|| json!({})))
        } else {
            Err(error.unwrap_or_else(|| "Unknown frontend error".into()))
        };
        let _ = tx.send(payload);
    }
}

pub fn start_ipc_server(app: AppHandle) {
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[Lumen IPC] failed to bind: {e}");
            return;
        }
    };
    let port = match listener.local_addr() {
        Ok(a) => a.port(),
        Err(_) => return,
    };
    if let Some(path) = ipc_info_path() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let info = json!({ "port": port, "pid": std::process::id() });
        let _ = std::fs::write(&path, info.to_string());
    }

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let app_clone = app.clone();
                std::thread::spawn(move || handle_client(app_clone, stream));
            }
        }
    });
}

fn handle_client(app: AppHandle, mut stream: TcpStream) {
    let Ok(cloned) = stream.try_clone() else { return };
    let mut reader = BufReader::new(cloned);
    let mut line = String::new();
    if reader.read_line(&mut line).unwrap_or(0) == 0 {
        return;
    }
    let req: Value = match serde_json::from_str(line.trim()) {
        Ok(v) => v,
        Err(_) => return,
    };
    let id = req.get("id").and_then(|v| v.as_str()).unwrap_or("0").to_string();
    let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let params = req.get("params").cloned().unwrap_or_else(|| json!({}));

    let resp = match forward_to_frontend(&app, &id, &method, params) {
        Ok(res) => json!({ "id": id, "result": res }),
        Err(msg) => json!({ "id": id, "error": { "code": -32000, "message": msg } }),
    };
    let mut out = serde_json::to_string(&resp).unwrap_or_else(|_| "{}".into());
    out.push('\n');
    let _ = stream.write_all(out.as_bytes());
    let _ = stream.flush();
}

fn forward_to_frontend(app: &AppHandle, id: &str, method: &str, params: Value) -> Result<Value, String> {
    let state = app.state::<McpBridgeState>();
    for _ in 0..100 {
        if state.ready.load(Ordering::SeqCst) {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    if !state.ready.load(Ordering::SeqCst) {
        if method == "ping" {
            return Ok(json!({ "status": "starting", "hasImage": false }));
        }
        return Err("Lumen UI is still starting".into());
    }
    if method == "open_photos" {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
    let (tx, rx) = mpsc::channel();
    {
        let mut guard = state.pending.lock().map_err(|_| "IPC lock poisoned")?;
        guard.insert(id.to_string(), tx);
    }
    let event_payload = json!({ "id": id, "method": method, "params": params });
    if let Err(e) = app.emit("lumen-mcp-request", event_payload) {
        if let Ok(mut guard) = state.pending.lock() {
            guard.remove(id);
        }
        return Err(format!("Failed to emit event: {e}"));
    }
    match rx.recv_timeout(Duration::from_secs(120)) {
        Ok(res) => res,
        Err(_) => {
            if let Ok(mut guard) = state.pending.lock() {
                guard.remove(id);
            }
            Err("Timed out waiting for Lumen UI".into())
        }
    }
}
