import type { CurvePoint, RGBColor } from '../model/types'

/** 调色用的小工具函数。所有颜色值都在 0...1（伽马编码后的 RGB）。和 Mac 版 ColorMath.swift 一致。 */
export const CM = {
  clamp: (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v),
  mix: (a: number, b: number, t: number) => a + (b - a) * t,
  smoothstep(e0: number, e1: number, x: number) {
    const t = CM.clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)
  },
  luma: (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b,

  rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const maxV = Math.max(r, g, b)
    const minV = Math.min(r, g, b)
    const l = (maxV + minV) / 2
    const d = maxV - minV
    if (d < 1e-9) return [0, 0, l]
    const s = l > 0.5 ? d / (2 - maxV - minV) : d / (maxV + minV)
    let h: number
    if (maxV === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (maxV === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    return [h * 60, s, l]
  },

  hslToRgb(hDeg: number, s: number, l: number): [number, number, number] {
    if (s <= 1e-9) return [l, l, l]
    let h = hDeg % 360
    if (h < 0) h += 360
    const hn = h / 360
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const h2r = (t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    return [h2r(hn + 1 / 3), h2r(hn), h2r(hn - 1 / 3)]
  },

  toLinear: (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)),
  toGamma(v: number) {
    const x = Math.max(0, v)
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  },
  toYCbCr(r: number, g: number, b: number): [number, number, number] {
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    return [y, (b - y) * 0.564, (r - y) * 0.713]
  },
  fromYCbCr(y: number, cb: number, cr: number): [number, number, number] {
    const r = y + cr / 0.713
    const b = y + cb / 0.564
    const g = (y - 0.299 * r - 0.114 * b) / 0.587
    return [r, g, b]
  },
}

/** 低饱和的“说明性”颜色（HSB），只用在色温、色相等需要提示方向的地方 */
export function muted(h: number, s = 0.42, b = 0.9): string {
  let hh = h % 360
  if (hh < 0) hh += 360
  const [r, g, bb] = hsbToRgb(hh, s, b)
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(bb * 255)})`
}

export function hsbToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = v - c
  return [r + m, g + m, b + m]
}

export const gray = (w: number) => {
  const v = Math.round(w * 255)
  return `rgb(${v}, ${v}, ${v})`
}

// MARK: - 单调三次曲线（曲线工具用，不会出现过冲）

export const CURVE_TABLE = 1024

export function curveTable(rawPoints: CurvePoint[]): Float32Array {
  const pts = [...rawPoints].sort((a, b) => a.x - b.x)
  const n = pts.length
  const table = new Float32Array(CURVE_TABLE)
  if (n < 2) {
    for (let i = 0; i < CURVE_TABLE; i++) table[i] = i / (CURVE_TABLE - 1)
    return table
  }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const deltas = new Array(n - 1).fill(0)
  for (let i = 0; i < n - 1; i++) {
    const dx = Math.max(xs[i + 1] - xs[i], 1e-6)
    deltas[i] = (ys[i + 1] - ys[i]) / dx
  }
  const m = new Array(n).fill(0)
  m[0] = deltas[0]
  m[n - 1] = deltas[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = deltas[i - 1] * deltas[i] <= 0 ? 0 : (deltas[i - 1] + deltas[i]) / 2
  // Fritsch–Carlson 约束，保证单调
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(deltas[i]) < 1e-9) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / deltas[i]
    const b = m[i + 1] / deltas[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * deltas[i]
      m[i + 1] = t * b * deltas[i]
    }
  }
  let seg = 0
  for (let i = 0; i < CURVE_TABLE; i++) {
    const x = i / (CURVE_TABLE - 1)
    if (x <= xs[0]) {
      table[i] = CM.clamp(ys[0])
      continue
    }
    if (x >= xs[n - 1]) {
      table[i] = CM.clamp(ys[n - 1])
      continue
    }
    while (seg < n - 2 && x > xs[seg + 1]) seg++
    const h = Math.max(xs[seg + 1] - xs[seg], 1e-6)
    const t = (x - xs[seg]) / h
    const t2 = t * t
    const t3 = t2 * t
    const y =
      (2 * t3 - 3 * t2 + 1) * ys[seg] +
      (t3 - 2 * t2 + t) * h * m[seg] +
      (-2 * t3 + 3 * t2) * ys[seg + 1] +
      (t3 - t2) * h * m[seg + 1]
    table[i] = CM.clamp(y)
  }
  return table
}

export function curveValue(table: Float32Array, x: number) {
  const f = CM.clamp(x) * (CURVE_TABLE - 1)
  const i = Math.floor(f)
  if (i >= CURVE_TABLE - 1) return table[CURVE_TABLE - 1]
  return table[i] + (table[i + 1] - table[i]) * (f - i)
}

export const curveIsIdentity = (pts: CurvePoint[]) =>
  pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 1 && pts[1].y === 1

// MARK: - 白平衡

export function whiteBalanceGains(temperature: number, tint: number): [number, number, number] {
  const t = temperature / 100
  const m = tint / 100
  let rg = 1 + 0.32 * t + 0.08 * m
  let gg = 1 - 0.22 * m
  let bg = 1 - 0.32 * t + 0.08 * m
  const lum = 0.2126 * rg + 0.7152 * gg + 0.0722 * bg
  rg /= lum
  gg /= lum
  bg /= lum
  return [rg, gg, bg]
}

/** 找到让取样点变成中性灰的色温、色调 */
export function neutralizingWhiteBalance(c: RGBColor): [number, number] {
  const r = CM.toLinear(c.r), g = CM.toLinear(c.g), b = CM.toLinear(c.b)
  let best: [number, number] = [0, 0]
  let bestErr = Infinity
  for (let t = -100; t <= 100; t++) {
    for (let m = -100; m <= 100; m++) {
      const [gr, gg, gb] = whiteBalanceGains(t, m)
      const rr = r * gr, g2 = g * gg, bb = b * gb
      const mean = (rr + g2 + bb) / 3
      const err = (rr - mean) ** 2 + (g2 - mean) ** 2 + (bb - mean) ** 2
      if (err < bestErr) {
        bestErr = err
        best = [t, m]
      }
    }
  }
  return best
}

// MARK: - .cube 格式的 3D LUT

export interface CubeLUT {
  size: number
  /** RGB 三个一组，红色变化最快，其次绿色，最后蓝色 */
  data: Float32Array
  domainMin: [number, number, number]
  domainMax: [number, number, number]
}

export function parseCube(text: string): CubeLUT {
  let size = 0
  const values: number[] = []
  let dMin: [number, number, number] = [0, 0, 0]
  let dMax: [number, number, number] = [1, 1, 1]
  for (const raw of text.split(/[\r\n]+/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const first = parts[0]
    if (first === 'LUT_3D_SIZE' && parts.length > 1) size = parseInt(parts[1]) || 0
    else if (first === 'DOMAIN_MIN' && parts.length > 3) dMin = [+parts[1] || 0, +parts[2] || 0, +parts[3] || 0]
    else if (first === 'DOMAIN_MAX' && parts.length > 3) dMax = [+parts[1] || 1, +parts[2] || 1, +parts[3] || 1]
    else if (parts.length >= 3) {
      const a = parseFloat(parts[0]), b = parseFloat(parts[1]), c = parseFloat(parts[2])
      if (!isNaN(a) && !isNaN(b) && !isNaN(c) && /^[-+.\d]/.test(first)) values.push(a, b, c)
    }
  }
  if (size < 2) throw new Error('noSize')
  if (values.length < size * size * size * 3) throw new Error('badData')
  return { size, data: new Float32Array(values.slice(0, size * size * size * 3)), domainMin: dMin, domainMax: dMax }
}

/** 把 RGBA 浮点 LUT 数据写成 .cube 文本 */
export function writeCube(rgba: Float32Array, size: number, title: string): string {
  const lines: string[] = [`# Created by Lumen 光调`, `TITLE "${title}"`, `LUT_3D_SIZE ${size}`, `DOMAIN_MIN 0.0 0.0 0.0`, `DOMAIN_MAX 1.0 1.0 1.0`]
  const count = size * size * size
  for (let i = 0; i < count; i++) {
    lines.push(`${rgba[i * 4].toFixed(6)} ${rgba[i * 4 + 1].toFixed(6)} ${rgba[i * 4 + 2].toFixed(6)}`)
  }
  return lines.join('\n') + '\n'
}
