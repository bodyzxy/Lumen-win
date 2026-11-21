import {
  Aperture, ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, Blend, Box, ChartColumn, Check, CircleEllipsis, CircleSlash,
  CircleX, Columns2, Columns3, Contrast, Copy, Diff, Droplet, Droplets, Ellipsis, Eye, EyeOff, Hexagon, Images, Layers3,
  LucideIcon, Minus, Palette, PanelLeft, PanelRight, Pipette, Plus, Redo2, Repeat, RotateCcw, Scale, Search, SlidersHorizontal,
  Spline, SquareEqual, Sun, Undo2, X,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import type { LayerKind } from '../model/types'

/** Mac 版用的 SF Symbols → 线性图标 */
const map: Record<string, { icon: LucideIcon; transform?: string }> = {
  'sun.max': { icon: Sun },
  'chart.bar.xaxis': { icon: ChartColumn },
  curves: { icon: Spline },
  'plusminus.circle': { icon: Diff },
  'drop.halffull': { icon: Droplets },
  drop: { icon: Droplet },
  scalemass: { icon: Scale },
  'circle.lefthalf.filled': { icon: Contrast },
  'circle.righthalf.filled': { icon: Contrast, transform: 'scaleX(-1)' },
  'circle.bottomhalf.filled': { icon: Contrast, transform: 'rotate(-90deg)' },
  'camera.filters': { icon: Blend },
  'slider.horizontal.3': { icon: SlidersHorizontal },
  cube: { icon: Box },
  'arrow.left.arrow.right.circle': { icon: ArrowLeftRight },
  'square.stack.3d.down.right': { icon: Layers3 },
  'rectangle.split.3x1': { icon: Columns3 },
  eyedropper: { icon: Pipette },
  'camera.aperture': { icon: Aperture },
  'circle.slash': { icon: CircleSlash },
  'square.on.square': { icon: Copy },
  'arrow.triangle.swap': { icon: Repeat },
  'equal.square': { icon: SquareEqual },
  paintpalette: { icon: Palette },
  'circle.hexagongrid': { icon: Hexagon },
  'photo.on.rectangle': { icon: Images },
  'ellipsis.circle': { icon: CircleEllipsis },
  ellipsis: { icon: Ellipsis },
  'sidebar.trailing': { icon: PanelRight },
  'sidebar.leading': { icon: PanelLeft },
  'arrow.uturn.backward': { icon: Undo2 },
  'arrow.uturn.forward': { icon: Redo2 },
  'square.split.2x1': { icon: Columns2 },
  eye: { icon: Eye },
  'eye.slash': { icon: EyeOff },
  minus: { icon: Minus },
  plus: { icon: Plus },
  xmark: { icon: X },
  checkmark: { icon: Check },
  magnifyingglass: { icon: Search },
  'xmark.circle.fill': { icon: CircleX },
  'arrow.counterclockwise': { icon: RotateCcw },
  'arrow.up': { icon: ArrowUp },
  'arrow.down': { icon: ArrowDown },
  'arrow.right': { icon: ArrowRight },
  'arrow.left.and.right': { icon: ArrowLeftRight },
}

export function Icon({
  name,
  size = 13,
  weight = 'regular',
  style,
}: {
  name: string
  size?: number
  weight?: 'ultraLight' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold'
  style?: CSSProperties
}) {
  const m = map[name] ?? map['ellipsis']
  const C = m.icon
  const stroke = { ultraLight: 0.9, light: 1.3, regular: 1.6, medium: 1.9, semibold: 2.2, bold: 2.6 }[weight]
  // SF Symbols 的字号对应的图形略大于字号本身
  const px = Math.round(size * 1.18)
  return (
    <C
      size={px}
      strokeWidth={(stroke * 24) / px}
      absoluteStrokeWidth={false}
      style={{ display: 'block', flex: 'none', transform: m.transform, ...style }}
    />
  )
}

export const kindSymbol: Record<LayerKind, string> = {
  brightnessContrast: 'sun.max',
  levels: 'chart.bar.xaxis',
  curves: 'curves',
  exposure: 'plusminus.circle',
  vibrance: 'drop.halffull',
  hueSaturation: 'drop',
  colorBalance: 'scalemass',
  blackWhite: 'circle.lefthalf.filled',
  photoFilter: 'camera.filters',
  channelMixer: 'slider.horizontal.3',
  lut: 'cube',
  invert: 'arrow.left.arrow.right.circle',
  posterize: 'square.stack.3d.down.right',
  threshold: 'circle.righthalf.filled',
  gradientMap: 'rectangle.split.3x1',
  selectiveColor: 'eyedropper',
  shadowsHighlights: 'circle.bottomhalf.filled',
  hdrToning: 'camera.aperture',
  desaturate: 'circle.slash',
  matchColor: 'square.on.square',
  replaceColor: 'arrow.triangle.swap',
  equalize: 'equal.square',
  hsl: 'paintpalette',
  colorGrading: 'circle.hexagongrid',
}
