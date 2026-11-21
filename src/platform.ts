// 和系统打交道的部分：选择文件、读写文件、解码图片、拖放。
// 在 Tauri 里走 Rust 命令；在普通浏览器里（开发调试时）退回到 <input type=file> 和下载链接。

import { L } from './i18n'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface PickedFile {
  name: string
  /** 磁盘路径（只有在 Tauri 里才有） */
  path?: string
  /** 浏览器里选中的文件 */
  file?: File
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp', 'gif', 'tif', 'tiff', 'jfif', 'ico']

export const baseName = (p: string) => {
  const f = p.split(/[\\/]/).pop() ?? p
  const i = f.lastIndexOf('.')
  return i > 0 ? f.slice(0, i) : f
}
export const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p
export const isImagePath = (p: string) => IMAGE_EXT.includes((p.split('.').pop() ?? '').toLowerCase())

async function core() {
  return await import('@tauri-apps/api/core')
}
async function dialog() {
  return await import('@tauri-apps/plugin-dialog')
}

function browserPick(accept: string, multiple: boolean): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      input.remove()
      resolve(files.map((f) => ({ name: f.name, file: f })))
    }
    input.oncancel = () => {
      input.remove()
      resolve([])
    }
    input.click()
  })
}

export async function pickImages(multiple: boolean, title: string): Promise<PickedFile[]> {
  if (!isTauri) return browserPick('image/*,.tif,.tiff', multiple)
  const { open } = await dialog()
  const res = await open({
    multiple,
    title,
    filters: [{ name: L('图片', 'Images'), extensions: IMAGE_EXT }],
  })
  if (!res) return []
  const paths = Array.isArray(res) ? res : [res]
  return paths.map((p) => ({ name: fileName(p), path: p }))
}

export async function pickFile(ext: string[], title: string): Promise<PickedFile | null> {
  if (!isTauri) {
    const f = await browserPick(ext.map((e) => '.' + e).join(','), false)
    return f[0] ?? null
  }
  const { open } = await dialog()
  const res = await open({ multiple: false, title, filters: [{ name: ext.join(', ').toUpperCase(), extensions: ext }] })
  if (!res || Array.isArray(res)) return null
  return { name: fileName(res), path: res }
}

/** 选择保存位置。浏览器里返回文件名（之后用下载的方式保存） */
export async function pickSavePath(defaultName: string, ext: string, title: string): Promise<string | null> {
  if (!isTauri) return defaultName
  const { save } = await dialog()
  return await save({ defaultPath: defaultName, title, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
}

export async function readBytes(f: PickedFile): Promise<Uint8Array> {
  if (f.file) return new Uint8Array(await f.file.arrayBuffer())
  const { invoke } = await core()
  const res = await invoke<ArrayBuffer>('read_file', { path: f.path })
  return new Uint8Array(res)
}

export async function readText(f: PickedFile): Promise<string> {
  return new TextDecoder().decode(await readBytes(f))
}

export async function writeBytes(path: string, data: Uint8Array): Promise<void> {
  if (!isTauri) {
    const blob = new Blob([data as BlobPart])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName(path)
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    return
  }
  const { invoke } = await core()
  await invoke('write_file', data, { headers: { path: encodeURIComponent(path) } })
}

export async function writeText(path: string, text: string) {
  await writeBytes(path, new TextEncoder().encode(text))
}

/** 16 位 TIFF：浏览器编不了，交给 Rust */
export async function writeTiff16(path: string, rgba16: Uint16Array, w: number, h: number) {
  if (!isTauri) throw new Error(L('浏览器里不能导出 16 位 TIFF', '16-bit TIFF export needs the desktop app'))
  const { invoke } = await core()
  const bytes = new Uint8Array(rgba16.buffer, rgba16.byteOffset, rgba16.byteLength)
  await invoke('write_tiff16', bytes, { headers: { path: encodeURIComponent(path), width: String(w), height: String(h) } })
}

/** 解码图片：先用 WebView 自带的解码器（会按 EXIF 方向转正、按内嵌色彩配置转换到 sRGB），不行再用 Rust 解码（TIFF 等） */
export async function decodeImage(f: PickedFile, bytes?: Uint8Array): Promise<ImageBitmap> {
  const data = bytes ?? (await readBytes(f))
  try {
    return await createImageBitmap(new Blob([data as BlobPart]), { imageOrientation: 'from-image', premultiplyAlpha: 'none' } as any)
  } catch (e) {
    if (!isTauri || !f.path) throw e
  }
  const { invoke } = await core()
  const raw = new Uint8Array(await invoke<ArrayBuffer>('decode_image', { path: f.path }))
  const dv = new DataView(raw.buffer, raw.byteOffset, 8)
  const w = dv.getUint32(0, true)
  const h = dv.getUint32(4, true)
  const px = new Uint8ClampedArray(raw.buffer, raw.byteOffset + 8, w * h * 4)
  return await createImageBitmap(new ImageData(px, w, h))
}

/** 拖放：Tauri 里用窗口事件（拿到磁盘路径），浏览器里用 HTML5 拖放 */
export async function listenDragDrop(handlers: {
  over: (inside: boolean) => void
  drop: (files: PickedFile[]) => void
}): Promise<() => void> {
  if (isTauri) {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    const un = await getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload
      if (p.type === 'enter' || p.type === 'over') handlers.over(true)
      else if (p.type === 'leave') handlers.over(false)
      else if (p.type === 'drop') {
        handlers.over(false)
        const files = p.paths.filter(isImagePath).map((path) => ({ name: fileName(path), path }))
        if (files.length) handlers.drop(files)
      }
    })
    return un
  }
  let depth = 0
  const enter = (e: DragEvent) => {
    e.preventDefault()
    depth++
    handlers.over(true)
  }
  const over = (e: DragEvent) => e.preventDefault()
  const leave = () => {
    depth = Math.max(0, depth - 1)
    if (depth === 0) handlers.over(false)
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    depth = 0
    handlers.over(false)
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/') || isImagePath(f.name))
    if (files.length) handlers.drop(files.map((f) => ({ name: f.name, file: f })))
  }
  window.addEventListener('dragenter', enter)
  window.addEventListener('dragover', over)
  window.addEventListener('dragleave', leave)
  window.addEventListener('drop', drop)
  return () => {
    window.removeEventListener('dragenter', enter)
    window.removeEventListener('dragover', over)
    window.removeEventListener('dragleave', leave)
    window.removeEventListener('drop', drop)
  }
}

// MARK: 窗口

export async function windowControl(action: 'minimize' | 'toggleMaximize' | 'close') {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const w = getCurrentWindow()
  if (action === 'minimize') await w.minimize()
  else if (action === 'toggleMaximize') await w.toggleMaximize()
  else await w.close()
}

export async function onMaximizedChange(cb: (max: boolean) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const w = getCurrentWindow()
  cb(await w.isMaximized())
  return await w.onResized(async () => cb(await w.isMaximized()))
}

export async function startDragging() {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().startDragging()
}
