//! 相机 RAW 解码（rawler，纯 Rust，不依赖系统组件）。
//!
//! 输出线性的 sRGB 浮点数据：已经做了去马赛克、相机白平衡、色彩校准、裁到有效区域、按拍摄方向转正。
//! 网页里的 WebGL 管线直接拿这份线性数据计算（曝光、白平衡都在线性空间），
//! 所以 RAW 的宽容度能完整用上；不会先压成 8 位。

use std::path::Path;

use half::f16;
use rawler::decoders::Orientation;
use rawler::imgop::develop::{Intermediate, ProcessingStep, RawDevelop};

/// RAW 文件的扩展名（打开对话框、拖放时用来识别）
pub const RAW_EXTENSIONS: &[&str] = &[
    "arw", "srf", "sr2", "cr2", "cr3", "crw", "nef", "nrw", "raf", "orf", "rw2", "rwl", "dng", "pef", "srw", "3fr", "fff", "iiq", "mef", "mos",
    "mrw", "erf", "kdc", "dcr", "x3f",
];

/// 冲洗后的整张图：线性 sRGB，RGB 交错存放
pub struct Developed {
    pub width: usize,
    pub height: usize,
    pub rgb: Vec<f32>,
}

/// 相机直出那样的“基础提亮”：RAW 的线性数据直接显示会偏暗、偏平。
/// y = x·(1+k)/(1+k·x)：暗部和中间调提亮约 2/3 档，1.0 仍然是 1.0（高光不会被推爆）。
/// Mac 版的 CIRAWFilter 也会默认加一条类似的基础曲线。
const BOOST: f32 = 0.9;

/// 再加一点点 S 形对比（在感知空间里做，1.0 以上的高光保持线性，方便压高光时找回细节）
const CONTRAST: f32 = 0.14;

fn to_gamma(x: f32) -> f32 {
    if x <= 0.0031308 { x * 12.92 } else { 1.055 * x.powf(1.0 / 2.4) - 0.055 }
}

fn to_linear(v: f32) -> f32 {
    if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}

fn boost(x: f32) -> f32 {
    let x = x.max(0.0);
    let y = x * (1.0 + BOOST) / (1.0 + BOOST * x);
    if y >= 1.0 {
        return y;
    }
    let g = to_gamma(y);
    let e = 1.0 + CONTRAST * 1.2;
    let s = if g < 0.5 { 0.5 * (2.0 * g).powf(e) } else { 1.0 - 0.5 * (2.0 * (1.0 - g)).powf(e) };
    to_linear(s)
}

pub fn develop(path: &Path) -> Result<Developed, String> {
    let raw = rawler::decode_file(path).map_err(|e| e.to_string())?;
    let orientation = raw.orientation;
    let dev = RawDevelop::new_with(&[
        ProcessingStep::Rescale,
        ProcessingStep::Demosaic,
        ProcessingStep::FujiRotate,
        ProcessingStep::CropActiveArea,
        ProcessingStep::WhiteBalance,
        ProcessingStep::Calibrate,
        ProcessingStep::CropDefault,
        // 不做 SRgb：保留线性数据
    ]);
    let inter = dev.develop_intermediate(&raw).map_err(|e| e.to_string())?;
    let (w, h, mut rgb) = match inter {
        Intermediate::ThreeColor(px) => (px.width, px.height, px.flatten()),
        Intermediate::Monochrome(px) => {
            let (w, h) = (px.width, px.height);
            let mut out = Vec::with_capacity(w * h * 3);
            for v in px.data {
                out.extend_from_slice(&[v, v, v]);
            }
            (w, h, out)
        }
        Intermediate::FourColor(px) => {
            let (w, h) = (px.width, px.height);
            let mut out = Vec::with_capacity(w * h * 3);
            for p in px.data {
                out.extend_from_slice(&[p[0], p[1], p[2]]);
            }
            (w, h, out)
        }
    };
    // 基础曲线用查找表（每张 2400 万像素 × 3 个通道，逐个算幂函数太慢）
    const N: usize = 4096;
    let table: Vec<f32> = (0..=N).map(|i| boost(i as f32 / N as f32)).collect();
    for v in rgb.iter_mut() {
        let x = v.max(0.0);
        *v = if x >= 1.0 {
            boost(x)
        } else {
            let f = x * N as f32;
            let i = f as usize;
            let t = f - i as f32;
            table[i] + (table[(i + 1).min(N)] - table[i]) * t
        };
    }
    Ok(orient(Developed { width: w, height: h, rgb }, orientation))
}

/// 按拍摄时的方向转正（先翻转，再转置）
fn orient(img: Developed, o: Orientation) -> Developed {
    let (transpose, hflip, vflip) = o.to_flips();
    if !transpose && !hflip && !vflip {
        return img;
    }
    let (w, h) = (img.width, img.height);
    let (nw, nh) = if transpose { (h, w) } else { (w, h) };
    let mut out = vec![0f32; img.rgb.len()];
    for y in 0..h {
        for x in 0..w {
            let sx = if hflip { w - 1 - x } else { x };
            let sy = if vflip { h - 1 - y } else { y };
            let (dx, dy) = if transpose { (y, x) } else { (x, y) };
            let si = (sy * w + sx) * 3;
            let di = (dy * nw + dx) * 3;
            out[di..di + 3].copy_from_slice(&img.rgb[si..si + 3]);
        }
    }
    Developed { width: nw, height: nh, rgb: out }
}

/// 缩小到长边不超过 max_side（面积平均，不会出现摩尔纹）。max_side 为 0 表示原尺寸
pub fn downscale(img: &Developed, max_side: usize) -> (usize, usize, Vec<f32>) {
    let (w, h) = (img.width, img.height);
    let long = w.max(h);
    if max_side == 0 || long <= max_side {
        return (w, h, img.rgb.clone());
    }
    let k = max_side as f64 / long as f64;
    let nw = ((w as f64 * k).round() as usize).max(1);
    let nh = ((h as f64 * k).round() as usize).max(1);
    let mut out = vec![0f32; nw * nh * 3];
    let fx = w as f64 / nw as f64;
    let fy = h as f64 / nh as f64;
    for oy in 0..nh {
        let y0 = (oy as f64 * fy) as usize;
        let y1 = (((oy + 1) as f64 * fy) as usize).min(h).max(y0 + 1);
        for ox in 0..nw {
            let x0 = (ox as f64 * fx) as usize;
            let x1 = (((ox + 1) as f64 * fx) as usize).min(w).max(x0 + 1);
            let mut acc = [0f32; 3];
            for y in y0..y1 {
                let row = y * w;
                for x in x0..x1 {
                    let i = (row + x) * 3;
                    acc[0] += img.rgb[i];
                    acc[1] += img.rgb[i + 1];
                    acc[2] += img.rgb[i + 2];
                }
            }
            let n = ((y1 - y0) * (x1 - x0)) as f32;
            let o = (oy * nw + ox) * 3;
            out[o] = acc[0] / n;
            out[o + 1] = acc[1] / n;
            out[o + 2] = acc[2] / n;
        }
    }
    (nw, nh, out)
}

/// 打包给网页：[原图宽 u32][原图高 u32][张数 u32]，然后每张 [宽 u32][高 u32][RGB 半精度浮点 …]（全部小端）
pub fn encode(full: (usize, usize), images: &[(usize, usize, Vec<f32>)]) -> Vec<u8> {
    let total: usize = images.iter().map(|(_, _, d)| 8 + d.len() * 2).sum();
    let mut out = Vec::with_capacity(12 + total);
    out.extend_from_slice(&(full.0 as u32).to_le_bytes());
    out.extend_from_slice(&(full.1 as u32).to_le_bytes());
    out.extend_from_slice(&(images.len() as u32).to_le_bytes());
    for (w, h, data) in images {
        out.extend_from_slice(&(*w as u32).to_le_bytes());
        out.extend_from_slice(&(*h as u32).to_le_bytes());
        for v in data {
            out.extend_from_slice(&f16::from_f32(*v).to_bits().to_le_bytes());
        }
    }
    out
}
