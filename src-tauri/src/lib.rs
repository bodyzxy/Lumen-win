//! Lumen 的 Rust 部分：只负责和系统打交道 —— 读写文件、解码 WebView 不认识的图片（TIFF、相机 RAW）、写 16 位 TIFF。
//! 所有调色计算都在网页里用 WebGL 完成（和 Mac 版的 Core Image 管线一一对应）。

mod raw;

use std::io::BufWriter;
use std::path::PathBuf;

use image::{ImageBuffer, ImageEncoder, Rgb};
use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let raw = request
        .headers()
        .get(name)
        .ok_or_else(|| format!("missing header: {name}"))?
        .to_str()
        .map_err(|e| e.to_string())?;
    Ok(percent_decode_str(raw).decode_utf8_lossy().into_owned())
}

fn body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err("expected raw bytes".into()),
    }
}

/// 在后台线程里跑耗时的工作，不卡住界面
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// 读取整个文件（照片、LUT、预设）
#[tauri::command]
async fn read_file(path: String) -> Result<Response, String> {
    blocking(move || std::fs::read(&path).map(Response::new).map_err(|e| e.to_string())).await
}

/// 写文件：路径放在请求头里，内容是原始字节（避免大文件转 JSON）
#[tauri::command]
fn write_file(request: Request<'_>) -> Result<(), String> {
    let path = PathBuf::from(header(&request, "path")?);
    std::fs::write(&path, body(&request)?).map_err(|e| e.to_string())
}

/// 解码 WebView 不认识的格式（主要是 TIFF）。
/// 返回：宽（u32 小端）+ 高（u32 小端）+ RGBA8 像素
#[tauri::command]
async fn decode_image(path: String) -> Result<Response, String> {
    blocking(move || decode_image_sync(&path)).await
}

fn decode_image_sync(path: &str) -> Result<Response, String> {
    let img = image::open(path).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut out = Vec::with_capacity(8 + (w as usize) * (h as usize) * 4);
    out.extend_from_slice(&w.to_le_bytes());
    out.extend_from_slice(&h.to_le_bytes());
    out.extend_from_slice(rgba.as_raw());
    Ok(Response::new(out))
}

/// 解码相机 RAW，一次冲洗、按需要的几个尺寸返回（长边不超过 sizes 里的值，0 表示原尺寸）。
/// 返回格式见 raw::encode：线性 sRGB 半精度浮点，网页直接上传成浮点纹理
#[tauri::command]
async fn raw_decode(path: String, sizes: Vec<u32>) -> Result<Response, String> {
    blocking(move || {
        let dev = raw::develop(std::path::Path::new(&path))?;
        let images: Vec<_> = sizes.iter().map(|s| raw::downscale(&dev, *s as usize)).collect();
        Ok(Response::new(raw::encode((dev.width, dev.height), &images)))
    })
    .await
}

/// 网页用来判断哪些扩展名是 RAW（和 Rust 端保持同一份列表）
#[tauri::command]
fn raw_extensions() -> Vec<&'static str> {
    raw::RAW_EXTENSIONS.to_vec()
}

/// 16 位无损 TIFF（浏览器的编码器只能输出 8 位）。请求体是 RGBA16（小端）
#[tauri::command]
fn write_tiff16(request: Request<'_>) -> Result<(), String> {
    // 注：写文件很快（几百毫秒），保持同步
    let path = PathBuf::from(header(&request, "path")?);
    let w: u32 = header(&request, "width")?.parse().map_err(|_| "bad width")?;
    let h: u32 = header(&request, "height")?.parse().map_err(|_| "bad height")?;
    let bytes = body(&request)?;
    let expected = (w as usize) * (h as usize) * 4 * 2;
    if bytes.len() != expected {
        return Err(format!("expected {expected} bytes, got {}", bytes.len()));
    }
    // 去掉 alpha（照片不透明），存成 RGB16
    let mut rgb: Vec<u16> = Vec::with_capacity((w as usize) * (h as usize) * 3);
    for px in bytes.chunks_exact(8) {
        rgb.push(u16::from_le_bytes([px[0], px[1]]));
        rgb.push(u16::from_le_bytes([px[2], px[3]]));
        rgb.push(u16::from_le_bytes([px[4], px[5]]));
    }
    let buf: ImageBuffer<Rgb<u16>, Vec<u16>> =
        ImageBuffer::from_raw(w, h, rgb).ok_or("buffer size mismatch")?;
    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let encoder = image::codecs::tiff::TiffEncoder::new(BufWriter::new(file));
    let raw: Vec<u8> = buf.as_raw().iter().flat_map(|v| v.to_ne_bytes()).collect();
    encoder
        .write_image(&raw, w, h, image::ExtendedColorType::Rgb16)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, write_file, decode_image, raw_decode, raw_extensions, write_tiff16])
        .run(tauri::generate_context!())
        .expect("error while running Lumen");
}
