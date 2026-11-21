import { useRef, useState } from 'react'
import { spring, springTransition } from '../../anim'
import { CM, muted } from '../../engine/colormath'
import { L } from '../../i18n'
import { doc, useDoc } from '../../model/doc'
import {
  ColorGradingParams, cssColor, GradientMapParams, GradientStop, LUTParams, PosterizeParams, RGBColor, rgbHex, ThresholdParams, ToneWheel, uuid,
} from '../../model/types'
import { ColorWell, ColorWheel, GlassButton, HelpBadge, Hint, InkToggleRow, MicroLabel, NoteText, Pager, ScrubRow } from '../kit'
import { FocusSwap, useSize } from '../motion'

// MARK: - 渐变映射：直接在渐变条上点击添加、拖动、拖离删除色标

function colorAt(stops: GradientStop[], t: number): RGBColor {
  const s = [...stops].sort((a, b) => a.position - b.position)
  if (!s.length) return { r: 0, g: 0, b: 0 }
  if (t <= s[0].position) return s[0].color
  if (t >= s[s.length - 1].position) return s[s.length - 1].color
  for (let i = 0; i < s.length - 1; i++) {
    if (t >= s[i].position && t <= s[i + 1].position) {
      const k = (t - s[i].position) / Math.max(s[i + 1].position - s[i].position, 1e-6)
      const a = s[i].color, b = s[i + 1].color
      return { r: CM.mix(a.r, b.r, k), g: CM.mix(a.g, b.g, k), b: CM.mix(a.b, b.b, k) }
    }
  }
  return s[s.length - 1].color
}

const gradientCSS = (stops: GradientStop[], reverse: boolean) => {
  const s = [...stops].sort((a, b) => a.position - b.position)
  return `linear-gradient(to ${reverse ? 'left' : 'right'}, ${s.map((x) => `${cssColor(x.color)} ${(x.position * 100).toFixed(2)}%`).join(', ')})`
}

export function GradientMapPanel({ params, set }: { params: GradientMapParams; set: (p: GradientMapParams) => void }) {
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const presets: [string, [number, number][]][] = [
    [L('黑白', 'Black & White'), [[0, 0x000000], [1, 0xffffff]]],
    [L('棕褐', 'Sepia'), [[0, 0x1e120a], [0.55, 0x8c6a45], [1, 0xf5e6c8]]],
    [L('青橙', 'Teal/Orange'), [[0, 0x0b2733], [0.5, 0x5e7c7a], [1, 0xffc27a]]],
    [L('紫粉', 'Violet/Pink'), [[0, 0x1a0b3d], [0.5, 0xc2378f], [1, 0xffd3e6]]],
    [L('冷夜', 'Cold Night'), [[0, 0x050b1c], [0.6, 0x3a5a8c], [1, 0xdde8ff]]],
    [L('暖金', 'Warm Gold'), [[0, 0x2b1600], [0.5, 0xb5762a], [1, 0xfff2cc]]],
    [L('墨绿', 'Deep Green'), [[0, 0x08140f], [0.5, 0x4e6b55], [1, 0xeef2e2]]],
    [L('铜版', 'Copper'), [[0, 0x120a08], [0.5, 0x7a4e3c], [1, 0xf6e2d3]]],
  ]
  const selected = params.stops.find((s) => s.id === selectedID) ?? null
  const updateStop = (id: string, patch: Partial<GradientStop>) => set({ ...params, stops: params.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px 0 18px' }}>
        <MicroLabel text="Gradient" />
        <HelpBadge k="gm.stops" />
      </div>
      <div style={{ padding: '10px 18px 0 18px' }}>
        <GradientEditorBar params={params} set={set} selectedID={selectedID} setSelectedID={setSelectedID} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 18px', fontSize: 10, color: 'var(--text3)' }}>
        <span>{L('暗部', 'Shadows')}</span>
        <span>{L('亮部', 'Highlights')}</span>
      </div>
      <FocusSwap swapKey={selected ? selected.id : 'none'} style={{ padding: '4px 0' }}>
        {selected ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ paddingLeft: 18 }}>
              <ColorWell color={selected.color} onChange={(c) => updateStop(selected.id, { color: c })} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScrubRow
                title={L('位置', 'Position')}
                value={selected.position * 100}
                onChange={(v) => updateStop(selected.id, { position: v / 100 })}
                range={[0, 100]}
                defaultValue={selected.position * 100}
                help="gm.position"
                hint={Hint.tone}
                suffix="%"
              />
            </div>
          </div>
        ) : (
          <NoteText>{L('点渐变条添加色标，点色标可改颜色，把色标往下拖离即可删除。', 'Click the bar to add a stop, click a stop to change its color, drag a stop down and away to delete it.')}</NoteText>
        )}
      </FocusSwap>
      <div style={{ display: 'flex', padding: '8px 18px 0 18px' }}>
        <MicroLabel text="Presets" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 8px', padding: '10px 18px' }}>
        {presets.map(([name, stops]) => {
          const gs = stops.map(([p, h]) => ({ id: '', position: p, color: rgbHex(h) }))
          return (
            <button
              key={name}
              onClick={() => {
                set({ ...params, stops: stops.map(([p, h]) => ({ id: uuid(), position: p, color: rgbHex(h) })) })
                setSelectedID(null)
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}
            >
              <span style={{ height: 14, background: gradientCSS(gs, false), boxShadow: 'inset 0 0 0 0.5px var(--line)' }} />
              <span style={{ fontSize: 10, color: 'var(--text2)', textAlign: 'left', whiteSpace: 'nowrap' }}>{name}</span>
            </button>
          )
        })}
      </div>
      <InkToggleRow title={L('反向', 'Reverse')} on={params.reverse} onChange={(v) => set({ ...params, reverse: v })} help="gm.reverse" />
    </div>
  )
}

function GradientEditorBar({ params, set, selectedID, setSelectedID }: {
  params: GradientMapParams; set: (p: GradientMapParams) => void; selectedID: string | null; setSelectedID: (id: string | null) => void
}) {
  const [ref, { width: w }] = useSize<HTMLDivElement>()
  const [removing, setRemoving] = useState<string | null>(null)
  const latest = useRef(params)
  latest.current = params
  return (
    <div ref={ref} style={{ position: 'relative', height: 50 }}>
      <div
        style={{ height: 26, background: gradientCSS(params.stops, params.reverse), boxShadow: 'inset 0 0 0 0.5px var(--line-strong)' }}
        onClick={(e) => {
          if (params.stops.length >= 8) return
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const pos = CM.clamp((e.clientX - r.left) / r.width)
          const stop = { id: uuid(), position: pos, color: colorAt(params.stops, pos) }
          set({ ...params, stops: [...params.stops, stop] })
          setSelectedID(stop.id)
        }}
      />
      {params.stops.map((stop) => {
        const sel = stop.id === selectedID
        return (
          <div
            key={stop.id}
            style={{
              position: 'absolute', left: stop.position * w - 6.5, top: 26, width: 13, display: 'flex', flexDirection: 'column', alignItems: 'center',
              touchAction: 'none', opacity: removing === stop.id ? 0.25 : 1,
              transform: `scale(${sel ? 1.15 : 1})`,
              transition: springTransition(['transform'], spring(0.3, 0.75)) + ', opacity 0.15s ease-out',
            }}
            onPointerDown={(e) => {
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              setSelectedID(stop.id)
            }}
            onPointerMove={(e) => {
              if (!(e.buttons & 1)) return
              const r = ref.current!.getBoundingClientRect()
              const pos = CM.clamp((e.clientX - r.left) / r.width)
              const p = latest.current
              set({ ...p, stops: p.stops.map((s) => (s.id === stop.id ? { ...s, position: pos } : s)) })
              const away = e.clientY - r.top > 70 && p.stops.length > 2
              if (away !== (removing === stop.id)) setRemoving(away ? stop.id : null)
            }}
            onPointerUp={() => {
              if (removing === stop.id) {
                const p = latest.current
                set({ ...p, stops: p.stops.filter((s) => s.id !== stop.id) })
                setSelectedID(null)
                setRemoving(null)
              }
            }}
          >
            <span style={{ width: 0.5, height: 6, background: 'rgba(29,29,31,0.5)' }} />
            <span
              style={{
                width: 13, height: 13, background: cssColor(stop.color),
                boxShadow: `inset 0 0 0 ${sel ? 1.6 : 0.8}px var(--text), inset 0 0 0 ${sel ? 2.2 : 1.4}px white`,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// MARK: - 颜色分级

export function ColorGradingPanel({ params, set }: { params: ColorGradingParams; set: (p: ColorGradingParams) => void }) {
  const [tab, setTab] = useState(1)
  const keys: ('shadows' | 'midtones' | 'highlights' | 'global')[] = ['shadows', 'midtones', 'highlights', 'global']
  const latest = useRef(params)
  latest.current = params
  const setWheel = (k: (typeof keys)[number], patch: Partial<ToneWheel>) => set({ ...latest.current, [k]: { ...latest.current[k], ...patch } })
  const overview: [string, ToneWheel][] = [
    [L('阴影', 'Shadows'), params.shadows], [L('中间调', 'Midtones'), params.midtones],
    [L('高光', 'Highlights'), params.highlights], [L('全局', 'Global'), params.global],
  ]
  return (
    <Pager tabs={[L('阴影', 'Shadows'), L('中间调', 'Midtones'), L('高光', 'Highlights'), L('全局', 'Global'), L('混合', 'Blend')]} selection={tab} onSelect={setTab}>
      {(t) => {
        if (t === 4) {
          return (
            <div>
              <ScrubRow title={L('混合', 'Blend')} value={params.blending} onChange={(v) => set({ ...params, blending: v })} range={[0, 100]} defaultValue={50} help="cg.blending" />
              <ScrubRow title={L('平衡', 'Balance')} value={params.balance} onChange={(v) => set({ ...params, balance: v })} range={[-100, 100]} help="cg.balance" hint={Hint.tone} />
              <div style={{ display: 'flex', padding: '16px 18px' }}>
                {overview.map(([name, w]) => (
                  <div key={name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 26, height: 26, borderRadius: '50%', boxShadow: 'inset 0 0 0 0.5px var(--line)',
                        background: w.saturation < 1 ? 'rgb(230,230,230)' : muted(w.hue, Math.max(0.15, (w.saturation / 100) * 0.7), 0.88),
                      }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        }
        const k = keys[t]
        const w = params[k]
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
              <div style={{ position: 'relative' }}>
                <ColorWheel hue={w.hue} saturation={w.saturation} onChange={(hue, saturation) => setWheel(k, { hue, saturation })} />
                <HelpBadge k="cg.wheel" style={{ position: 'absolute', right: -14, top: -2 }} />
              </div>
            </div>
            <ScrubRow title={L('色相', 'Hue')} value={w.hue} onChange={(v) => setWheel(k, { hue: v })} range={[0, 360]} help="cg.hue" hint={Hint.spectrum()} suffix="°" />
            <ScrubRow title={L('强度', 'Strength')} value={w.saturation} onChange={(v) => setWheel(k, { saturation: v })} range={[0, 100]} help="cg.saturation" />
            <ScrubRow title={L('明亮度', 'Luminance')} value={w.luminance} onChange={(v) => setWheel(k, { luminance: v })} range={[-100, 100]} help="cg.luminance" hint={Hint.tone} />
          </div>
        )
      }}
    </Pager>
  )
}

// MARK: - 色调分离 / 阈值 / LUT

export function PosterizePanel({ params, set }: { params: PosterizeParams; set: (p: PosterizeParams) => void }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <ScrubRow title={L('色阶数', 'Levels')} value={params.levels} onChange={(v) => set({ levels: v })} range={[2, 32]} defaultValue={6} help="poster.levels" />
    </div>
  )
}

export function ThresholdPanel({ params, set }: { params: ThresholdParams; set: (p: ThresholdParams) => void }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <ScrubRow title={L('阈值色阶', 'Threshold level')} value={params.level} onChange={(v) => set({ level: v })} range={[1, 255]} defaultValue={128} help="threshold.level" hint={Hint.tone} />
      <NoteText>{L('把这个图层的不透明度降到 20% 左右，可以给照片一种版画般的力量感。', "Drop this layer's opacity to around 20% for a bold, printmaking-like punch.")}</NoteText>
    </div>
  )
}

export function LUTPanel({ layerID, params, set }: { layerID: string; params: LUTParams; set: (p: LUTParams) => void }) {
  const info = useDoc((d) => d.lutInfo(params.path))
  const status = !params.path
    ? L('3D .cube 格式，达芬奇、PR、PS 通用', '3D .cube — works in Resolve, Premiere and Photoshop')
    : info
      ? L(`${info.size}³ · 已载入`, `${info.size}³ · loaded`)
      : L('文件找不到了，请重新选择', 'File not found — please choose again')
  return (
    <div style={{ padding: '6px 0' }}>
      <FileRow
        title={params.path == null ? L('未选择 LUT', 'No LUT selected') : params.displayName}
        subtitle={status}
        buttonTitle={params.path == null ? L('选择…', 'Choose…') : L('更换…', 'Change…')}
        onClick={() => doc.chooseLUT(layerID)}
      />
      <ScrubRow title={L('强度', 'Strength')} value={params.intensity} onChange={(v) => set({ ...params, intensity: v })} range={[0, 100]} defaultValue={100} help="lut.intensity" suffix="%" />
    </div>
  )
}

/** 文件 / 参考图一行 */
export function FileRow({ title, subtitle, buttonTitle, onClick }: { title: string; subtitle: string; buttonTitle: string; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{subtitle}</div>
      </div>
      <GlassButton onClick={onClick}>{buttonTitle}</GlassButton>
    </div>
  )
}
