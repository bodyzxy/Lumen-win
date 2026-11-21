import { useRef, useSyncExternalStore } from 'react'
import { Spring, spring } from '../anim'
import { colorStatsOf, downscale, Histogram, histogramOf, sampleColor } from '../engine/analysis'
import { neutralizingWhiteBalance, parseCube, writeCube } from '../engine/colormath'
import { Renderer, Source } from '../engine/renderer'
import { L } from '../i18n'
import * as P from '../platform'
import { builtInPresets, BuiltInPreset } from './presets'
import {
  AdjustmentLayer, adjustmentSummary, clone, deepEqual, defaultBasic, defaultState, EditState, kindTitle,
  LayerKind, newLayer, normalizeState, RGBColor, stateIsDefault, uuid,
} from './types'

export type CompareMode = 'off' | 'split'

/** 吸管取色的用途 */
export type Eyedropper = { kind: 'whiteBalance' } | { kind: 'replaceColor'; layerID: string }

export const eyedropperHint = (e: Eyedropper) =>
  e.kind === 'whiteBalance'
    ? L('点击照片里本该是白色或灰色的地方', 'Click something in the photo that should be white or gray')
    : L('点击要替换的颜色', 'Click the color you want to replace')

export type ApplyBanner =
  | { kind: 'offer'; sourceID: string; name: string; summary: string }
  | { kind: 'applied'; name: string }

export interface FilmItem {
  id: string
  name: string
  thumbnail: ImageBitmap | null
  edited: boolean
  aspect: number
}

export interface DetailRender {
  image: ImageBitmap
  /** 0...1，左上为原点 */
  rect: { x: number; y: number; w: number; h: number }
  state: EditState
  sessionID: string
}

export type ExportFormat = 'JPEG' | 'PNG' | 'WEBP' | 'TIFF'
export const exportFormats: ExportFormat[] = ['JPEG', 'WEBP', 'PNG', 'TIFF']
export const formatExt: Record<ExportFormat, string> = { JPEG: 'jpg', PNG: 'png', WEBP: 'webp', TIFF: 'tiff' }

/** 一张打开着的照片：图像本身 + 它自己的调整、历史、缓存 */
class PhotoSession {
  id = uuid()
  state: EditState = defaultState()
  history: EditState[] = [defaultState()]
  historyIndex = 0
  selectedLayerID: string | null = null
  rendered: ImageBitmap | null = null
  thumbnail: ImageBitmap | null = null
  histogram: Histogram | null = null
  presetThumbs: Record<string, ImageBitmap> = {}
  detailSource: Source | null = null
  detailSize = { w: 0, h: 0 }
  detailLoading: Promise<void> | null = null

  constructor(
    public file: P.PickedFile,
    public bytes: Uint8Array,
    public width: number,
    public height: number,
    /** 预览源（长边 ≤ 2200） */
    public preview: Source,
    public original: ImageBitmap,
    /** 缩略图源（长边 ≤ 280） */
    public thumbSource: Source,
    public thumbSize: { w: number; h: number },
  ) {}

  get name() {
    return P.baseName(this.file.name)
  }
}

const PREVIEW_SIDE = 2200
const THUMB_SOURCE_SIDE = 280

/** 整个 App 的核心状态：多张照片、当前照片的调整、撤销历史、渲染调度、缩放 */
export class EditDocument {
  static basicID = '00000000-0000-0000-0000-00000000BA51'

  // MARK: 当前照片
  state: EditState = defaultState()
  /** null 表示选中“基础调整” */
  selectedLayerID: string | null = null
  previewImage: ImageBitmap | null = null
  originalImage: ImageBitmap | null = null
  histogram: Histogram | null = null
  imageSize = { width: 0, height: 0 }
  presetThumbnails: Record<string, ImageBitmap> = {}
  detail: DetailRender | null = null

  // MARK: 多照片
  filmstrip: FilmItem[] = []
  activeID: string | null = null
  applyBanner: ApplyBanner | null = null
  clipboard: EditState | null = null
  private sessions: PhotoSession[] = []

  // MARK: 界面状态
  isLoading = false
  isExporting = false
  canUndo = false
  canRedo = false
  /** 每套用一次风格 +1，画布据此播放“扫光”动画 */
  sweepToken = 0
  /** 新照片第一帧出来时 +1，画布据此播放“显影” */
  developToken = 0
  compareMode: CompareMode = 'off'
  splitPosition = 0.5
  showOriginal = false
  /** 相对“适应窗口”的倍数，1 = 刚好放下整张照片 */
  zoom = 1
  /** 照片中心相对画布中心的偏移 */
  pan = { x: 0, y: 0 }
  /** 下一次缩放 / 平移变化要用的动画（手势拖动时为 null） */
  viewAnimation: Spring | null = null
  viewAnimationToken = 0
  toast: string | null = null
  showExportSheet = false
  showInspector = true
  showSidebar = true
  eyedropper: Eyedropper | null = null
  dropHover = false
  /** 显示“正在加载”时的提示 */
  error: string | null = null

  renderer: Renderer | null = null

  // 内部
  private listeners = new Set<() => void>()
  private version = 0
  private history: EditState[] = [defaultState()]
  private historyIndex = 0
  private commitTimer: number | null = null
  private applyingHistory = false
  private toastTimer: number | null = null
  private bannerTimer: number | null = null
  private renderQueued = false
  private viewSize = { width: 0, height: 0 }
  private fitSize = { width: 0, height: 0 }
  private detailTimer: number | null = null
  private detailGeneration = 0

  constructor() {
    try {
      this.renderer = new Renderer()
    } catch (e: any) {
      this.error = String(e?.message ?? e)
      console.error(e)
    }
  }

  // MARK: 订阅

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = () => this.version
  emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }

  get hasImage() {
    return this.active != null
  }
  get fileName() {
    return this.active?.name ?? L('未命名', 'Untitled')
  }
  private get active(): PhotoSession | undefined {
    return this.sessions.find((s) => s.id === this.activeID)
  }

  /** 适应窗口时，1 个原图像素对应多少个点 */
  get fitScale() {
    return this.imageSize.width > 0 ? this.fitSize.width / this.imageSize.width : 1
  }
  get actualPercent() {
    return Math.round(this.fitScale * this.zoom * 100)
  }
  get maxZoom() {
    return Math.max(4, 4 / Math.max(this.fitScale, 0.0001))
  }

  // MARK: - 打开照片

  async presentOpenPanel() {
    const files = await P.pickImages(true, L('选择要调色的照片（可以多选）', 'Choose photos to edit (you can select several)'))
    if (files.length) this.open(files)
  }

  /** 打开照片：不会覆盖正在编辑的照片，而是加到胶片条里 */
  async open(files: P.PickedFile[]) {
    if (!files.length || !this.renderer) return
    this.isLoading = true
    this.emit()
    const loaded: PhotoSession[] = []
    for (const f of files) {
      try {
        const bytes = await P.readBytes(f)
        const full = await P.decodeImage(f, bytes)
        const original = await downscale(full, PREVIEW_SIDE)
        const thumbBmp = await downscale(original, THUMB_SOURCE_SIDE)
        const s = new PhotoSession(
          f, bytes, full.width, full.height,
          this.renderer.upload(original), original,
          this.renderer.upload(thumbBmp), { w: thumbBmp.width, h: thumbBmp.height },
        )
        s.thumbnail = await downscale(original, 160)
        full.close()
        thumbBmp.close()
        loaded.push(s)
      } catch (e) {
        console.error(e)
      }
    }
    this.isLoading = false
    const first = loaded[0]
    if (!first) {
      this.showToast(L('打不开这张图片', "Couldn't open this image"))
      this.emit()
      return
    }
    const previous = this.active
    this.stashActive()
    if (this.applyBanner?.kind === 'offer') this.dismissBanner()
    this.sessions.push(...loaded)
    this.refreshFilmstrip()
    this.activate(first, true)
    // 上一张照片有调整的话，询问是否沿用
    if (previous && !stateIsDefault(previous.state)) this.offerApply(previous)
  }

  // MARK: - 切换照片

  private stashActive() {
    const s = this.active
    if (!s) return
    this.cancelCommit()
    this.commitHistory()
    s.state = this.state
    s.history = this.history
    s.historyIndex = this.historyIndex
    s.selectedLayerID = this.selectedLayerID
    s.rendered = this.previewImage
    s.histogram = this.histogram
    s.presetThumbs = this.presetThumbnails
  }

  switchTo(id: string) {
    if (id === this.activeID) return
    const s = this.sessions.find((x) => x.id === id)
    if (!s) return
    this.stashActive()
    if (this.applyBanner?.kind === 'offer') this.dismissBanner()
    this.activate(s, false)
  }

  private activate(s: PhotoSession, isNew: boolean) {
    this.activeID = s.id
    this.imageSize = { width: s.width, height: s.height }
    this.originalImage = s.original
    this.previewImage = isNew ? null : s.rendered
    this.histogram = s.histogram
    this.presetThumbnails = s.presetThumbs
    this.zoom = 1
    this.pan = { x: 0, y: 0 }
    this.viewAnimation = null
    this.detail = null
    this.compareMode = 'off'
    this.eyedropper = null
    this.state = s.state
    this.history = s.history
    this.historyIndex = s.historyIndex
    this.selectedLayerID = s.selectedLayerID
    this.updateUndoFlags(false)
    this.renderNow(isNew)
    if (Object.keys(s.presetThumbs).length === 0) this.renderPresetThumbnails(s)
    this.emit()
  }

  closeSession(id: string) {
    const idx = this.sessions.findIndex((s) => s.id === id)
    if (idx < 0) return
    const wasActive = id === this.activeID
    const [s] = this.sessions.splice(idx, 1)
    this.renderer?.dispose(s.preview)
    this.renderer?.dispose(s.thumbSource)
    this.renderer?.dispose(s.detailSource)
    this.refreshFilmstrip()
    if (this.applyBanner?.kind === 'offer' && this.applyBanner.sourceID === id) this.dismissBanner()
    if (!wasActive) return this.emit()
    if (this.sessions.length === 0) {
      this.activeID = null
      this.previewImage = null
      this.originalImage = null
      this.histogram = null
      this.detail = null
      this.presetThumbnails = {}
      this.applyingHistory = true
      this.state = defaultState()
      this.applyingHistory = false
      this.history = [defaultState()]
      this.historyIndex = 0
      this.selectedLayerID = null
      this.imageSize = { width: 0, height: 0 }
      this.updateUndoFlags(false)
      this.emit()
    } else {
      this.activate(this.sessions[Math.min(idx, this.sessions.length - 1)], false)
    }
  }

  private refreshFilmstrip() {
    this.filmstrip = this.sessions.map((s) => {
      const st = s.id === this.activeID ? this.state : s.state
      return { id: s.id, name: s.name, thumbnail: s.thumbnail, edited: !stateIsDefault(st), aspect: s.width / Math.max(1, s.height) }
    })
  }

  /** 给某张照片重新生成缩略图（反映它当前的调整） */
  private refreshThumbnail(s: PhotoSession) {
    if (!this.renderer) return
    const st = s.id === this.activeID ? this.state : s.state
    const k = Math.min(1, 160 / Math.max(s.thumbSize.w, s.thumbSize.h))
    const w = Math.max(1, Math.round(s.thumbSize.w * k))
    const h = Math.max(1, Math.round(s.thumbSize.h * k))
    s.thumbnail = this.renderer.renderBitmap(s.thumbSource, st, { refWidth: s.thumbSize.w, refHeight: s.thumbSize.h, originX: 0, originY: 0, outWidth: w, outHeight: h })
    this.refreshFilmstrip()
    this.emit()
  }

  private renderPresetThumbnails(s: PhotoSession) {
    const r = this.renderer
    if (!r) return
    // 分几帧做，不要卡住第一次显影
    const presets = builtInPresets()
    let i = 0
    const next = () => {
      if (!this.sessions.includes(s) || i >= presets.length) return
      const p = presets[i++]
      s.presetThumbs = {
        ...s.presetThumbs,
        [p.key]: r.renderBitmap(s.thumbSource, p.state, { refWidth: s.thumbSize.w, refHeight: s.thumbSize.h, originX: 0, originY: 0, outWidth: s.thumbSize.w, outHeight: s.thumbSize.h }),
      }
      if (this.activeID === s.id) {
        this.presetThumbnails = s.presetThumbs
        this.emit()
      }
      setTimeout(next, 30)
    }
    setTimeout(next, 120)
  }

  // MARK: - 沿用 / 拷贝 / 粘贴调整

  private offerApply(source: PhotoSession) {
    this.clearBannerTimer()
    this.applyBanner = { kind: 'offer', sourceID: source.id, name: source.name, summary: adjustmentSummary(source.state) }
    this.emit()
  }

  acceptApply() {
    const b = this.applyBanner
    if (b?.kind !== 'offer') return
    const src = this.sessions.find((s) => s.id === b.sourceID)
    if (!src) return
    this.applyState(src.state)
    this.applyBanner = { kind: 'applied', name: b.name }
    this.clearBannerTimer()
    this.bannerTimer = window.setTimeout(() => this.dismissBanner(), 4000)
    this.emit()
  }

  undoApply() {
    this.undo()
    this.dismissBanner()
  }

  dismissBanner() {
    this.clearBannerTimer()
    this.applyBanner = null
    this.emit()
  }

  private clearBannerTimer() {
    if (this.bannerTimer) clearTimeout(this.bannerTimer)
    this.bannerTimer = null
  }

  private applyState(s: EditState) {
    const copy = clone(s)
    // 图层换新 ID，避免和原照片的图层混在一起
    copy.layers.forEach((l) => (l.id = uuid()))
    this.setState(copy)
    this.selectedLayerID = null
    this.sweepToken++
    this.emit()
  }

  copyAdjustments() {
    this.clipboard = this.state
    this.showToast(L(`已拷贝调整 · ${adjustmentSummary(this.state)}`, `Adjustments copied · ${adjustmentSummary(this.state)}`))
  }

  pasteAdjustments() {
    if (!this.clipboard) return
    this.applyState(this.clipboard)
    this.showToast(L('已粘贴调整', 'Adjustments pasted'))
  }

  applyCurrent(id: string, quiet = false) {
    if (id === this.activeID) return
    const s = this.sessions.find((x) => x.id === id)
    if (!s) return
    const copy = clone(this.state)
    copy.layers.forEach((l) => (l.id = uuid()))
    s.history = [...s.history.slice(0, s.historyIndex + 1), copy]
    s.historyIndex = s.history.length - 1
    s.state = copy
    s.rendered = null
    this.refreshThumbnail(s)
    if (!quiet) this.showToast(L(`已应用到「${s.name}」`, `Applied to “${s.name}”`))
  }

  applyCurrentToAll() {
    for (const s of this.sessions) if (s.id !== this.activeID) this.applyCurrent(s.id, true)
    this.showToast(L(`已同步到全部 ${this.sessions.length - 1} 张照片`, `Synced to all ${this.sessions.length - 1} photos`))
  }

  takeAdjustments(id: string) {
    const s = this.sessions.find((x) => x.id === id)
    if (!s) return
    this.applyState(s.state)
    this.showToast(L(`已沿用「${s.name}」的调整`, `Using adjustments from “${s.name}”`))
  }

  // MARK: - 状态修改

  /** 修改调整状态（会触发渲染，并在停手 0.35 秒后记入撤销历史） */
  setState(next: EditState) {
    if (next === this.state || deepEqual(next, this.state)) return
    this.state = next
    this.stateDidChange()
    this.emit()
  }

  update(fn: (s: EditState) => EditState) {
    this.setState(fn(this.state))
  }

  setBasic(patch: Partial<EditState['basic']>) {
    this.update((s) => ({ ...s, basic: { ...s.basic, ...patch } }))
  }

  updateLayer(id: string, fn: (l: AdjustmentLayer) => AdjustmentLayer) {
    this.update((s) => ({ ...s, layers: s.layers.map((l) => (l.id === id ? fn(l) : l)) }))
  }

  private stateDidChange() {
    this.scheduleRender()
    if (this.applyingHistory) return
    this.cancelCommit()
    this.commitTimer = window.setTimeout(() => this.commitHistory(), 350)
    this.updateUndoFlags(true)
  }

  private cancelCommit() {
    if (this.commitTimer) clearTimeout(this.commitTimer)
    this.commitTimer = null
  }

  // MARK: - 渲染

  scheduleRender() {
    if (this.renderQueued) return
    this.renderQueued = true
    requestAnimationFrame(() => {
      this.renderQueued = false
      this.renderNow(false)
    })
  }

  private renderNow(isNew: boolean) {
    const s = this.active
    const r = this.renderer
    if (!s || !r) return
    let hist: Histogram | null = null
    try {
      const bmp = r.renderBitmap(
        s.preview, this.state,
        { refWidth: s.preview.width, refHeight: s.preview.height, originX: 0, originY: 0, outWidth: s.preview.width, outHeight: s.preview.height },
        (px, w, h) => (hist = histogramOf(px, w, h)),
      )
      const old = this.previewImage
      this.previewImage = bmp
      if (old && old !== bmp && !this.sessions.some((x) => x.rendered === old)) old.close()
      this.histogram = hist
      if (isNew) this.developToken++
    } catch (e) {
      console.error(e)
    }
    this.scheduleDetail()
    this.emit()
  }

  // MARK: - 缩放与局部高清

  updateViewport(view: { width: number; height: number }, fit: { width: number; height: number }) {
    if (deepEqual(view, this.viewSize) && deepEqual(fit, this.fitSize)) return
    this.viewSize = view
    this.fitSize = fit
    this.scheduleDetail()
  }

  /** 设置缩放和平移；animation 为 null 表示立即跟手 */
  setView(zoom: number, pan: { x: number; y: number }, animation: Spring | null) {
    this.zoom = zoom
    this.pan = pan
    this.viewAnimation = animation
    this.viewAnimationToken++
    this.scheduleDetail()
    this.emit()
  }

  /** 以画布上某一点为中心缩放（anchor 是相对画布中心的偏移） */
  setZoom(z: number, anchor = { x: 0, y: 0 }, animation: Spring | null = null) {
    const newZ = Math.min(Math.max(z, 1), this.maxZoom)
    const k = newZ / this.zoom
    const pan = { x: anchor.x - (anchor.x - this.pan.x) * k, y: anchor.y - (anchor.y - this.pan.y) * k }
    this.setView(newZ, this.clampedPan(pan, newZ), animation)
  }

  zoomToFit(animation: Spring | null = spring(0.5, 0.86)) {
    this.setView(1, { x: 0, y: 0 }, animation)
  }

  /** 切换“适应 ↔ 原始像素” */
  toggleActualSize(anchor = { x: 0, y: 0 }) {
    if (this.zoom > 1.05) this.zoomToFit()
    else this.setZoom(Math.max(1 / Math.max(this.fitScale, 0.0001), 2), anchor, spring(0.5, 0.86))
  }

  clampedPan(pan: { x: number; y: number }, zoom = this.zoom) {
    const dw = this.fitSize.width * zoom
    const dh = this.fitSize.height * zoom
    const mx = Math.max(0, (dw - this.viewSize.width) / 2 + 60)
    const my = Math.max(0, (dh - this.viewSize.height) / 2 + 60)
    return { x: Math.min(Math.max(pan.x, -mx), mx), y: Math.min(Math.max(pan.y, -my), my) }
  }

  private scheduleDetail() {
    if (this.detailTimer) clearTimeout(this.detailTimer)
    this.detailGeneration++
    const s = this.active
    const preview = this.previewImage
    if (!s || !preview || this.zoom <= 1.05 || this.fitSize.width <= 0 || this.viewSize.width <= 0) {
      if (this.detail) {
        this.detail = null
      }
      return
    }
    const dw = this.fitSize.width * this.zoom
    const dh = this.fitSize.height * this.zoom
    const ox = this.viewSize.width / 2 + this.pan.x - dw / 2
    const oy = this.viewSize.height / 2 + this.pan.y - dh / 2
    const x0 = Math.max(0, -ox), y0 = Math.max(0, -oy)
    const x1 = Math.min(dw, this.viewSize.width - ox), y1 = Math.min(dh, this.viewSize.height - oy)
    if (x1 <= x0 || y1 <= y0) return
    const rect = { x: x0 / dw, y: y0 / dh, w: (x1 - x0) / dw, h: (y1 - y0) / dh }
    const pixelWidth = (x1 - x0) * (window.devicePixelRatio || 1)
    // 预览图的分辨率已经够用，就不必额外渲染
    if (pixelWidth <= preview.width * rect.w * 1.1) {
      this.detail = null
      return
    }
    const gen = this.detailGeneration
    const snapshot = this.state
    this.detailTimer = window.setTimeout(async () => {
      const r = this.renderer
      if (!r) return
      if (!s.detailSource) {
        if (!s.detailLoading) {
          s.detailLoading = (async () => {
            const full = await P.decodeImage(s.file, s.bytes)
            const maxSide = Math.min(6000, r.maxTextureSize)
            const bmp = await downscale(full, maxSide)
            full.close()
            s.detailSource = r.upload(bmp)
            s.detailSize = { w: bmp.width, h: bmp.height }
            bmp.close()
          })()
        }
        await s.detailLoading
      }
      if (gen !== this.detailGeneration || s.id !== this.activeID || !s.detailSource) return
      const W = s.detailSize.w, H = s.detailSize.h
      const crop = {
        x: Math.floor(rect.x * W), y: Math.floor(rect.y * H),
        w: Math.ceil(rect.w * W), h: Math.ceil(rect.h * H),
      }
      crop.w = Math.min(crop.w, W - crop.x)
      crop.h = Math.min(crop.h, H - crop.y)
      if (crop.w < 2 || crop.h < 2) return
      // 多留一圈边，避免清晰度、去朦胧这类大半径效果在边缘出现断层
      const margin = Math.round(Math.max(W, H) * 0.03)
      const rx = Math.max(0, crop.x - margin), ry = Math.max(0, crop.y - margin)
      const rw = Math.min(W, crop.x + crop.w + margin) - rx
      const rh = Math.min(H, crop.y + crop.h + margin) - ry
      const k = Math.min(1, pixelWidth / crop.w)
      const outW = Math.max(1, Math.round(crop.w * k)), outH = Math.max(1, Math.round(crop.h * k))
      try {
        const bmp = r.renderBitmap(s.detailSource, snapshot, {
          refWidth: W, refHeight: H, originX: rx, originY: ry,
          srcRect: { x: rx, y: ry, w: rw, h: rh },
          crop: { x: crop.x - rx, y: crop.y - ry, w: crop.w, h: crop.h },
          outWidth: outW, outHeight: outH,
        })
        if (gen !== this.detailGeneration) return bmp.close()
        this.detail?.image.close()
        this.detail = { image: bmp, rect: { x: crop.x / W, y: crop.y / H, w: crop.w / W, h: crop.h / H }, state: snapshot, sessionID: s.id }
        this.emit()
      } catch (e) {
        console.error(e)
      }
    }, 180)
  }

  /** 当前可以显示的局部高清图（参数变了就先不显示，等新的渲染好） */
  get currentDetail(): DetailRender | null {
    const d = this.detail
    if (!d || d.sessionID !== this.activeID || d.state !== this.state || this.zoom <= 1.05) return null
    return d
  }

  // MARK: - 撤销 / 重做

  private commitHistory() {
    if (!this.active) return
    if (!deepEqual(this.history[this.historyIndex], this.state)) {
      this.history = [...this.history.slice(0, this.historyIndex + 1), this.state]
      if (this.history.length > 120) this.history.shift()
      this.historyIndex = this.history.length - 1
      const s = this.active
      s.state = this.state
      this.refreshThumbnail(s)
    }
    this.updateUndoFlags(false)
    this.emit()
  }

  private updateUndoFlags(pending: boolean) {
    this.canUndo = this.historyIndex > 0 || pending
    this.canRedo = !pending && this.historyIndex < this.history.length - 1
  }

  undo() {
    this.cancelCommit()
    this.commitHistory()
    if (this.historyIndex <= 0) return
    this.historyIndex--
    this.applyHistory()
  }

  redo() {
    this.cancelCommit()
    this.commitHistory()
    if (this.historyIndex >= this.history.length - 1) return
    this.historyIndex++
    this.applyHistory()
  }

  private applyHistory() {
    this.applyingHistory = true
    this.state = this.history[this.historyIndex]
    this.stateDidChange()
    this.applyingHistory = false
    if (this.selectedLayerID && !this.state.layers.some((l) => l.id === this.selectedLayerID)) this.selectedLayerID = null
    this.updateUndoFlags(false)
    const s = this.active
    if (s) {
      s.state = this.state
      this.refreshThumbnail(s)
    }
    this.emit()
  }

  // MARK: - 图层操作

  selectLayer(id: string | null) {
    this.selectedLayerID = id
    this.emit()
  }

  addLayer(kind: LayerKind) {
    if (!this.hasImage) return
    const layer = newLayer(kind)
    const same = this.state.layers.filter((l) => l.kind === kind).length
    if (same > 0) layer.name = `${kindTitle(kind)} ${same + 1}`
    if (kind === 'equalize') layer.params.equalize.curve = this.equalizeCurve()
    const layers = [...this.state.layers]
    const idx = this.selectedLayerID ? layers.findIndex((l) => l.id === this.selectedLayerID) : -1
    if (idx >= 0) layers.splice(idx + 1, 0, layer)
    else layers.push(layer)
    this.selectedLayerID = layer.id
    this.setState({ ...this.state, layers })
    if (kind === 'lut') this.chooseLUT(layer.id)
    else if (kind === 'matchColor') this.chooseMatchReference(layer.id)
    else if (kind === 'replaceColor') this.setEyedropper({ kind: 'replaceColor', layerID: layer.id })
  }

  deleteLayer(id: string) {
    const idx = this.state.layers.findIndex((l) => l.id === id)
    if (idx < 0) return
    const layers = this.state.layers.filter((l) => l.id !== id)
    if (this.selectedLayerID === id) this.selectedLayerID = layers.length === 0 ? null : layers[Math.max(0, idx - 1)].id
    this.setState({ ...this.state, layers })
  }

  duplicateLayer(id: string) {
    const idx = this.state.layers.findIndex((l) => l.id === id)
    if (idx < 0) return
    const copy = clone(this.state.layers[idx])
    copy.id = uuid()
    copy.name += L(' 拷贝', ' copy')
    const layers = [...this.state.layers]
    layers.splice(idx + 1, 0, copy)
    this.selectedLayerID = copy.id
    this.setState({ ...this.state, layers })
  }

  moveLayer(id: string, up: boolean) {
    const idx = this.state.layers.findIndex((l) => l.id === id)
    const target = up ? idx + 1 : idx - 1
    if (idx < 0 || target < 0 || target >= this.state.layers.length) return
    const layers = [...this.state.layers]
    ;[layers[idx], layers[target]] = [layers[target], layers[idx]]
    this.setState({ ...this.state, layers })
  }

  /** 按显示顺序（最上面的在前）重排 */
  reorderDisplay(fromDisplay: number, toDisplay: number) {
    const display = [...this.state.layers].reverse()
    const [m] = display.splice(fromDisplay, 1)
    display.splice(toDisplay, 0, m)
    this.setState({ ...this.state, layers: display.reverse() })
  }

  toggleVisible(id: string) {
    this.updateLayer(id, (l) => ({ ...l, visible: !l.visible }))
  }

  get selectedLayer(): AdjustmentLayer | null {
    return this.selectedLayerID ? this.state.layers.find((l) => l.id === this.selectedLayerID) ?? null : null
  }

  resetBasic() {
    this.setState({ ...this.state, basic: defaultBasic() })
  }

  resetAll() {
    this.selectedLayerID = null
    this.setState(defaultState())
  }

  // MARK: - 吸管

  setEyedropper(e: Eyedropper | null) {
    this.eyedropper = e
    this.emit()
  }

  /** p 是图片上的相对位置（0...1，左上为原点） */
  pick(px: number, py: number) {
    const mode = this.eyedropper
    if (!mode) return
    if (mode.kind === 'whiteBalance') {
      if (this.originalImage) {
        const c = sampleColor(this.originalImage, px, py)
        const [t, m] = neutralizingWhiteBalance(c)
        this.setBasic({ temperature: t, tint: m })
      }
    } else if (this.previewImage) {
      const target = sampleColor(this.previewImage, px, py)
      this.updateLayer(mode.layerID, (l) => ({ ...l, params: { ...l.params, replaceColor: { ...l.params.replaceColor, target } } }))
    }
    this.eyedropper = null
    this.emit()
  }

  sampleForLoupe(px: number, py: number): RGBColor | null {
    return this.previewImage ? sampleColor(this.previewImage, px, py) : null
  }

  // MARK: - 色调均化 / 匹配颜色

  equalizeCurve(): number[] {
    const counts = this.histogram?.lumaCounts
    if (!counts) return []
    const total = counts.reduce((a, b) => a + b, 0)
    if (total <= 0) return []
    let acc = 0
    return counts.map((c) => (acc += c) / total)
  }

  recomputeEqualize(id: string) {
    this.updateLayer(id, (l) => ({ ...l, params: { ...l.params, equalize: { curve: [] } } }))
    setTimeout(() => {
      const curve = this.equalizeCurve()
      this.updateLayer(id, (l) => ({ ...l, params: { ...l.params, equalize: { curve } } }))
    }, 350)
  }

  async chooseMatchReference(id: string) {
    const f = await P.pickFile(['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp', 'tif', 'tiff'], L('选择一张参考照片，当前照片的色调会向它靠拢', "Choose a reference photo — this photo's tones will move toward it"))
    if (!f || !this.previewImage) return
    try {
      const ref = await P.decodeImage(f)
      const small = await downscale(ref, 512)
      ref.close()
      const refStats = colorStatsOf(small)
      small.close()
      const srcStats = colorStatsOf(this.previewImage)
      this.updateLayer(id, (l) => ({
        ...l,
        params: { ...l.params, matchColor: { ...l.params.matchColor, reference: refStats, source: srcStats, referenceName: P.baseName(f.name) } },
      }))
    } catch {
      this.showToast(L('参考照片读不了', "Couldn't read the reference photo"))
    }
  }

  // MARK: - LUT 文件

  async chooseLUT(id: string) {
    const f = await P.pickFile(['cube'], L('选择一个 .cube 格式的 LUT 文件', 'Choose a .cube LUT file'))
    if (!f) return
    try {
      const cube = parseCube(await P.readText(f))
      const key = f.path ?? `browser:${f.name}:${uuid()}`
      this.renderer?.setLUT(key, cube)
      const name = P.baseName(f.name)
      this.updateLayer(id, (l) => ({ ...l, name, params: { ...l.params, lut: { ...l.params.lut, path: key, displayName: name } } }))
    } catch {
      this.showToast(L('这个 LUT 文件读不了，请确认是 3D .cube 格式', "Couldn't read this LUT. Make sure it's a 3D .cube file"))
    }
  }

  lutInfo(path: string | null) {
    return path ? this.renderer?.luts.get(path) ?? null : null
  }

  private async ensureLUTsLoaded(s: EditState) {
    for (const l of s.layers) {
      const path = l.kind === 'lut' ? l.params.lut.path : null
      if (path && !this.renderer?.luts.has(path) && P.isTauri) {
        try {
          const cube = parseCube(await P.readText({ name: path, path }))
          this.renderer?.setLUT(path, cube)
        } catch {}
      }
    }
    this.scheduleRender()
  }

  // MARK: - 预设

  async savePreset() {
    const path = await P.pickSavePath(L(`${this.fileName}-预设.json`, `${this.fileName}-preset.json`), 'json', L('把当前所有调整保存成预设，以后可以一键套用到别的照片', 'Save all current adjustments as a preset to apply to other photos later'))
    if (!path) return
    try {
      await P.writeText(path, JSON.stringify(this.state, null, 2))
      this.showToast(L('预设已保存', 'Preset saved'))
    } catch (e: any) {
      this.showToast(L(`保存失败：${e?.message ?? e}`, `Save failed: ${e?.message ?? e}`))
    }
  }

  async loadPreset() {
    const f = await P.pickFile(['json'], L('选择之前保存的预设文件', 'Choose a saved preset file'))
    if (!f) return
    try {
      const s = normalizeState(JSON.parse(await P.readText(f)))
      await this.ensureLUTsLoaded(s)
      this.applyState(s)
      this.showToast(L('已套用预设', 'Preset applied'))
    } catch {
      this.showToast(L('这个预设文件读不了', "Couldn't read this preset file"))
    }
  }

  applyBuiltInPreset(p: BuiltInPreset) {
    this.selectedLayerID = null
    this.setState(p.state)
    this.sweepToken++
    this.emit()
  }

  // MARK: - 导出

  async export(format: ExportFormat, quality: number, maxSide: number | null) {
    const s = this.active
    const r = this.renderer
    if (!s || !r) return
    const ext = formatExt[format]
    const path = await P.pickSavePath(`${this.fileName}-Lumen.${ext}`, ext, L('导出照片', 'Export Photo'))
    if (!path) return
    this.isExporting = true
    this.showExportSheet = false
    this.emit()
    const snapshot = this.state
    let message = L('已导出', 'Exported')
    // 让“正在导出”先显示出来
    await new Promise((res) => setTimeout(res, 60))
    try {
      let full = await P.decodeImage(s.file, s.bytes)
      const limit = Math.min(maxSide ?? Infinity, r.maxTextureSize)
      if (Math.max(full.width, full.height) > limit) {
        const d = await downscale(full, limit)
        full.close()
        full = d
      }
      const W = full.width, H = full.height
      const src = r.upload(full)
      full.close()
      const bits = format === 'TIFF' ? 16 : 8
      const out = bits === 8 ? new Uint8ClampedArray(W * H * 4) : new Uint16Array(W * H * 4)
      // 分块渲染，每块多留一圈边，显存占用小、大图也不会失败
      const tile = 2048
      const margin = Math.round(Math.max(W, H) * 0.035)
      for (let ty = 0; ty < H; ty += tile) {
        for (let tx = 0; tx < W; tx += tile) {
          const cw = Math.min(tile, W - tx), ch = Math.min(tile, H - ty)
          const rx = Math.max(0, tx - margin), ry = Math.max(0, ty - margin)
          const rw = Math.min(W, tx + cw + margin) - rx, rh = Math.min(H, ty + ch + margin) - ry
          const px = r.renderPixels(src, snapshot, {
            refWidth: W, refHeight: H, originX: rx, originY: ry,
            srcRect: { x: rx, y: ry, w: rw, h: rh },
            crop: { x: tx - rx, y: ty - ry, w: cw, h: ch },
            outWidth: cw, outHeight: ch,
          }, bits)
          for (let y = 0; y < ch; y++) {
            out.set(px.subarray(y * cw * 4, (y + 1) * cw * 4) as any, ((ty + y) * W + tx) * 4)
          }
          await new Promise((res) => setTimeout(res, 0))
        }
      }
      r.dispose(src)
      r.trim()
      if (format === 'TIFF') {
        await P.writeTiff16(path, out as Uint16Array, W, H)
      } else {
        const canvas = new OffscreenCanvas(W, H)
        canvas.getContext('2d')!.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0)
        const type = format === 'JPEG' ? 'image/jpeg' : format === 'WEBP' ? 'image/webp' : 'image/png'
        const blob = await canvas.convertToBlob({ type, quality })
        await P.writeBytes(path, new Uint8Array(await blob.arrayBuffer()))
      }
    } catch (e: any) {
      console.error(e)
      message = L(`导出失败：${e?.message ?? e}`, `Export failed: ${e?.message ?? e}`)
    }
    this.isExporting = false
    this.showToast(message)
  }

  async exportLUT() {
    const r = this.renderer
    if (!r) return
    const path = await P.pickSavePath(`${this.fileName}-Lumen.cube`, 'cube', L('LUT 只包含颜色和明暗，不包含清晰度、锐化、暗角、颗粒、阴影/高光、HDR 等局部效果', 'The LUT contains color and tone only — not clarity, sharpening, vignette, grain, shadows/highlights, HDR or other local effects'))
    if (!path) return
    let message = L('LUT 已导出', 'LUT exported')
    try {
      const size = 33
      const data = r.buildLUT(this.state, size)
      await P.writeText(path, writeCube(data, size, P.baseName(path)))
    } catch (e: any) {
      message = L(`导出失败：${e?.message ?? e}`, `Export failed: ${e?.message ?? e}`)
    }
    this.showToast(message)
  }

  // MARK: - 提示

  showToast(text: string) {
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toast = text
    this.emit()
    this.toastTimer = window.setTimeout(() => {
      this.toast = null
      this.emit()
    }, 2200)
  }

  set<K extends keyof this>(key: K, value: this[K]) {
    this[key] = value
    this.emit()
  }
}

export const doc = new EditDocument()
;(window as any).__lumen = doc

/** 订阅文档的一部分：只有选中的值变化时才重新渲染组件 */
export function useDoc<T>(select: (d: EditDocument) => T, eq: (a: T, b: T) => boolean = Object.is): T {
  const cache = useRef<{ v: number; sel: unknown; val: T } | null>(null)
  const get = () => {
    const v = doc.getVersion()
    if (cache.current && cache.current.v === v && cache.current.sel === select) return cache.current.val
    const val = select(doc)
    if (cache.current && eq(cache.current.val, val)) {
      cache.current = { v, sel: select, val: cache.current.val }
      return cache.current.val
    }
    cache.current = { v, sel: select, val }
    return val
  }
  return useSyncExternalStore(doc.subscribe, get)
}

export const shallowEq = (a: any, b: any) => {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object') return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.is(a[k], b[k]))
}
