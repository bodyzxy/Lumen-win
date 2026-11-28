import type { ColorStats, RGBColor } from '../model/types'
import { CM } from './colormath'

export interface Histogram {
  red: number[]
  green: number[]
  blue: number[]
  luma: number[]
  /** 未归一化的亮度计数（色调均化、自动色阶用） */
  lumaCounts: number[]
  clipLow: number
  clipHigh: number
  waveformR: number[]
  waveformG: number[]
  waveformB: number[]
  vectorscope: number[]
}

export function histogramOf(px: Uint8Array | Uint8ClampedArray, w: number, h: number): Histogram {
  const r = new Array(256).fill(0)
  const g = new Array(256).fill(0)
  const b = new Array(256).fill(0)
  const l = new Array(256).fill(0)
  const wCols = 64, wRows = 32, vSize = 48
  const wfR = new Array(wCols * wRows).fill(0)
  const wfG = new Array(wCols * wRows).fill(0)
  const wfB = new Array(wCols * wRows).fill(0)
  const vec = new Array(vSize * vSize).fill(0)
  const n = w * h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const rv = px[i * 4], gv = px[i * 4 + 1], bv = px[i * 4 + 2]
      r[rv]++
      g[gv]++
      b[bv]++
      l[Math.min(255, Math.floor(0.299 * rv + 0.587 * gv + 0.114 * bv))]++
      const col = Math.min(wCols - 1, Math.floor((x * wCols) / Math.max(1, w)))
      wfR[col * wRows + Math.min(wRows - 1, Math.floor((rv * wRows) / 256))]++
      wfG[col * wRows + Math.min(wRows - 1, Math.floor((gv * wRows) / 256))]++
      wfB[col * wRows + Math.min(wRows - 1, Math.floor((bv * wRows) / 256))]++
      const [, cb, cr] = CM.toYCbCr(rv / 255, gv / 255, bv / 255)
      const vx = Math.max(0, Math.min(vSize - 1, Math.floor((cb + 0.5) * vSize)))
      const vy = Math.max(0, Math.min(vSize - 1, Math.floor((0.5 - cr) * vSize)))
      vec[vy * vSize + vx]++
    }
  }
  const norm = (a: number[]) => {
    let m = 1
    for (let i = 1; i < 255; i++) if (a[i] > m) m = a[i]
    return a.map((v) => Math.min(1, v / m))
  }
  const normGrid = (a: number[], cap: number) => {
    let m = 1
    for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]
    m *= cap
    return a.map((v) => Math.min(1, Math.sqrt(v / m)))
  }
  const total = Math.max(1, n)
  return {
    red: norm(r), green: norm(g), blue: norm(b), luma: norm(l), lumaCounts: l,
    clipLow: l[0] / total, clipHigh: l[255] / total,
    waveformR: normGrid(wfR, 0.45),
    waveformG: normGrid(wfG, 0.45),
    waveformB: normGrid(wfB, 0.45),
    vectorscope: normGrid(vec, 0.35),
  }
}

let scratch: OffscreenCanvas | null = null
function ctx2d(w: number, h: number): OffscreenCanvasRenderingContext2D {
  if (!scratch) scratch = new OffscreenCanvas(w, h)
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w
    scratch.height = h
  }
  return scratch.getContext('2d', { willReadFrequently: true })!
}

/** 把图片缩小到指定长边并取出 8 位 RGBA 像素 */
export function pixelsOf(img: ImageBitmap, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * s))
  const h = Math.max(1, Math.round(img.height * s))
  const c = ctx2d(w, h)
  c.imageSmoothingQuality = 'medium'
  c.clearRect(0, 0, w, h)
  c.drawImage(img, 0, 0, w, h)
  return { data: c.getImageData(0, 0, w, h).data, width: w, height: h }
}

/** 图片在 YCbCr 空间的颜色统计（匹配颜色用） */
export function colorStatsOf(img: ImageBitmap): ColorStats {
  const { data, width, height } = pixelsOf(img, 256)
  const sum = [0, 0, 0], sq = [0, 0, 0]
  const n = Math.max(1, width * height)
  for (let i = 0; i < width * height; i++) {
    const c = CM.toYCbCr(data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255)
    for (let k = 0; k < 3; k++) {
      sum[k] += c[k]
      sq[k] += c[k] * c[k]
    }
  }
  const mean = sum.map((v) => v / n)
  const std = [0, 1, 2].map((k) => Math.max(1e-4, Math.sqrt(Math.max(0, sq[k] / n - mean[k] * mean[k]))))
  return { mean, std }
}

/** 读取某个位置（0...1，左上为原点）附近 5×5 的平均颜色 */
export function sampleColor(img: ImageBitmap, px: number, py: number): RGBColor {
  const x = Math.floor(CM.clamp(px) * (img.width - 1))
  const y = Math.floor(CM.clamp(py) * (img.height - 1))
  const c = ctx2d(5, 5)
  c.imageSmoothingEnabled = false
  c.clearRect(0, 0, 5, 5)
  c.drawImage(img, x - 2, y - 2, 5, 5, 0, 0, 5, 5)
  const d = c.getImageData(0, 0, 5, 5).data
  let r = 0, g = 0, b = 0, cnt = 0
  for (let i = 0; i < 25; i++) {
    if (d[i * 4 + 3] === 0) continue
    r += d[i * 4]
    g += d[i * 4 + 1]
    b += d[i * 4 + 2]
    cnt++
  }
  cnt = Math.max(1, cnt) * 255
  return { r: r / cnt, g: g / cnt, b: b / cnt }
}

/** 缩小图片（高质量），返回新的 ImageBitmap */
export async function downscale(img: ImageBitmap, maxSide: number): Promise<ImageBitmap> {
  const long = Math.max(img.width, img.height)
  if (long <= maxSide) return await createImageBitmap(img)
  const s = maxSide / long
  return await createImageBitmap(img, {
    resizeWidth: Math.max(1, Math.round(img.width * s)),
    resizeHeight: Math.max(1, Math.round(img.height * s)),
    resizeQuality: 'high',
  })
}
