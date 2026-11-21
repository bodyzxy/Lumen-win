import { L } from '../i18n'
import { defaultState, EditState, newLayer, rgbHex } from './types'

/** 内置风格预设：一键出效果，也可以作为学习各个参数的起点 */
export interface BuiltInPreset {
  key: string
  name: string
  subtitle: string
  state: EditState
}

function warmFilm(): BuiltInPreset {
  const s = defaultState()
  Object.assign(s.basic, { temperature: 18, contrast: 12, highlights: -25, shadows: 15, blacks: 10, vibrance: 10, grain: 22, vignette: 15 })
  const curves = newLayer('curves')
  curves.name = L('胶片褪黑', 'Faded Blacks')
  curves.params.curves.rgb = [
    { x: 0, y: 0.06 }, { x: 0.25, y: 0.24 },
    { x: 0.75, y: 0.8 }, { x: 1, y: 0.96 },
  ]
  const grading = newLayer('colorGrading')
  grading.params.colorGrading.shadows = { hue: 200, saturation: 18, luminance: 0 }
  grading.params.colorGrading.highlights = { hue: 40, saturation: 22, luminance: 0 }
  s.layers = [curves, grading]
  return { key: 'warmFilm', name: L('暖调胶片', 'Warm Film'), subtitle: L('褪黑、暖高光、轻颗粒', 'Faded blacks, warm highlights, light grain'), state: s }
}

function japaneseFresh(): BuiltInPreset {
  const s = defaultState()
  Object.assign(s.basic, { exposure: 0.35, temperature: -10, tint: 4, contrast: -18, highlights: -30, shadows: 35, blacks: 20, saturation: -12, vibrance: 8 })
  const hsl = newLayer('hsl')
  hsl.name = L('日系分色', 'Japanese Split')
  hsl.params.hsl.hue[3] = 30
  hsl.params.hsl.saturation[3] = -25
  hsl.params.hsl.luminance[5] = 20
  hsl.params.hsl.saturation[1] = -10
  hsl.params.hsl.luminance[1] = 15
  s.layers = [hsl]
  return { key: 'japaneseFresh', name: L('清新日系', 'Airy Japanese'), subtitle: L('高调、低反差、偏青', 'High-key, low contrast, cool teal'), state: s }
}

function tealOrange(): BuiltInPreset {
  const s = defaultState()
  Object.assign(s.basic, { contrast: 20, clarity: 10, vibrance: 15 })
  const balance = newLayer('colorBalance')
  balance.name = L('青橙分离', 'Teal & Orange Split')
  balance.params.colorBalance.shadows = [-22, 0, 25]
  balance.params.colorBalance.highlights = [18, 0, -20]
  const hsl = newLayer('hsl')
  hsl.params.hsl.hue[3] = 60
  hsl.params.hsl.saturation[3] = -40
  hsl.params.hsl.hue[5] = -15
  hsl.params.hsl.saturation[1] = 10
  s.layers = [balance, hsl]
  return { key: 'tealOrange', name: L('青橙电影', 'Teal & Orange'), subtitle: L('暗部青、亮部橙', 'Teal shadows, orange highlights'), state: s }
}

function contrastBW(): BuiltInPreset {
  const s = defaultState()
  Object.assign(s.basic, { contrast: 35, clarity: 25, blacks: -15, grain: 30 })
  const bw = newLayer('blackWhite')
  bw.name = L('红滤镜黑白', 'Red-Filter Mono')
  bw.params.blackWhite.weights = [110, 90, -10, -50, -60, 60]
  s.layers = [bw]
  return { key: 'contrastBW', name: L('高反差黑白', 'Contrasty Mono'), subtitle: L('红滤镜效果，天空压暗', 'Red-filter look with darkened sky'), state: s }
}

function fadedVintage(): BuiltInPreset {
  const s = defaultState()
  Object.assign(s.basic, { contrast: -10, saturation: -25, temperature: 12, grain: 40, grainSize: 55, vignette: 25 })
  const curves = newLayer('curves')
  curves.name = L('褪色', 'Fade')
  curves.params.curves.rgb = [{ x: 0, y: 0.12 }, { x: 0.5, y: 0.52 }, { x: 1, y: 0.9 }]
  curves.params.curves.blue = [{ x: 0, y: 0.1 }, { x: 1, y: 0.88 }]
  const filter = newLayer('photoFilter')
  filter.params.photoFilter.color = rgbHex(0xac7a33)
  filter.params.photoFilter.density = 20
  s.layers = [curves, filter]
  return { key: 'fadedVintage', name: L('复古褪色', 'Faded Vintage'), subtitle: L('发灰的黑、泛黄、粗颗粒', 'Gray blacks, yellowed, coarse grain'), state: s }
}

function moodyNight(): BuiltInPreset {
  const s = defaultState()
  Object.assign(s.basic, { exposure: -0.3, temperature: -20, contrast: 15, highlights: -20, dehaze: 15, vignette: 30 })
  const grading = newLayer('colorGrading')
  grading.name = L('夜色', 'Night')
  grading.params.colorGrading.shadows = { hue: 220, saturation: 35, luminance: -10 }
  grading.params.colorGrading.midtones = { hue: 190, saturation: 12, luminance: 0 }
  grading.params.colorGrading.highlights = { hue: 35, saturation: 25, luminance: 0 }
  const hsl = newLayer('hsl')
  hsl.params.hsl.saturation[1] = 20
  hsl.params.hsl.luminance[1] = 10
  hsl.params.hsl.saturation[2] = 15
  s.layers = [grading, hsl]
  return { key: 'moodyNight', name: L('城市夜色', 'City Night'), subtitle: L('冷暗部、暖灯光', 'Cool shadows, warm lights'), state: s }
}

/** 每次读取都按当前语言重新生成名字 */
export const builtInPresets = (): BuiltInPreset[] => [warmFilm(), japaneseFresh(), tealOrange(), contrastBW(), fadedVintage(), moodyNight()]
