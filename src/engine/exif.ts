import { ExifInfo } from '../model/types'

/** 从 JPEG APP1 (Exif) 或 TIFF 字节中提取常用拍摄参数 */
export function parseExif(bytes: Uint8Array): ExifInfo {
  const empty: ExifInfo = { camera: '', lens: '', details: '' }
  if (bytes.length < 12) return empty
  let tiffStart = -1
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2
    while (pos + 4 < bytes.length) {
      if (bytes[pos] !== 0xff) break
      const marker = bytes[pos + 1]
      const len = (bytes[pos + 2] << 8) | bytes[pos + 3]
      if (marker === 0xe1 && pos + 10 < bytes.length) {
        if (bytes[pos + 4] === 0x45 && bytes[pos + 5] === 0x78 && bytes[pos + 6] === 0x69 && bytes[pos + 7] === 0x66) {
          tiffStart = pos + 10
          break
        }
      }
      if (marker === 0xda || len < 2) break
      pos += 2 + len
    }
  } else if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) {
    tiffStart = 0
  }
  if (tiffStart < 0 || tiffStart + 8 >= bytes.length) return empty

  const dv = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, bytes.byteLength - tiffStart)
  const le = dv.getUint16(0, false) === 0x4949
  if (!le && dv.getUint16(0, false) !== 0x4d4d) return empty
  const u16 = (o: number) => (o + 2 <= dv.byteLength ? dv.getUint16(o, le) : 0)
  const u32 = (o: number) => (o + 4 <= dv.byteLength ? dv.getUint32(o, le) : 0)
  const str = (off: number, count: number) => {
    let s = ''
    for (let i = 0; i < count && off + i < dv.byteLength; i++) {
      const ch = dv.getUint8(off + i)
      if (ch === 0) break
      s += String.fromCharCode(ch)
    }
    return s.trim()
  }
  const rat = (off: number) => {
    const num = u32(off), den = u32(off + 4)
    return den > 0 ? num / den : 0
  }

  let camera = '', focal = 0, fnum = 0, exp = 0, iso = 0, exifIfd = 0
  const readIfd = (ifdOff: number) => {
    if (ifdOff <= 0 || ifdOff + 2 > dv.byteLength) return
    const count = u16(ifdOff)
    for (let i = 0; i < count; i++) {
      const e = ifdOff + 2 + i * 12
      if (e + 12 > dv.byteLength) break
      const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), valOff = e + 8
      const dataOff = (type === 2 && cnt > 4) || type === 5 ? u32(valOff) : valOff
      if (tag === 0x0110 && type === 2) camera = str(dataOff, cnt)
      else if (tag === 0x8769) exifIfd = u32(valOff)
      else if (tag === 0x920a && type === 5) focal = rat(dataOff)
      else if (tag === 0x829d && type === 5) fnum = rat(dataOff)
      else if (tag === 0x829a && type === 5) exp = rat(dataOff)
      else if (tag === 0x8827 && type === 3) iso = u16(valOff)
    }
  }
  readIfd(u32(4))
  if (exifIfd > 0) readIfd(exifIfd)

  const parts: string[] = []
  if (focal > 0) parts.push(`${Math.round(focal)}mm`)
  if (fnum > 0) parts.push(`f/${fnum.toFixed(1)}`)
  if (exp > 0) parts.push(exp >= 1 ? `${exp.toFixed(1)}s` : `1/${Math.round(1 / exp)}s`)
  if (iso > 0) parts.push(`ISO ${iso}`)
  return { camera, lens: '', details: parts.join('  ·  ') }
}

/** 为导出照片加上艺术画廊白边与 EXIF 参数水印 */
export function addExifFrame(src: OffscreenCanvas, exif: ExifInfo): OffscreenCanvas {
  const w = src.width, h = src.height
  const pad = Math.max(24, Math.round(Math.min(w, h) * 0.035))
  const bottom = Math.max(Math.round(pad * 2.4), Math.round(Math.min(w, h) * 0.095))
  const outW = w + pad * 2
  const outH = h + pad + bottom
  const out = new OffscreenCanvas(outW, outH)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#FBF9F7'
  ctx.fillRect(0, 0, outW, outH)
  ctx.drawImage(src, pad, pad)

  const fontSize = Math.max(14, Math.round(bottom * 0.25))
  const title = exif.camera || 'LUMEN'
  const sub = exif.details || 'Light & Tone'
  const textY = pad + h + Math.round((bottom - fontSize * 0.4) / 2)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1F1F1F'
  ctx.font = `600 ${fontSize}px Inter, "Segoe UI", sans-serif`
  ctx.fillText(title, pad, textY)

  ctx.fillStyle = '#6B6B6B'
  ctx.font = `400 ${Math.round(fontSize * 0.86)}px ui-monospace, Consolas, monospace`
  const subW = ctx.measureText(sub).width
  ctx.fillText(sub, Math.max(pad, outW - pad - subW), textY)
  return out
}
