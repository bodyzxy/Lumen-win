import { CropSettings, cropIsIdentity } from '../model/types'

export function cropGeometry(w0: number, h0: number, crop: CropSettings) {
  const turns = ((Math.round(crop.quarterTurns) % 4) + 4) % 4
  const rw = turns % 2 === 1 ? h0 : w0
  const rh = turns % 2 === 1 ? w0 : h0
  const rad = (crop.straighten * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const scale = Math.abs(crop.straighten) >= 1e-3
    ? Math.min(rw / Math.max(1, rw * c + rh * s), rh / Math.max(1, rw * s + rh * c))
    : 1
  const iw = Math.max(2, Math.round(rw * scale))
  const ih = Math.max(2, Math.round(rh * scale))
  const cx = Math.max(0, Math.min(1, crop.x))
  const cy = Math.max(0, Math.min(1, crop.y))
  const cw = Math.max(0.02, Math.min(1 - cx, crop.width))
  const ch = Math.max(0.02, Math.min(1 - cy, crop.height))
  const outW = Math.max(2, Math.round(cw * iw))
  const outH = Math.max(2, Math.round(ch * ih))
  return { turns, rad, iw, ih, cx, cy, outW, outH }
}

export function cropCanvas(src: ImageBitmap | OffscreenCanvas, crop: CropSettings): OffscreenCanvas {
  const w0 = src.width
  const h0 = src.height
  const { turns, rad, iw, ih, cx, cy, outW, outH } = cropGeometry(w0, h0, crop)
  const canvas = new OffscreenCanvas(outW, outH)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(-cx * iw + iw / 2, -cy * ih + ih / 2)
  if (Math.abs(rad) >= 1e-5) ctx.rotate(rad)
  ctx.scale(crop.flipH ? -1 : 1, crop.flipV ? -1 : 1)
  if (turns !== 0) ctx.rotate((turns * Math.PI) / 2)
  ctx.drawImage(src, -w0 / 2, -h0 / 2)
  return canvas
}

export function cropPixels16(
  px: Uint16Array,
  w0: number,
  h0: number,
  crop: CropSettings,
): { data: Uint16Array; width: number; height: number } {
  if (cropIsIdentity(crop)) return { data: px, width: w0, height: h0 }
  const { turns, rad, iw, ih, cx, cy, outW, outH } = cropGeometry(w0, h0, crop)
  const out = new Uint16Array(outW * outH * 4)
  const cosR = Math.cos(-rad), sinR = Math.sin(-rad)
  const cosT = turns === 0 ? 1 : turns === 1 ? 0 : turns === 2 ? -1 : 0
  const sinT = turns === 0 ? 0 : turns === 1 ? -1 : turns === 2 ? 0 : 1
  const fx = crop.flipH ? -1 : 1
  const fy = crop.flipV ? -1 : 1

  for (let y = 0; y < outH; y++) {
    const dy = y + cy * ih - ih / 2
    for (let x = 0; x < outW; x++) {
      const dx = x + cx * iw - iw / 2
      const rx = dx * cosR - dy * sinR
      const ry = dx * sinR + dy * cosR
      const sx1 = rx * fx
      const sy1 = ry * fy
      const sx = sx1 * cosT - sy1 * sinT + w0 / 2
      const sy = sx1 * sinT + sy1 * cosT + h0 / 2
      const ix = Math.max(0, Math.min(w0 - 1, Math.round(sx)))
      const iy = Math.max(0, Math.min(h0 - 1, Math.round(sy)))
      const si = (iy * w0 + ix) * 4
      const di = (y * outW + x) * 4
      out[di] = px[si]
      out[di + 1] = px[si + 1]
      out[di + 2] = px[si + 2]
      out[di + 3] = px[si + 3]
    }
  }
  return { data: out, width: outW, height: outH }
}
