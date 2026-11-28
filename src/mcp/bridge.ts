import { colorStatsOf, histogramOf, pixelsOf, sampleColor } from '../engine/analysis'
import { neutralizingWhiteBalance } from '../engine/colormath'
import { L } from '../i18n'
import { doc, ExportFormat } from '../model/doc'
import { builtInPresets } from '../model/presets'
import {
  blendModes, defaultBasic, EditState, hexString, LayerBlendMode, LayerKind, MaskKind, maskKinds, newLayer, normalizeState, SpotPatch, uuid,
} from '../model/types'
import * as P from '../platform'

interface McpRequestPayload {
  id: string
  method: string
  params?: Record<string, any>
}

const BASIC_TABS: Record<string, number> = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temperature: 1, tint: 1, vibrance: 1, saturation: 1,
  texture: 2, clarity: 2, dehaze: 2, sharpen: 2, noiseReduction: 2,
  vignette: 3, grain: 3, grainSize: 3,
  shadowTint: 4, redHue: 4, redSaturation: 4, greenHue: 4, greenSaturation: 4, blueHue: 4, blueSaturation: 4,
}

function basicTabForKeys(keys: string[]): number | null {
  for (const k of keys) {
    if (k in BASIC_TABS) return BASIC_TABS[k]
  }
  return null
}

function mergePlain(base: any, patch: any): any {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const out: Record<string, any> = { ...(base && typeof base === 'object' ? base : {}) }
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = mergePlain(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

function downsample16(arr: number[]): number[] {
  if (arr.length < 16) return arr
  const step = Math.floor(arr.length / 16)
  const out: number[] = []
  for (let i = 0; i < 16; i++) {
    let sum = 0
    for (let j = i * step; j < (i + 1) * step; j++) sum += arr[j] ?? 0
    out.push(sum / step)
  }
  return out
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

function computeTonalAndColorZones(img: ImageBitmap, lumaCounts: number[]) {
  const { data, width, height } = pixelsOf(img, 256)
  const total = Math.max(1, width * height)
  let sCount = 0, mCount = 0, hCount = 0, nearBlack = 0, nearWhite = 0
  const sRGB = [0, 0, 0], mRGB = [0, 0, 0], hRGB = [0, 0, 0], allRGB = [0, 0, 0]
  let sLuma = 0, mLuma = 0, hLuma = 0, satSum = 0

  for (let i = 0; i < total; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    satSum += mx > 1e-4 ? (mx - mn) / mx : 0
    allRGB[0] += r; allRGB[1] += g; allRGB[2] += b
    if (y < 0.05) nearBlack++
    if (y > 0.95) nearWhite++
    if (y < 0.25) {
      sCount++; sLuma += y
      sRGB[0] += r; sRGB[1] += g; sRGB[2] += b
    } else if (y <= 0.75) {
      mCount++; mLuma += y
      mRGB[0] += r; mRGB[1] += g; mRGB[2] += b
    } else {
      hCount++; hLuma += y
      hRGB[0] += r; hRGB[1] += g; hRGB[2] += b
    }
  }

  const zoneDict = (count: number, lumaSum: number, rgbSum: number[]) => {
    const d = Math.max(1, count)
    return {
      ratio: round3(count / total),
      mean_luma: count > 0 ? round3(lumaSum / d) : 0,
      mean_rgb: count > 0 ? rgbSum.map((v) => round3(v / d)) : [0, 0, 0],
    }
  }

  const meanRGB = allRGB.map((v) => round3(v / total))
  const warmCool = meanRGB[0] - meanRGB[2]
  const greenTint = meanRGB[1] - (meanRGB[0] + meanRGB[2]) * 0.5
  let cast = 'neutral'
  if (Math.abs(warmCool) > 0.035) cast = warmCool > 0 ? 'warm' : 'cool'
  else if (Math.abs(greenTint) > 0.025) cast = greenTint > 0 ? 'greenish' : 'magenta'

  const lumaTotal = Math.max(1, lumaCounts.reduce((a, b) => a + b, 0))
  const percentile = (p: number) => {
    let acc = 0
    const target = p * lumaTotal
    for (let idx = 0; idx < lumaCounts.length; idx++) {
      acc += lumaCounts[idx]
      if (acc >= target) return round3(idx / 255)
    }
    return 1
  }
  const p05 = percentile(0.05), p95 = percentile(0.95)
  return {
    rgb_mean: meanRGB,
    saturation_mean: round3(satSum / total),
    color_cast_hint: cast,
    near_black_ratio: round3(nearBlack / total),
    near_white_ratio: round3(nearWhite / total),
    luma_p05: p05,
    luma_p95: p95,
    contrast_spread: round3(p95 - p05),
    shadows: zoneDict(sCount, sLuma, sRGB),
    midtones: zoneDict(mCount, mLuma, mRGB),
    highlights: zoneDict(hCount, hLuma, hRGB),
  }
}

function requireImage() {
  if (!doc.hasImage) throw new Error('No photo open')
}

async function waitForPreview(ms = 1200): Promise<void> {
  const start = Date.now()
  while (!doc.previewImage && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 40))
  }
}

async function dispatch(method: string, params: Record<string, any>): Promise<any> {
  switch (method) {
    case 'ping':
      return {
        status: 'ok',
        hasImage: doc.hasImage,
        activeSession: doc.activeID,
        fileName: doc.fileName,
      }

    case 'open_photos': {
      const paths = params.paths
      if (!Array.isArray(paths) || !paths.length) throw new Error("Missing 'paths' array")
      const files: P.PickedFile[] = paths.map((p: string) => ({ name: P.fileName(p), path: p }))
      const ids = await doc.open(files)
      if (!ids.length) throw new Error('Failed to open any image from provided paths')
      await waitForPreview()
      return { opened_ids: ids, sessions: doc.sessionSummaries() }
    }

    case 'list_sessions':
      return { sessions: doc.sessionSummaries(), active_id: doc.activeID }

    case 'switch_session': {
      const sid = params.session_id
      if (typeof sid !== 'string' || !doc.filmstrip.some((f) => f.id === sid)) {
        throw new Error('Session not found')
      }
      doc.switchTo(sid)
      return { active_id: sid }
    }

    case 'close_session': {
      const sid = typeof params.session_id === 'string' ? params.session_id : doc.activeID
      if (!sid || !doc.filmstrip.some((f) => f.id === sid)) throw new Error('Session not found')
      doc.closeSession(sid)
      return { closed_id: sid }
    }

    case 'get_edit_state':
      requireImage()
      return {
        state: doc.state,
        selected_layer_id: doc.selectedLayerID,
        active_basic_tab: doc.activeBasicTab,
        compare_mode: doc.compareMode,
        zoom: doc.zoom,
      }

    case 'set_basic_adjustments': {
      requireImage()
      const patch = (params.params && typeof params.params === 'object' ? params.params : params) as Record<string, any>
      const resetOthers = Boolean(params.reset_others)
      const base = resetOthers ? defaultBasic() : doc.state.basic
      const nextBasic = { ...base }
      for (const [k, v] of Object.entries(patch)) {
        if (k in nextBasic && typeof v === 'number') {
          (nextBasic as any)[k] = v
        }
      }
      const tab = basicTabForKeys(Object.keys(patch))
      doc.selectLayer(null)
      if (tab !== null) doc.setActiveBasicTab(tab)
      doc.setBasic(nextBasic)
      const summary = Object.keys(patch).filter((k) => k !== 'reset_others').sort().slice(0, 3).join(', ')
      doc.showToast(`AI · ${L('调整基础参数', 'Basic')}: ${summary}`)
      return { basic: doc.state.basic, active_basic_tab: doc.activeBasicTab }
    }

    case 'reset_adjustments': {
      requireImage()
      const scope = params.scope === 'basic' ? 'basic' : 'all'
      if (scope === 'basic') {
        doc.resetBasic()
        doc.selectLayer(null)
      } else {
        doc.resetAll()
      }
      doc.showToast(`AI · ${L('重置调整', 'Reset')}`)
      return { reset: scope }
    }

    case 'add_layer': {
      requireImage()
      const kind = params.kind as LayerKind
      if (!kind) throw new Error("Invalid or missing 'kind'")
      const layer = newLayer(kind)
      const sameCount = doc.state.layers.filter((l) => l.kind === kind).length
      if (typeof params.name === 'string' && params.name.length) layer.name = params.name
      else if (sameCount > 0) layer.name = `${layer.name} ${sameCount + 1}`
      if (typeof params.opacity === 'number') layer.opacity = Math.max(0, Math.min(100, params.opacity))
      if (typeof params.visible === 'boolean') layer.visible = params.visible
      if (typeof params.blend_mode === 'string' && blendModes.includes(params.blend_mode as LayerBlendMode)) {
        layer.blendMode = params.blend_mode as LayerBlendMode
      }
      if (params.params && typeof params.params === 'object') {
        (layer.params as any)[kind] = mergePlain((layer.params as any)[kind], params.params)
      }
      if (kind === 'equalize' && !layer.params.equalize.curve.length) {
        layer.params.equalize.curve = doc.equalizeCurve()
      }
      const nextLayers = [...doc.state.layers]
      if (typeof params.index === 'number' && params.index >= 0 && params.index <= nextLayers.length) {
        nextLayers.splice(params.index, 0, layer)
      } else if (doc.selectedLayerID) {
        const idx = nextLayers.findIndex((l) => l.id === doc.selectedLayerID)
        if (idx >= 0) nextLayers.splice(idx + 1, 0, layer)
        else nextLayers.push(layer)
      } else {
        nextLayers.push(layer)
      }
      doc.setState({ ...doc.state, layers: nextLayers })
      doc.selectLayer(layer.id)
      if (kind === 'lut' && layer.params.lut.path) {
        await doc.ensureLUTsLoaded(doc.state)
      }
      doc.showToast(`AI · ${L('添加图层', 'Added')} 「${layer.name}」`)
      return { layer: doc.state.layers.find((l) => l.id === layer.id) ?? layer }
    }

    case 'update_layer': {
      requireImage()
      const lid = params.layer_id
      const existing = doc.state.layers.find((l) => l.id === lid)
      if (!existing) throw new Error('Layer not found')
      doc.updateLayer(lid, (l) => {
        const next = { ...l, params: { ...l.params } }
        if (typeof params.name === 'string') next.name = params.name
        if (typeof params.visible === 'boolean') next.visible = params.visible
        if (typeof params.opacity === 'number') next.opacity = Math.max(0, Math.min(100, params.opacity))
        if (typeof params.blend_mode === 'string' && blendModes.includes(params.blend_mode as LayerBlendMode)) {
          next.blendMode = params.blend_mode as LayerBlendMode
        }
        if (params.params && typeof params.params === 'object') {
          (next.params as any)[l.kind] = mergePlain((l.params as any)[l.kind], params.params)
        }
        return next
      })
      doc.selectLayer(lid)
      if (existing.kind === 'lut') await doc.ensureLUTsLoaded(doc.state)
      const updated = doc.state.layers.find((l) => l.id === lid) ?? existing
      doc.showToast(`AI · ${L('更新图层', 'Updated')} 「${updated.name}」`)
      return { layer: updated }
    }

    case 'layer_action': {
      requireImage()
      const lid = params.layer_id
      const action = params.action
      if (!doc.state.layers.some((l) => l.id === lid)) throw new Error('Layer not found')
      switch (action) {
        case 'delete': doc.deleteLayer(lid); break
        case 'duplicate': doc.duplicateLayer(lid); break
        case 'move_up': doc.moveLayer(lid, true); break
        case 'move_down': doc.moveLayer(lid, false); break
        case 'select': doc.selectLayer(lid); break
        default: throw new Error(`Unknown layer action '${action}'`)
      }
      return { ok: true, layers_count: doc.state.layers.length }
    }

    case 'apply_preset': {
      requireImage()
      if (typeof params.preset_key === 'string') {
        const preset = builtInPresets().find((p) => p.key === params.preset_key)
        if (!preset) throw new Error('Unknown preset_key')
        doc.applyBuiltInPreset(preset)
        doc.showToast(`AI · ${L('套用风格', 'Applied')} 「${preset.name}」`)
        return { preset: preset.key, state: doc.state }
      }
      if (typeof params.preset_path === 'string') {
        const text = await P.readText({ name: P.fileName(params.preset_path), path: params.preset_path })
        const parsed = normalizeState(JSON.parse(text) as EditState)
        parsed.layers.forEach((l) => (l.id = uuid()))
        doc.applyEditState(parsed, true)
        doc.showToast(`AI · ${L('已套用预设', 'Preset applied')}`)
        return { preset_path: params.preset_path, state: doc.state }
      }
      throw new Error("Specify 'preset_key' or 'preset_path'")
    }

    case 'sync_adjustments': {
      requireImage()
      if (Array.isArray(params.target_session_ids)) {
        for (const id of params.target_session_ids) {
          if (typeof id === 'string') doc.applyCurrent(id)
        }
        return { synced: params.target_session_ids.length }
      }
      doc.applyCurrentToAll()
      return { synced: Math.max(0, doc.filmstrip.length - 1) }
    }

    case 'undo':
      if (!doc.canUndo) throw new Error('Nothing to undo')
      doc.undo()
      doc.showToast(`AI · ${L('撤销', 'Undo')}`)
      return { can_undo: doc.canUndo, can_redo: doc.canRedo }

    case 'redo':
      if (!doc.canRedo) throw new Error('Nothing to redo')
      doc.redo()
      doc.showToast(`AI · ${L('重做', 'Redo')}`)
      return { can_undo: doc.canUndo, can_redo: doc.canRedo }

    case 'set_view': {
      if (params.compare_mode === 'split' || params.compare_mode === 'off') {
        doc.set('compareMode', params.compare_mode)
      }
      if (typeof params.split_position === 'number') {
        doc.set('splitPosition', Math.min(0.98, Math.max(0.02, params.split_position)))
      }
      if (typeof params.show_original === 'boolean') {
        doc.set('showOriginal', params.show_original)
      }
      if (typeof params.show_inspector === 'boolean') {
        doc.set('showInspector', params.show_inspector)
      }
      if (typeof params.zoom === 'string') {
        if (params.zoom === 'fit') doc.zoomToFit()
        else if (params.zoom === '100%' || params.zoom === 'actual') doc.toggleActualSize()
      } else if (typeof params.zoom === 'number') {
        doc.setZoom(params.zoom)
      }
      return {
        compare_mode: doc.compareMode,
        split_position: doc.splitPosition,
        show_original: doc.showOriginal,
        zoom: doc.zoom,
      }
    }

    case 'get_image_analysis': {
      requireImage()
      await waitForPreview()
      const useOriginal = params.source === 'original'
      const targetImg = useOriginal ? doc.originalImage : (doc.previewImage ?? doc.originalImage)
      const res: Record<string, any> = {
        file_name: doc.fileName,
        source: useOriginal ? 'original' : 'preview',
        width: doc.imageSize.width,
        height: doc.imageSize.height,
      }
      if (targetImg) {
        const hist = !useOriginal && doc.histogram
          ? doc.histogram
          : (() => {
              const { data, width, height } = pixelsOf(targetImg, 512)
              return histogramOf(data, width, height)
            })()
        res.clip_low_ratio = hist.clipLow
        res.clip_high_ratio = hist.clipHigh
        res.histogram_luma_16bins = downsample16(hist.luma)
        res.histogram_red_16bins = downsample16(hist.red)
        res.histogram_green_16bins = downsample16(hist.green)
        res.histogram_blue_16bins = downsample16(hist.blue)
        Object.assign(res, computeTonalAndColorZones(targetImg, hist.lumaCounts))
        if (!useOriginal) {
          const stats = colorStatsOf(targetImg)
          res.ycbcr_mean = stats.mean
          res.ycbcr_std = stats.std
        }
      }
      return res
    }

    case 'sample_color': {
      requireImage()
      if (typeof params.x !== 'number' || typeof params.y !== 'number') {
        throw new Error("Missing 'x' and 'y' in 0...1")
      }
      await waitForPreview()
      const src = params.source === 'original' ? doc.originalImage : doc.previewImage
      if (!src) throw new Error('Image not rendered yet')
      const c = sampleColor(src, params.x, params.y)
      return { r: c.r, g: c.g, b: c.b, hex: hexString(c) }
    }

    case 'auto_white_balance': {
      requireImage()
      if (!doc.originalImage) throw new Error('Image not rendered yet')
      if (typeof params.x !== 'number' || typeof params.y !== 'number') {
        throw new Error("Missing 'x' and 'y' in 0...1")
      }
      const c = sampleColor(doc.originalImage, params.x, params.y)
      const [temperature, tint] = neutralizingWhiteBalance(c)
      doc.selectLayer(null)
      doc.setActiveBasicTab(1)
      doc.setBasic({ temperature, tint })
      doc.showToast(`AI · ${L('白平衡校准', 'White Balance')} (${Math.round(temperature)}, ${Math.round(tint)})`)
      return { temperature, tint, sampled_hex: hexString(c) }
    }

    case 'render_preview': {
      requireImage()
      const maxSide = typeof params.max_side === 'number' ? params.max_side : 1024
      const rendered = await doc.renderPreviewJPEG(maxSide)
      if (!rendered) throw new Error('Failed to render preview')
      const out: Record<string, any> = {
        width: rendered.width,
        height: rendered.height,
        mime_type: 'image/jpeg',
        base64: rendered.base64,
      }
      if (typeof params.output_path === 'string' && params.output_path.length) {
        await P.writeBytes(params.output_path, rendered.bytes)
        out.output_path = params.output_path
      }
      return out
    }

    case 'export_photo': {
      requireImage()
      const outPath = params.output_path
      if (typeof outPath !== 'string' || !outPath.length) throw new Error("Missing 'output_path'")
      const fmtStr = String(params.format ?? 'jpeg').toUpperCase()
      const format: ExportFormat =
        fmtStr === 'PNG' || fmtStr === 'WEBP' || fmtStr === 'TIFF' ? fmtStr : 'JPEG'
      const quality = typeof params.quality === 'number' ? params.quality : 0.92
      const maxSide = typeof params.max_side === 'number' ? params.max_side : null
      const exifFrame = params.exif_frame === true
      await doc.exportToPath(outPath, format, quality, maxSide, exifFrame)
      return { output_path: outPath, format, exif_frame: exifFrame }
    }

    case 'set_layer_mask': {
      requireImage()
      const lid = params.layer_id
      const existing = doc.state.layers.find((l) => l.id === lid)
      if (!existing) throw new Error('Layer not found')
      doc.updateLayer(lid, (l) => {
        const m = { ...l.mask }
        if (typeof params.kind === 'string' && maskKinds.includes(params.kind as MaskKind)) m.kind = params.kind as MaskKind
        if (typeof params.invert === 'boolean') m.invert = params.invert
        if (typeof params.feather === 'number') m.feather = Math.max(0, Math.min(100, params.feather))
        if (typeof params.start_x === 'number') m.startX = Math.max(0, Math.min(1, params.start_x))
        if (typeof params.start_y === 'number') m.startY = Math.max(0, Math.min(1, params.start_y))
        if (typeof params.end_x === 'number') m.endX = Math.max(0, Math.min(1, params.end_x))
        if (typeof params.end_y === 'number') m.endY = Math.max(0, Math.min(1, params.end_y))
        if (typeof params.center_x === 'number') m.centerX = Math.max(0, Math.min(1, params.center_x))
        if (typeof params.center_y === 'number') m.centerY = Math.max(0, Math.min(1, params.center_y))
        if (typeof params.radius_x === 'number') m.radiusX = Math.max(0.04, Math.min(0.95, params.radius_x))
        if (typeof params.radius_y === 'number') m.radiusY = Math.max(0.04, Math.min(0.95, params.radius_y))
        if (typeof params.softness === 'number') m.softness = Math.max(0, Math.min(100, params.softness))
        if (typeof params.luma_min === 'number') m.lumaMin = Math.max(0, Math.min(1, params.luma_min))
        if (typeof params.luma_max === 'number') m.lumaMax = Math.max(0, Math.min(1, params.luma_max))
        if (typeof params.luma_falloff === 'number') m.lumaFalloff = Math.max(0.01, Math.min(0.5, params.luma_falloff))
        if (typeof params.target_r === 'number') m.targetR = Math.max(0, Math.min(1, params.target_r))
        if (typeof params.target_g === 'number') m.targetG = Math.max(0, Math.min(1, params.target_g))
        if (typeof params.target_b === 'number') m.targetB = Math.max(0, Math.min(1, params.target_b))
        if (typeof params.color_tolerance === 'number') m.colorTolerance = Math.max(0.02, Math.min(1, params.color_tolerance))
        if (typeof params.color_softness === 'number') m.colorSoftness = Math.max(0.02, Math.min(1, params.color_softness))
        return { ...l, mask: m }
      })
      doc.selectLayer(lid)
      const updated = doc.state.layers.find((l) => l.id === lid)!
      doc.showToast(`AI · ${L('设置蒙版', 'Mask')}`)
      return { mask: updated.mask }
    }

    case 'add_spot_patch': {
      requireImage()
      if (typeof params.x !== 'number' || typeof params.y !== 'number') throw new Error("Missing 'x' and 'y'")
      const x = Math.max(0, Math.min(1, params.x))
      const y = Math.max(0, Math.min(1, params.y))
      const radius = Math.max(0.005, Math.min(0.15, typeof params.radius === 'number' ? params.radius : 0.025))
      const sourceX = typeof params.source_x === 'number' ? params.source_x : (x + 0.04 <= 0.96 ? x + 0.04 : Math.max(0.04, x - 0.04))
      const sourceY = typeof params.source_y === 'number' ? params.source_y : y
      const patch: SpotPatch = { id: uuid(), x, y, radius, sourceX, sourceY, feather: 0.45, opacity: 100 }
      doc.update((s) => ({ ...s, spots: [...s.spots, patch] }))
      doc.showToast(`AI · ${L('污点修复', 'Spot Heal')}`)
      return { spot_count: doc.state.spots.length }
    }

    case 'set_crop': {
      requireImage()
      doc.selectLayer(null)
      doc.setActiveBasicTab(5)
      if (params.reset === true) {
        doc.resetCrop()
      } else {
        const cur = { ...doc.state.crop }
        if (typeof params.x === 'number') cur.x = Math.max(0, Math.min(0.95, params.x))
        if (typeof params.y === 'number') cur.y = Math.max(0, Math.min(0.95, params.y))
        if (typeof params.width === 'number') cur.width = Math.max(0.05, Math.min(1 - cur.x, params.width))
        if (typeof params.height === 'number') cur.height = Math.max(0.05, Math.min(1 - cur.y, params.height))
        if (typeof params.straighten === 'number') cur.straighten = Math.max(-45, Math.min(45, params.straighten))
        if (typeof params.quarter_turns === 'number') cur.quarterTurns = ((Math.round(params.quarter_turns) % 4) + 4) % 4
        if (typeof params.flip_h === 'boolean') cur.flipH = params.flip_h
        if (typeof params.flip_v === 'boolean') cur.flipV = params.flip_v
        if (typeof params.perspective_v === 'number') cur.perspectiveV = Math.max(-45, Math.min(45, params.perspective_v))
        if (typeof params.perspective_h === 'number') cur.perspectiveH = Math.max(-45, Math.min(45, params.perspective_h))
        doc.setCrop(cur)
      }
      doc.showToast(`AI · ${L('裁剪与旋转', 'Crop & Straighten')}`)
      return { crop: doc.state.crop }
    }

    case 'batch_export': {
      requireImage()
      const outDir = params.output_dir
      if (typeof outDir !== 'string' || !outDir.length) throw new Error("Missing 'output_dir'")
      const fmtStr = String(params.format ?? 'jpeg').toUpperCase()
      const format: ExportFormat =
        fmtStr === 'PNG' || fmtStr === 'WEBP' || fmtStr === 'TIFF' ? fmtStr : 'JPEG'
      const quality = typeof params.quality === 'number' ? params.quality : 0.92
      const maxSide = typeof params.max_side === 'number' ? params.max_side : null
      const exifFrame = params.exif_frame === true
      const files = await doc.exportAllToDirectory(outDir, format, quality, maxSide, exifFrame)
      return { output_dir: outDir, count: files.length, files }
    }

    case 'export_lut': {
      requireImage()
      const outPath = params.output_path
      if (typeof outPath !== 'string' || !outPath.length) throw new Error("Missing 'output_path'")
      const size = typeof params.size === 'number' ? Math.round(params.size) : 33
      await doc.exportLUTToPath(outPath, size)
      return { output_path: outPath, size }
    }

    default:
      throw new Error(`Unknown method: ${method}`)
  }
}

export async function initMcpBridge(): Promise<() => void> {
  if (!P.isTauri) return () => {}
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ])
  const unlisten = await listen<McpRequestPayload>('lumen-mcp-request', async (event) => {
    const { id, method, params } = event.payload
    try {
      const result = await dispatch(method, params ?? {})
      await invoke('mcp_respond', { id, ok: true, result, error: null })
    } catch (e: any) {
      await invoke('mcp_respond', { id, ok: false, result: null, error: String(e?.message ?? e) })
    }
  })
  await invoke('mcp_ready')
  return unlisten
}
