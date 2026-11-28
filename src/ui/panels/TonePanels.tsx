import { useRef, useState } from 'react'
import { tween } from '../../anim'
import { CM, curveTable, curveValue, gray, muted } from '../../engine/colormath'
import { L } from '../../i18n'
import { doc, useDoc } from '../../model/doc'
import {
  BasicSettings, BrightnessContrastParams, cropIsIdentity, CurvePoint, CurvesParams, defaultLevelsChannel, ExposureParams,
  identityCurve, LevelsChannel, LevelsParams, VibranceParams,
} from '../../model/types'
import { BareIcon, GlassButton, HelpBadge, Hint, histPath, MicroLabel, Pager, ScrubRow, TextLink, useAnimatedArray } from '../kit'
import { useSize } from '../motion'

// MARK: - 基础调整

export function BasicPanel({ basic }: { basic: BasicSettings }) {
  const tab = useDoc((d) => d.activeBasicTab)
  const eyedropper = useDoc((d) => d.eyedropper)
  const set = (patch: Partial<BasicSettings>) => doc.setBasic(patch)
  const row = (title: string, key: keyof BasicSettings, range: [number, number], help: string, extra: Partial<Parameters<typeof ScrubRow>[0]> = {}) => (
    <ScrubRow key={key + title} title={title} value={basic[key]} onChange={(v) => set({ [key]: v })} range={range} help={help} {...extra} />
  )
  const section = (t: string) => (
    <div style={{ display: 'flex', padding: '12px 18px 0 18px' }}>
      <MicroLabel text={t} />
    </div>
  )
  return (
    <Pager tabs={[L('光影', 'Light'), L('色彩', 'Color'), L('质感', 'Texture'), L('效果', 'Effects'), L('校准', 'Calibrate'), L('裁剪', 'Crop')]} selection={tab} onSelect={(t) => doc.setActiveBasicTab(t)}>
      {(page) => {
        switch (page) {
          case 0:
            return (
              <div>
                {row(L('曝光', 'Exposure'), 'exposure', [-5, 5], 'basic.exposure', { hint: Hint.tone, decimals: 2 })}
                {row(L('对比度', 'Contrast'), 'contrast', [-100, 100], 'basic.contrast')}
                {row(L('高光', 'Highlights'), 'highlights', [-100, 100], 'basic.highlights')}
                {row(L('阴影', 'Shadows'), 'shadows', [-100, 100], 'basic.shadows')}
                {row(L('白色', 'Whites'), 'whites', [-100, 100], 'basic.whites')}
                {row(L('黑色', 'Blacks'), 'blacks', [-100, 100], 'basic.blacks')}
              </div>
            )
          case 1:
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px 0 18px' }}>
                  <MicroLabel text="White balance" />
                  <BareIcon
                    icon="eyedropper"
                    size={24}
                    active={eyedropper?.kind === 'whiteBalance'}
                    onClick={() => doc.setEyedropper(eyedropper?.kind === 'whiteBalance' ? null : { kind: 'whiteBalance' })}
                    help={L('白平衡吸管：点击照片中本该是白色或灰色的地方', 'White balance picker: click something that should be white or gray')}
                  />
                  <HelpBadge k="wb.eyedropper" />
                </div>
                {row(L('色温', 'Temp'), 'temperature', [-100, 100], 'basic.temperature', { hint: Hint.temperature })}
                {row(L('色调', 'Tint'), 'tint', [-100, 100], 'basic.tint', { hint: Hint.tint })}
                {section('Presence')}
                {row(L('自然饱和度', 'Vibrance'), 'vibrance', [-100, 100], 'basic.vibrance')}
                {row(L('饱和度', 'Saturation'), 'saturation', [-100, 100], 'basic.saturation')}
              </div>
            )
          case 2:
            return (
              <div>
                {row(L('纹理', 'Texture'), 'texture', [-100, 100], 'basic.texture')}
                {row(L('清晰度', 'Clarity'), 'clarity', [-100, 100], 'basic.clarity')}
                {row(L('去朦胧', 'Dehaze'), 'dehaze', [-100, 100], 'basic.dehaze')}
                {section('Detail')}
                {row(L('锐化', 'Sharpening'), 'sharpen', [0, 100], 'basic.sharpen')}
                {row(L('降噪', 'Noise Reduction'), 'noiseReduction', [0, 100], 'basic.noise')}
              </div>
            )
          case 3:
            return (
              <div>
                {row(L('暗角', 'Vignette'), 'vignette', [-100, 100], 'basic.vignette', { hint: [gray(0.96), gray(0.6), gray(0.15)] })}
                {row(L('颗粒', 'Grain'), 'grain', [0, 100], 'basic.grain')}
                {row(L('颗粒大小', 'Grain Size'), 'grainSize', [0, 100], 'basic.grainSize', { defaultValue: 25 })}
                {row(L('光晕 Halation', 'Halation'), 'halation', [0, 100], 'basic.halation')}
                {row(L('柔光 Bloom', 'Bloom'), 'bloom', [0, 100], 'basic.bloom')}
              </div>
            )
          case 4:
            return (
              <div>
                {row(L('阴影色调', 'Shadow Tint'), 'shadowTint', [-100, 100], 'calib.shadowTint', { hint: Hint.tint })}
                {section('Red primary')}
                {row(L('色相', 'Hue'), 'redHue', [-100, 100], 'calib.hue', { hint: Hint.spectrum(-30, 30, 4) })}
                {row(L('饱和度', 'Saturation'), 'redSaturation', [-100, 100], 'calib.saturation', { hint: [gray(0.8), muted(0, 0.6)] })}
                {section('Green primary')}
                {row(L('色相', 'Hue'), 'greenHue', [-100, 100], 'calib.hue', { hint: Hint.spectrum(90, 150, 4) })}
                {row(L('饱和度', 'Saturation'), 'greenSaturation', [-100, 100], 'calib.saturation', { hint: [gray(0.8), muted(120, 0.6)] })}
                {section('Blue primary')}
                {row(L('色相', 'Hue'), 'blueHue', [-100, 100], 'calib.hue', { hint: Hint.spectrum(210, 270, 4) })}
                {row(L('饱和度', 'Saturation'), 'blueSaturation', [-100, 100], 'calib.saturation', { hint: [gray(0.8), muted(240, 0.6)] })}
              </div>
            )
          default:
            return <CropPanel />
        }
      }}
    </Pager>
  )
}

// MARK: - 曲线

/** 把一组点用弹簧 / 缓动过渡到另一组（套用曲线形状时用） */
function animatePoints(from: CurvePoint[], to: CurvePoint[], apply: (p: CurvePoint[]) => void) {
  // 点数不同就直接换（Mac 上也是直接换，只有曲线本身在动画）
  if (from.length !== to.length) return apply(to)
  tween(420, (t) => 1 - Math.pow(1 - t, 3), (k) => apply(to.map((p, i) => ({ x: from[i].x + (p.x - from[i].x) * k, y: from[i].y + (p.y - from[i].y) * k }))))
}

const curveColors = ['var(--text)', 'rgb(204,77,71)', 'rgb(66,153,92)', 'rgb(71,107,204)']

export function CurvesPanel({ params, set }: { params: CurvesParams; set: (p: CurvesParams) => void }) {
  const [channel, setChannel] = useState(0)
  const histogram = useDoc((d) => d.histogram)
  const keys: (keyof CurvesParams)[] = ['rgb', 'red', 'green', 'blue']
  const hist = (ch: number) => (histogram ? [histogram.luma, histogram.red, histogram.green, histogram.blue][ch] : null)
  const latest = useRef(params)
  latest.current = params
  const setPts = (ch: number, pts: CurvePoint[]) => set({ ...latest.current, [keys[ch]]: pts })
  const shape = (title: string, pts: CurvePoint[], ch: number) => (
    <TextLink onClick={() => animatePoints(latest.current[keys[ch]], pts, (p) => setPts(ch, p))}>{title}</TextLink>
  )
  return (
    <Pager tabs={['RGB', L('红', 'Red'), L('绿', 'Green'), L('蓝', 'Blue')]} selection={channel} onSelect={setChannel}>
      {(ch) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 18px' }}>
          <CurveEditor points={params[keys[ch]]} onChange={(p) => setPts(ch, p)} color={curveColors[ch]} histogram={hist(ch)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{L('点击添加控制点 · 拖动调整 · 拖出框外删除', 'Click to add a point · drag to adjust · drag out to delete')}</span>
            <HelpBadge k="curves.editor" />
          </div>
          <div style={{ display: 'flex' }}>
            <MicroLabel text="Shapes" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', rowGap: 6 }}>
            {shape(L('加对比', 'More contrast'), [{ x: 0, y: 0 }, { x: 0.25, y: 0.2 }, { x: 0.75, y: 0.8 }, { x: 1, y: 1 }], ch)}
            {shape(L('降对比', 'Less contrast'), [{ x: 0, y: 0 }, { x: 0.25, y: 0.3 }, { x: 0.75, y: 0.7 }, { x: 1, y: 1 }], ch)}
            {shape(L('褪黑', 'Fade'), [{ x: 0, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 1, y: 0.97 }], ch)}
            {shape(L('提亮暗部', 'Lift shadows'), [{ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, { x: 1, y: 1 }], ch)}
            <span style={{ flex: 1 }} />
            {shape(L('重置', 'Reset'), identityCurve(), ch)}
          </div>
        </div>
      )}
    </Pager>
  )
}

export function CurveEditor({ points, onChange, color, histogram }: { points: CurvePoint[]; onChange: (p: CurvePoint[]) => void; color: string; histogram: number[] | null }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const drag = useRef<{ index: number | null; removed: boolean }>({ index: null, removed: false })
  const animHist = useAnimatedArray(histogram)
  const size = width

  const handle = (clientX: number, clientY: number, first: boolean) => {
    const r = ref.current!.getBoundingClientRect()
    if (r.width <= 0 || drag.current.removed) return
    const px = (clientX - r.left) / r.width
    const py = 1 - (clientY - r.top) / r.height
    let pts = points
    if (first) {
      let best = -1
      let bestD = Infinity
      pts.forEach((p, i) => {
        const d = Math.hypot((p.x - px) * r.width, (p.y - py) * r.height)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      if (best >= 0 && bestD < 12) {
        drag.current.index = best
        setDragIndex(best)
      } else {
        const x = CM.clamp(px), y = CM.clamp(py)
        if (pts.some((p) => Math.abs(p.x - x) < 0.02)) return
        pts = [...pts]
        let idx = pts.findIndex((p) => p.x > x)
        if (idx < 0) idx = pts.length
        pts.splice(idx, 0, { x, y })
        drag.current.index = idx
        setDragIndex(idx)
        onChange(pts)
        return
      }
    }
    const i = drag.current.index
    if (i == null || i >= pts.length) return
    const outside = py < -0.1 || py > 1.1 || px < -0.1 || px > 1.1
    if (outside && i !== 0 && i !== pts.length - 1 && pts.length > 2) {
      onChange(pts.filter((_, k) => k !== i))
      drag.current = { index: null, removed: true }
      setDragIndex(null)
      return
    }
    const lo = i > 0 ? pts[i - 1].x + 0.01 : 0
    const hi = i < pts.length - 1 ? pts[i + 1].x - 0.01 : 1
    const next = [...pts]
    next[i] = { x: Math.min(Math.max(CM.clamp(px), lo), hi), y: CM.clamp(py) }
    onChange(next)
  }

  const table = curveTable(points)
  let curvePath = ''
  if (size > 0) {
    for (let i = 0; i <= 180; i++) {
      const x = i / 180
      curvePath += `${i ? 'L' : 'M'}${(x * size).toFixed(2)},${((1 - curveValue(table, x)) * size).toFixed(2)}`
    }
  }
  return (
    <div
      ref={ref}
      style={{ position: 'relative', width: '100%', aspectRatio: '1', background: 'white', boxShadow: 'inset 0 0 0 0.5px var(--line-strong)', touchAction: 'none' }}
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { index: null, removed: false }
        handle(e.clientX, e.clientY, true)
      }}
      onPointerMove={(e) => e.buttons & 1 && handle(e.clientX, e.clientY, false)}
      onPointerUp={() => {
        drag.current = { index: null, removed: false }
        setDragIndex(null)
      }}
    >
      {size > 0 && (
        <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
          {animHist && <path d={histPath(animHist, size, size, true)} fill="rgba(29,29,31,0.06)" />}
          {[1, 2, 3].map((i) => (
            <path key={i} d={`M${(size * i) / 4} 0 V${size} M0 ${(size * i) / 4} H${size}`} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />
          ))}
          <path d={`M0 ${size} L${size} 0`} stroke="rgba(0,0,0,0.1)" strokeWidth={0.5} strokeDasharray="3 3" />
          <path d={curvePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => {
            const r = i === dragIndex ? 5.5 : 4
            const cx = p.x * size, cy = (1 - p.y) * size
            return <rect key={i} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={i === dragIndex ? color : 'white'} stroke={color} strokeWidth={1.2} />
          })}
        </svg>
      )}
      {dragIndex != null && dragIndex < points.length && (
        <div
          className="glass mono"
          style={{ position: 'absolute', left: 8, top: 8, height: 18, padding: '0 7px', borderRadius: 9, fontSize: 10, fontWeight: 500, display: 'flex', alignItems: 'center' }}
        >
          {Math.floor(points[dragIndex].x * 255)} → {Math.floor(points[dragIndex].y * 255)}
        </div>
      )}
    </div>
  )
}

// MARK: - 色阶（直接拖动直方图下面的三个滑块，和 PS 一样）

export function LevelsPanel({ params, set }: { params: LevelsParams; set: (p: LevelsParams) => void }) {
  const [channel, setChannel] = useState(0)
  const histogram = useDoc((d) => d.histogram)
  const keys: (keyof LevelsParams)[] = ['master', 'red', 'green', 'blue']
  const hist = (i: number) => (histogram ? [histogram.luma, histogram.red, histogram.green, histogram.blue][i] : null)
  const latest = useRef(params)
  latest.current = params
  const setCh = (i: number, c: LevelsChannel) => set({ ...latest.current, [keys[i]]: c })

  const animateChannel = (i: number, to: LevelsChannel) => {
    const from = latest.current[keys[i]]
    tween(520, (t) => 1 - Math.pow(1 - t, 3), (k) =>
      setCh(i, {
        inBlack: Math.round(from.inBlack + (to.inBlack - from.inBlack) * k),
        inWhite: Math.round(from.inWhite + (to.inWhite - from.inWhite) * k),
        gamma: Math.round((from.gamma + (to.gamma - from.gamma) * k) * 100) / 100,
        outBlack: Math.round(from.outBlack + (to.outBlack - from.outBlack) * k),
        outWhite: Math.round(from.outWhite + (to.outWhite - from.outWhite) * k),
      }),
    )
  }

  const autoLevels = () => {
    const h = histogram?.lumaCounts
    if (!h) return
    const total = h.reduce((a, b) => a + b, 0)
    if (total <= 0) return
    const cut = total * 0.003
    let acc = 0, lo = 0, hi = 255
    for (let i = 0; i < 256; i++) {
      acc += h[i]
      if (acc > cut) {
        lo = i
        break
      }
    }
    acc = 0
    for (let i = 255; i >= 0; i--) {
      acc += h[i]
      if (acc > cut) {
        hi = i
        break
      }
    }
    if (hi - lo < 10) return
    setChannel(0)
    animateChannel(0, { ...latest.current.master, inBlack: lo, inWhite: hi, gamma: 1 })
  }

  return (
    <Pager tabs={['RGB', L('红', 'Red'), L('绿', 'Green'), L('蓝', 'Blue')]} selection={channel} onSelect={setChannel}>
      {(i) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MicroLabel text="Input" />
            <HelpBadge k="levels.handles" />
          </div>
          <LevelsInput channel={params[keys[i]]} onChange={(c) => setCh(i, c)} histogram={hist(i)} />
          <div style={{ display: 'flex' }}>
            <MicroLabel text="Output" />
          </div>
          <LevelsOutput channel={params[keys[i]]} onChange={(c) => setCh(i, c)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4 }}>
            <GlassButton onClick={autoLevels}>{L('自动', 'Auto')}</GlassButton>
            <HelpBadge k="levels.auto" />
            <span style={{ flex: 1 }} />
            <TextLink onClick={() => animateChannel(i, defaultLevelsChannel())}>{L('重置此通道', 'Reset channel')}</TextLink>
          </div>
        </div>
      )}
    </Pager>
  )
}

/** 三角形滑块 */
function LevelHandle({ fill, x, y, onDrag }: { fill: string; x: number; y: number; onDrag: (clientX: number) => void }) {
  return (
    <div
      style={{ position: 'absolute', left: x - 6 - 8, top: y - 8, width: 12 + 16, height: 10 + 16, touchAction: 'none', display: 'grid', placeItems: 'center' }}
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        onDrag(e.clientX)
      }}
      onPointerMove={(e) => e.buttons & 1 && onDrag(e.clientX)}
    >
      <svg width={12} height={10} style={{ overflow: 'visible' }}>
        <path d="M6 0 L12 10 L0 10 Z" fill={fill} stroke="var(--text)" strokeWidth={0.8} strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function LevelsInput({ channel, onChange, histogram }: { channel: LevelsChannel; onChange: (c: LevelsChannel) => void; histogram: number[] | null }) {
  const [ref, { width: w }] = useSize<HTMLDivElement>()
  const animHist = useAnimatedArray(histogram)
  const mid = channel.inBlack + (channel.inWhite - channel.inBlack) * Math.pow(0.5, channel.gamma)
  const toV = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.round(CM.clamp((clientX - r.left) / r.width) * 255)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', height: 70, background: 'white', boxShadow: 'inset 0 0 0 0.5px var(--line-strong)' }}>
        {animHist && w > 0 && (
          <svg width={w} height={70} style={{ position: 'absolute', inset: 0 }}>
            <path d={histPath(animHist, w, 70, true)} fill="rgba(29,29,31,0.16)" />
          </svg>
        )}
        {/* 被裁掉的两端 */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: (channel.inBlack / 255) * w, background: 'rgba(29,29,31,0.06)' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: (channel.inWhite / 255) * w, right: 0, background: 'rgba(29,29,31,0.06)' }} />
      </div>
      <div ref={ref} style={{ position: 'relative', height: 18 }}>
        <div style={{ height: 4, background: 'linear-gradient(to right, black, white)', boxShadow: 'inset 0 0 0 0.5px var(--line)' }} />
        <LevelHandle fill="black" x={(channel.inBlack / 255) * w} y={6} onDrag={(x) => onChange({ ...channel, inBlack: Math.min(toV(x), channel.inWhite - 3) })} />
        <LevelHandle
          fill={gray(0.55)}
          x={(mid / 255) * w}
          y={6}
          onDrag={(x) => {
            const range = Math.max(1, channel.inWhite - channel.inBlack)
            const p = CM.clamp((toV(x) - channel.inBlack) / range, 0.13, 0.93)
            onChange({ ...channel, gamma: Math.round((Math.log(p) / Math.log(0.5)) * 100) / 100 })
          }}
        />
        <LevelHandle fill="white" x={(channel.inWhite / 255) * w} y={6} onDrag={(x) => onChange({ ...channel, inWhite: Math.max(toV(x), channel.inBlack + 3) })} />
      </div>
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text2)' }}>
        <span>{Math.floor(channel.inBlack)}</span>
        <span>{channel.gamma.toFixed(2)}</span>
        <span>{Math.floor(channel.inWhite)}</span>
      </div>
    </div>
  )
}

function LevelsOutput({ channel, onChange }: { channel: LevelsChannel; onChange: (c: LevelsChannel) => void }) {
  const [ref, { width: w }] = useSize<HTMLDivElement>()
  const toV = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.round(CM.clamp((clientX - r.left) / r.width) * 255)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div ref={ref} style={{ position: 'relative', height: 24 }}>
        <div style={{ height: 10, background: 'linear-gradient(to right, black, white)', boxShadow: 'inset 0 0 0 0.5px var(--line)' }} />
        <LevelHandle fill="black" x={(channel.outBlack / 255) * w} y={12} onDrag={(x) => onChange({ ...channel, outBlack: Math.min(toV(x), channel.outWhite) })} />
        <LevelHandle fill="white" x={(channel.outWhite / 255) * w} y={12} onDrag={(x) => onChange({ ...channel, outWhite: Math.max(toV(x), channel.outBlack) })} />
      </div>
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text2)' }}>
        <span>{Math.floor(channel.outBlack)}</span>
        <span>{Math.floor(channel.outWhite)}</span>
      </div>
    </div>
  )
}

// MARK: - 亮度/对比度、曝光度、自然饱和度

export function BrightnessContrastPanel({ params, set }: { params: BrightnessContrastParams; set: (p: BrightnessContrastParams) => void }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <ScrubRow title={L('亮度', 'Brightness')} value={params.brightness} onChange={(v) => set({ ...params, brightness: v })} range={[-150, 150]} help="bc.brightness" hint={Hint.tone} />
      <ScrubRow title={L('对比度', 'Contrast')} value={params.contrast} onChange={(v) => set({ ...params, contrast: v })} range={[-50, 100]} help="bc.contrast" />
    </div>
  )
}

export function ExposurePanel({ params, set }: { params: ExposureParams; set: (p: ExposureParams) => void }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <ScrubRow title={L('曝光度', 'Exposure')} value={params.exposure} onChange={(v) => set({ ...params, exposure: v })} range={[-5, 5]} help="exp.exposure" hint={Hint.tone} decimals={2} />
      <ScrubRow title={L('位移', 'Offset')} value={params.offset} onChange={(v) => set({ ...params, offset: v })} range={[-0.5, 0.5]} help="exp.offset" decimals={3} />
      <ScrubRow title={L('灰度系数', 'Gamma')} value={params.gamma} onChange={(v) => set({ ...params, gamma: v })} range={[0.1, 3]} defaultValue={1} help="exp.gamma" decimals={2} />
    </div>
  )
}

export function VibrancePanel({ params, set }: { params: VibranceParams; set: (p: VibranceParams) => void }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <ScrubRow title={L('自然饱和度', 'Vibrance')} value={params.vibrance} onChange={(v) => set({ ...params, vibrance: v })} range={[-100, 100]} help="basic.vibrance" />
      <ScrubRow title={L('饱和度', 'Saturation')} value={params.saturation} onChange={(v) => set({ ...params, saturation: v })} range={[-100, 100]} help="basic.saturation" />
    </div>
  )
}


function CropPanel() {
  const crop = useDoc((d) => d.state.crop)
  const preview = useDoc((d) => d.previewImage)
  const imageSize = useDoc((d) => d.imageSize)
  const ratios: [string, number | null][] = [
    [L('自由', 'Free'), null],
    ['1:1', 1],
    ['4:5', 4 / 5],
    ['3:2', 3 / 2],
    ['16:9', 16 / 9],
  ]
  const applyAspect = (targetRatio: number | null) => {
    if (!targetRatio) {
      doc.setCrop({ x: 0, y: 0, width: 1, height: 1 })
      return
    }
    const imgW = Math.max(1, preview?.width ?? imageSize.width)
    const imgH = Math.max(1, preview?.height ?? imageSize.height)
    const currentRatio = imgW / imgH
    let w = 1, h = 1
    if (targetRatio > currentRatio) h = currentRatio / targetRatio
    else w = targetRatio / currentRatio
    doc.setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h })
  }
  return (
    <div>
      <div style={{ display: 'flex', padding: '12px 18px 0 18px' }}>
        <MicroLabel text="Transform" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 18px' }}>
        <BareIcon icon="rotate.left" size={30} onClick={() => doc.setCrop({ quarterTurns: (crop.quarterTurns + 3) % 4 })} help={L('逆时针旋转 90°', 'Rotate 90° CCW')} />
        <BareIcon icon="rotate.right" size={30} onClick={() => doc.setCrop({ quarterTurns: (crop.quarterTurns + 1) % 4 })} help={L('顺时针旋转 90°', 'Rotate 90° CW')} />
        <BareIcon icon="flip.h" size={30} active={crop.flipH} onClick={() => doc.setCrop({ flipH: !crop.flipH })} help={L('水平翻转', 'Flip Horizontal')} />
        <BareIcon icon="flip.v" size={30} active={crop.flipV} onClick={() => doc.setCrop({ flipV: !crop.flipV })} help={L('垂直翻转', 'Flip Vertical')} />
        <span style={{ flex: 1 }} />
        <GlassButton disabled={cropIsIdentity(crop)} onClick={() => doc.resetCrop()}>{L('重置', 'Reset')}</GlassButton>
      </div>
      <ScrubRow title={L('水平拉直', 'Straighten')} value={crop.straighten} onChange={(v) => doc.setCrop({ straighten: v })} range={[-45, 45]} defaultValue={0} decimals={1} suffix="°" />
      <ScrubRow title={L('垂直透视', 'Vertical Keystone')} value={crop.perspectiveV} onChange={(v) => doc.setCrop({ perspectiveV: v })} range={[-45, 45]} defaultValue={0} decimals={1} />
      <ScrubRow title={L('水平透视', 'Horizontal Keystone')} value={crop.perspectiveH} onChange={(v) => doc.setCrop({ perspectiveH: v })} range={[-45, 45]} defaultValue={0} decimals={1} />
      <div style={{ display: 'flex', padding: '12px 18px 0 18px' }}>
        <MicroLabel text="Aspect Ratio" />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 18px' }}>
        {ratios.map(([label, r]) => (
          <GlassButton key={label} onClick={() => applyAspect(r)}>{label}</GlassButton>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 18px' }}>
        <GlassButton prominent onClick={() => doc.setActiveBasicTab(0)}>{L('完成裁剪', 'Done')}</GlassButton>
      </div>
    </div>
  )
}
