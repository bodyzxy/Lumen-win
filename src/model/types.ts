import { L } from '../i18n'

// MARK: - 基础类型

/** 用 0...1 存储的 sRGB 颜色，方便存成 JSON 预设 */
export interface RGBColor {
  r: number
  g: number
  b: number
}

export const rgbHex = (hex: number): RGBColor => ({
  r: ((hex >> 16) & 0xff) / 255,
  g: ((hex >> 8) & 0xff) / 255,
  b: (hex & 0xff) / 255,
})

export const hexString = (c: RGBColor) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) => Math.max(0, Math.min(255, Math.floor(v * 255))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

export const cssColor = (c: RGBColor) =>
  `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`

export const parseHex = (s: string): RGBColor => {
  const n = parseInt(s.replace('#', ''), 16)
  return rgbHex(isNaN(n) ? 0 : n)
}

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

// MARK: - 基础调整（类似 Camera Raw 的基本面板，顺序固定，始终最先计算）

export interface BasicSettings {
  temperature: number // -100...100
  tint: number
  exposure: number // -5...5 EV
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  texture: number
  clarity: number
  dehaze: number
  vibrance: number
  saturation: number
  sharpen: number // 0...100
  noiseReduction: number // 0...100
  vignette: number
  grain: number // 0...100
  grainSize: number // 0...100
  shadowTint: number
  redHue: number
  redSaturation: number
  greenHue: number
  greenSaturation: number
  blueHue: number
  blueSaturation: number
}

export const defaultBasic = (): BasicSettings => ({
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  texture: 0,
  clarity: 0,
  dehaze: 0,
  vibrance: 0,
  saturation: 0,
  sharpen: 0,
  noiseReduction: 0,
  vignette: 0,
  grain: 0,
  grainSize: 25,
  shadowTint: 0,
  redHue: 0,
  redSaturation: 0,
  greenHue: 0,
  greenSaturation: 0,
  blueHue: 0,
  blueSaturation: 0,
})

// MARK: - 调整图层（对应 PS「图像 › 调整」菜单 + Camera Raw 的 HSL 与颜色分级）

export type LayerKind =
  | 'brightnessContrast'
  | 'levels'
  | 'curves'
  | 'exposure'
  | 'vibrance'
  | 'hueSaturation'
  | 'colorBalance'
  | 'blackWhite'
  | 'photoFilter'
  | 'channelMixer'
  | 'lut'
  | 'invert'
  | 'posterize'
  | 'threshold'
  | 'gradientMap'
  | 'selectiveColor'
  | 'shadowsHighlights'
  | 'hdrToning'
  | 'desaturate'
  | 'matchColor'
  | 'replaceColor'
  | 'equalize'
  | 'hsl'
  | 'colorGrading'

export const allKinds: LayerKind[] = [
  'brightnessContrast', 'levels', 'curves', 'exposure',
  'vibrance', 'hueSaturation', 'colorBalance', 'blackWhite', 'photoFilter', 'channelMixer', 'lut',
  'invert', 'posterize', 'threshold', 'gradientMap', 'selectiveColor',
  'shadowsHighlights', 'hdrToning',
  'desaturate', 'matchColor', 'replaceColor', 'equalize',
  'hsl', 'colorGrading',
]

export function kindTitle(k: LayerKind): string {
  switch (k) {
    case 'brightnessContrast': return L('亮度/对比度', 'Brightness/Contrast')
    case 'levels': return L('色阶', 'Levels')
    case 'curves': return L('曲线', 'Curves')
    case 'exposure': return L('曝光度', 'Exposure')
    case 'vibrance': return L('自然饱和度', 'Vibrance')
    case 'hueSaturation': return L('色相/饱和度', 'Hue/Saturation')
    case 'colorBalance': return L('色彩平衡', 'Color Balance')
    case 'blackWhite': return L('黑白', 'Black & White')
    case 'photoFilter': return L('照片滤镜', 'Photo Filter')
    case 'channelMixer': return L('通道混合器', 'Channel Mixer')
    case 'lut': return L('颜色查找', 'Color Lookup')
    case 'invert': return L('反相', 'Invert')
    case 'posterize': return L('色调分离', 'Posterize')
    case 'threshold': return L('阈值', 'Threshold')
    case 'gradientMap': return L('渐变映射', 'Gradient Map')
    case 'selectiveColor': return L('可选颜色', 'Selective Color')
    case 'shadowsHighlights': return L('阴影/高光', 'Shadows/Highlights')
    case 'hdrToning': return L('HDR 色调', 'HDR Toning')
    case 'desaturate': return L('去色', 'Desaturate')
    case 'matchColor': return L('匹配颜色', 'Match Color')
    case 'replaceColor': return L('替换颜色', 'Replace Color')
    case 'equalize': return L('色调均化', 'Equalize')
    case 'hsl': return L('HSL 混色器', 'HSL Mixer')
    case 'colorGrading': return L('颜色分级', 'Color Grading')
  }
}

export const kindEnglish: Record<LayerKind, string> = {
  brightnessContrast: 'BRIGHTNESS',
  levels: 'LEVELS',
  curves: 'CURVES',
  exposure: 'EXPOSURE',
  vibrance: 'VIBRANCE',
  hueSaturation: 'HUE · SAT',
  colorBalance: 'BALANCE',
  blackWhite: 'MONO',
  photoFilter: 'FILTER',
  channelMixer: 'MIXER',
  lut: 'LOOKUP',
  invert: 'INVERT',
  posterize: 'POSTERIZE',
  threshold: 'THRESHOLD',
  gradientMap: 'GRADIENT',
  selectiveColor: 'SELECTIVE',
  shadowsHighlights: 'SHADOW · HIGHLIGHT',
  hdrToning: 'HDR',
  desaturate: 'DESATURATE',
  matchColor: 'MATCH',
  replaceColor: 'REPLACE',
  equalize: 'EQUALIZE',
  hsl: 'HSL',
  colorGrading: 'GRADING',
}

/** 需要参考周围像素，不能合进逐像素计算，单独处理 */
export const isSpatial = (k: LayerKind) => k === 'shadowsHighlights' || k === 'hdrToning'

/** 和 PS「图像 › 调整」菜单同样的分组顺序 */
export const kindGroups = (): [string, LayerKind[]][] => [
  [L('明暗', 'Tone'), ['brightnessContrast', 'levels', 'curves', 'exposure']],
  [L('色彩', 'Color'), ['vibrance', 'hueSaturation', 'colorBalance', 'blackWhite', 'photoFilter', 'channelMixer', 'lut']],
  [L('特殊', 'Special'), ['invert', 'posterize', 'threshold', 'gradientMap', 'selectiveColor']],
  [L('影调', 'Light'), ['shadowsHighlights', 'hdrToning']],
  [L('图像', 'Image'), ['desaturate', 'matchColor', 'replaceColor', 'equalize']],
  ['Camera Raw', ['hsl', 'colorGrading']],
]

export interface CurvePoint {
  x: number
  y: number
}

export interface CurvesParams {
  rgb: CurvePoint[]
  red: CurvePoint[]
  green: CurvePoint[]
  blue: CurvePoint[]
}
export const identityCurve = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
]

export interface LevelsChannel {
  inBlack: number // 0...255
  inWhite: number
  gamma: number // 0.1...3
  outBlack: number
  outWhite: number
}
export const defaultLevelsChannel = (): LevelsChannel => ({ inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 })
export const levelsIsIdentity = (c: LevelsChannel) =>
  c.inBlack === 0 && c.inWhite === 255 && c.gamma === 1 && c.outBlack === 0 && c.outWhite === 255

export interface LevelsParams {
  master: LevelsChannel
  red: LevelsChannel
  green: LevelsChannel
  blue: LevelsChannel
}

export interface BrightnessContrastParams {
  brightness: number // -150...150
  contrast: number // -50...100
}
export interface ExposureParams {
  exposure: number
  offset: number
  gamma: number
}
export interface VibranceParams {
  vibrance: number
  saturation: number
}
export interface HueSatParams {
  hue: number
  saturation: number
  lightness: number
  colorize: boolean
  colorizeHue: number
  colorizeSaturation: number
}

/** 8 个颜色区间：红 橙 黄 绿 浅绿 蓝 紫 洋红 */
export interface HSLParams {
  hue: number[]
  saturation: number[]
  luminance: number[]
}
export const hslNames = () => [
  L('红色', 'Red'), L('橙色', 'Orange'), L('黄色', 'Yellow'), L('绿色', 'Green'),
  L('浅绿', 'Aqua'), L('蓝色', 'Blue'), L('紫色', 'Purple'), L('洋红', 'Magenta'),
]
export const hslCenters = [0, 30, 60, 120, 180, 240, 280, 320]

export interface ColorBalanceParams {
  /** 每组 3 个值：[青↔红, 洋红↔绿, 黄↔蓝]，-100...100 */
  shadows: number[]
  midtones: number[]
  highlights: number[]
  preserveLuminosity: boolean
}

export interface SelectiveColorParams {
  /** 9 组：红 黄 绿 青 蓝 洋红 白 中性 黑；每组 [青, 洋红, 黄, 黑] */
  groups: number[][]
  relative: boolean
}
export const selectiveNames = () => [
  L('红色', 'Reds'), L('黄色', 'Yellows'), L('绿色', 'Greens'), L('青色', 'Cyans'), L('蓝色', 'Blues'),
  L('洋红', 'Magentas'), L('白色', 'Whites'), L('中性色', 'Neutrals'), L('黑色', 'Blacks'),
]

export interface ChannelMixerParams {
  red: number[]
  green: number[]
  blue: number[]
  monochrome: boolean
  gray: number[]
}

export interface BlackWhiteParams {
  weights: number[]
  tint: boolean
  tintHue: number
  tintSaturation: number
}
export const bwNames = () => [
  L('红色', 'Reds'), L('黄色', 'Yellows'), L('绿色', 'Greens'), L('青色', 'Cyans'), L('蓝色', 'Blues'), L('洋红', 'Magentas'),
]

export interface PhotoFilterParams {
  color: RGBColor
  density: number
  preserveLuminosity: boolean
}

export interface GradientStop {
  id: string
  position: number
  color: RGBColor
}
export interface GradientMapParams {
  stops: GradientStop[]
  reverse: boolean
}

export interface ToneWheel {
  hue: number
  saturation: number
  luminance: number
}
export const defaultWheel = (): ToneWheel => ({ hue: 0, saturation: 0, luminance: 0 })

export interface ColorGradingParams {
  shadows: ToneWheel
  midtones: ToneWheel
  highlights: ToneWheel
  global: ToneWheel
  blending: number
  balance: number
}

export interface PosterizeParams {
  levels: number
}
export interface ThresholdParams {
  level: number
}
export interface LUTParams {
  path: string | null
  displayName: string
  intensity: number
}
export interface ShadowsHighlightsParams {
  shadowsAmount: number
  shadowsRadius: number
  highlightsAmount: number
  highlightsRadius: number
  colorCorrection: number
  midtoneContrast: number
}
export interface HDRToningParams {
  radius: number
  strength: number
  gamma: number
  exposure: number
  detail: number
  vibrance: number
  saturation: number
}
/** 颜色统计（YCbCr 空间的均值和标准差），匹配颜色用 */
export interface ColorStats {
  mean: number[]
  std: number[]
}
export interface MatchColorParams {
  referenceName: string
  reference: ColorStats | null
  source: ColorStats | null
  luminance: number
  intensity: number
  fade: number
  neutralize: boolean
}
export interface ReplaceColorParams {
  target: RGBColor
  fuzziness: number
  hue: number
  saturation: number
  lightness: number
}
export interface EqualizeParams {
  /** 256 级亮度映射表，空数组表示还没计算 */
  curve: number[]
}

/** 每个图层都带着全部参数结构，只使用和自己类型对应的那一份（和 Mac 版的 JSON 预设格式一致）。 */
export interface LayerParams {
  curves: CurvesParams
  levels: LevelsParams
  brightnessContrast: BrightnessContrastParams
  exposure: ExposureParams
  vibrance: VibranceParams
  hueSaturation: HueSatParams
  hsl: HSLParams
  colorBalance: ColorBalanceParams
  selectiveColor: SelectiveColorParams
  channelMixer: ChannelMixerParams
  blackWhite: BlackWhiteParams
  photoFilter: PhotoFilterParams
  gradientMap: GradientMapParams
  colorGrading: ColorGradingParams
  posterize: PosterizeParams
  threshold: ThresholdParams
  lut: LUTParams
  shadowsHighlights: ShadowsHighlightsParams
  hdrToning: HDRToningParams
  matchColor: MatchColorParams
  replaceColor: ReplaceColorParams
  equalize: EqualizeParams
}

export const defaultParams = (): LayerParams => ({
  curves: { rgb: identityCurve(), red: identityCurve(), green: identityCurve(), blue: identityCurve() },
  levels: { master: defaultLevelsChannel(), red: defaultLevelsChannel(), green: defaultLevelsChannel(), blue: defaultLevelsChannel() },
  brightnessContrast: { brightness: 0, contrast: 0 },
  exposure: { exposure: 0, offset: 0, gamma: 1 },
  vibrance: { vibrance: 0, saturation: 0 },
  hueSaturation: { hue: 0, saturation: 0, lightness: 0, colorize: false, colorizeHue: 30, colorizeSaturation: 25 },
  hsl: { hue: Array(8).fill(0), saturation: Array(8).fill(0), luminance: Array(8).fill(0) },
  colorBalance: { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0], preserveLuminosity: true },
  selectiveColor: { groups: Array.from({ length: 9 }, () => [0, 0, 0, 0]), relative: true },
  channelMixer: { red: [100, 0, 0, 0], green: [0, 100, 0, 0], blue: [0, 0, 100, 0], monochrome: false, gray: [40, 40, 20, 0] },
  blackWhite: { weights: [40, 60, 40, 60, 20, 80], tint: false, tintHue: 35, tintSaturation: 25 },
  photoFilter: { color: rgbHex(0xec8a00), density: 25, preserveLuminosity: true },
  gradientMap: {
    stops: [
      { id: uuid(), position: 0, color: { r: 0, g: 0, b: 0 } },
      { id: uuid(), position: 1, color: { r: 1, g: 1, b: 1 } },
    ],
    reverse: false,
  },
  colorGrading: { shadows: defaultWheel(), midtones: defaultWheel(), highlights: defaultWheel(), global: defaultWheel(), blending: 50, balance: 0 },
  posterize: { levels: 6 },
  threshold: { level: 128 },
  lut: { path: null, displayName: '', intensity: 100 },
  shadowsHighlights: { shadowsAmount: 35, shadowsRadius: 30, highlightsAmount: 0, highlightsRadius: 30, colorCorrection: 20, midtoneContrast: 0 },
  hdrToning: { radius: 30, strength: 50, gamma: 1, exposure: 0, detail: 30, vibrance: 0, saturation: 20 },
  matchColor: { referenceName: '', reference: null, source: null, luminance: 100, intensity: 100, fade: 0, neutralize: false },
  replaceColor: { target: rgbHex(0xd0402b), fuzziness: 40, hue: 0, saturation: 0, lightness: 0 },
  equalize: { curve: [] },
})

export interface AdjustmentLayer {
  id: string
  kind: LayerKind
  name: string
  visible: boolean
  opacity: number // 0...100
  params: LayerParams
}

export const newLayer = (kind: LayerKind): AdjustmentLayer => ({
  id: uuid(),
  kind,
  name: kindTitle(kind),
  visible: true,
  opacity: 100,
  params: defaultParams(),
})

/** 把当前类型的参数恢复默认（保留载入的文件和取样结果） */
export function resetLayerParams(layer: AdjustmentLayer): AdjustmentLayer {
  const fresh = defaultParams()
  const p = { ...layer.params }
  switch (layer.kind) {
    case 'lut':
      p.lut = { ...p.lut, intensity: 100 }
      break
    case 'matchColor':
      p.matchColor = { ...p.matchColor, luminance: 100, intensity: 100, fade: 0, neutralize: false }
      break
    case 'replaceColor':
      p.replaceColor = { ...fresh.replaceColor, target: p.replaceColor.target }
      break
    case 'invert':
    case 'desaturate':
    case 'equalize':
      break
    default:
      ;(p as any)[layer.kind] = (fresh as any)[layer.kind]
  }
  return { ...layer, params: p }
}

// MARK: - 整体编辑状态（撤销历史保存的就是它）

export interface EditState {
  basic: BasicSettings
  /** 数组下标 0 是最底层，最后一个是最顶层（和 PS 一样，越上面越后计算） */
  layers: AdjustmentLayer[]
}

export const defaultState = (): EditState => ({ basic: defaultBasic(), layers: [] })

/** 深度比较（状态都是纯数据） */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false
  return true
}

export const basicIsDefault = (b: BasicSettings) => deepEqual(b, defaultBasic())
export const stateIsDefault = (s: EditState) => s.layers.length === 0 && basicIsDefault(s.basic)

/** 把读进来的预设补齐缺失字段（兼容 Mac 版导出的 JSON） */
export function normalizeState(raw: any): EditState {
  const basic = { ...defaultBasic(), ...(raw?.basic ?? {}) }
  const layers: AdjustmentLayer[] = (raw?.layers ?? [])
    .filter((l: any) => allKinds.includes(l?.kind))
    .map((l: any) => {
      const d = defaultParams()
      const params: any = { ...d }
      for (const k of Object.keys(d) as (keyof LayerParams)[]) {
        const v = l.params?.[k]
        if (v && typeof v === 'object' && !Array.isArray(v)) params[k] = { ...(d as any)[k], ...v }
      }
      params.gradientMap.stops = (params.gradientMap.stops ?? []).map((s: any) => ({ ...s, id: typeof s.id === 'string' ? s.id : uuid() }))
      return {
        id: typeof l.id === 'string' ? l.id : uuid(),
        kind: l.kind,
        name: typeof l.name === 'string' ? l.name : kindTitle(l.kind),
        visible: l.visible !== false,
        opacity: typeof l.opacity === 'number' ? l.opacity : 100,
        params,
      }
    })
  return { basic, layers }
}

/** 描述一组调整的简短文字，例如“3 个调整图层 · 基础调整” */
export function adjustmentSummary(s: EditState): string {
  const parts: string[] = []
  if (s.layers.length) parts.push(L(`${s.layers.length} 个调整图层`, `${s.layers.length} adjustment layer${s.layers.length === 1 ? '' : 's'}`))
  if (!basicIsDefault(s.basic)) parts.push(L('基础调整', 'Basic'))
  return parts.length ? parts.join(' · ') : L('无调整', 'No adjustments')
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
