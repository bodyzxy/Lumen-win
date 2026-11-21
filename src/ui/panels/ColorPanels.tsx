import { useEffect, useState } from 'react'
import { tween } from '../../anim'
import { gray, muted } from '../../engine/colormath'
import { L } from '../../i18n'
import {
  BlackWhiteParams, bwNames, ChannelMixerParams, ColorBalanceParams, cssColor, deepEqual, HSLParams, hslCenters, hslNames,
  HueSatParams, PhotoFilterParams, rgbHex, selectiveNames, SelectiveColorParams,
} from '../../model/types'
import { ColorChip, ColorWell, HelpBadge, Hint, InkSegment, InkToggleRow, MicroLabel, Pager, ScrubRow, TextLink } from '../kit'
import { FocusSwap } from '../motion'

const setAt = (arr: number[], i: number, v: number) => arr.map((x, k) => (k === i ? v : x))

// MARK: - 色相/饱和度

export function HueSatPanel({ params, set }: { params: HueSatParams; set: (p: HueSatParams) => void }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <InkToggleRow title={L('着色（变成单一色调）', 'Colorize (single tone)')} on={params.colorize} onChange={(v) => set({ ...params, colorize: v })} help="hs.colorize" />
      <FocusSwap swapKey={params.colorize ? 'c' : 'n'}>
        {params.colorize ? (
          <div>
            <ScrubRow title={L('着色色相', 'Colorize hue')} value={params.colorizeHue} onChange={(v) => set({ ...params, colorizeHue: v })} range={[0, 360]} defaultValue={30} help="hs.colorizeHue" hint={Hint.spectrum()} suffix="°" />
            <ScrubRow title={L('着色饱和度', 'Colorize saturation')} value={params.colorizeSaturation} onChange={(v) => set({ ...params, colorizeSaturation: v })} range={[0, 100]} defaultValue={25} help="hs.colorizeSat" />
          </div>
        ) : (
          <div>
            <ScrubRow title={L('色相', 'Hue')} value={params.hue} onChange={(v) => set({ ...params, hue: v })} range={[-180, 180]} help="hs.hue" hint={Hint.spectrum(180, 540)} suffix="°" />
            <ScrubRow title={L('饱和度', 'Saturation')} value={params.saturation} onChange={(v) => set({ ...params, saturation: v })} range={[-100, 100]} help="hs.saturation" />
          </div>
        )}
      </FocusSwap>
      <ScrubRow title={L('明度', 'Lightness')} value={params.lightness} onChange={(v) => set({ ...params, lightness: v })} range={[-100, 100]} help="hs.lightness" hint={Hint.tone} />
    </div>
  )
}

// MARK: - HSL 混色器

export function HSLPanel({ params, set }: { params: HSLParams; set: (p: HSLParams) => void }) {
  const [tab, setTab] = useState(0)
  const keys: (keyof HSLParams)[] = ['hue', 'saturation', 'luminance']
  const hint = (t: number, i: number) => {
    const h = hslCenters[i]
    if (t === 0) return [muted(h - 30), muted(h), muted(h + 30)]
    if (t === 1) return [muted(h, 0.05), muted(h, 0.6)]
    return [muted(h, 0.5, 0.35), muted(h), muted(h, 0.15, 1)]
  }
  return (
    <Pager tabs={[L('色相', 'Hue'), L('饱和度', 'Saturation'), L('明亮度', 'Luminance')]} selection={tab} onSelect={setTab}>
      {(t) => (
        <div>
          {hslNames().map((name, i) => (
            <ScrubRow
              key={i}
              title={name}
              value={params[keys[t]][i]}
              onChange={(v) => set({ ...params, [keys[t]]: setAt(params[keys[t]], i, v) })}
              range={[-100, 100]}
              help={['hsl.hue', 'hsl.saturation', 'hsl.luminance'][t]}
              hint={hint(t, i)}
              dot={muted(hslCenters[i], 0.6, 0.85)}
            />
          ))}
        </div>
      )}
    </Pager>
  )
}

// MARK: - 色彩平衡

export function ColorBalancePanel({ params, set }: { params: ColorBalanceParams; set: (p: ColorBalanceParams) => void }) {
  const [tone, setTone] = useState(1)
  const keys: ('shadows' | 'midtones' | 'highlights')[] = ['shadows', 'midtones', 'highlights']
  return (
    <div>
      <Pager tabs={[L('阴影', 'Shadows'), L('中间调', 'Midtones'), L('高光', 'Highlights')]} selection={tone} onSelect={setTone}>
        {(t) => {
          const arr = params[keys[t]]
          const s = (i: number) => (v: number) => set({ ...params, [keys[t]]: setAt(arr, i, v) })
          return (
            <div>
              <ScrubRow title={L('青色 ↔ 红色', 'Cyan ↔ Red')} value={arr[0]} onChange={s(0)} range={[-100, 100]} help="cb.cyanRed" hint={Hint.cyanRed} />
              <ScrubRow title={L('洋红 ↔ 绿色', 'Magenta ↔ Green')} value={arr[1]} onChange={s(1)} range={[-100, 100]} help="cb.magentaGreen" hint={Hint.magentaGreen} />
              <ScrubRow title={L('黄色 ↔ 蓝色', 'Yellow ↔ Blue')} value={arr[2]} onChange={s(2)} range={[-100, 100]} help="cb.yellowBlue" hint={Hint.yellowBlue} />
            </div>
          )
        }}
      </Pager>
      <div className="hairline-h" />
      <InkToggleRow title={L('保持明度', 'Preserve luminosity')} on={params.preserveLuminosity} onChange={(v) => set({ ...params, preserveLuminosity: v })} help="cb.preserve" />
    </div>
  )
}

// MARK: - 可选颜色

const selectiveChips = [
  'rgb(219,77,71)', 'rgb(235,209,77)', 'rgb(77,173,97)', 'rgb(77,184,199)', 'rgb(77,107,209)',
  'rgb(199,87,184)', gray(0.98), gray(0.6), gray(0.1),
]

export function SelectiveColorPanel({ params, set }: { params: SelectiveColorParams; set: (p: SelectiveColorParams) => void }) {
  const [group, setGroup] = useState(0)
  const g = params.groups[group]
  const setG = (i: number) => (v: number) => set({ ...params, groups: params.groups.map((x, k) => (k === group ? setAt(x, i, v) : x)) })
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px 0 18px' }}>
        <MicroLabel text="Colors" trailing={selectiveNames()[group]} />
        <HelpBadge k="sc.group" />
      </div>
      <div style={{ display: 'flex', padding: '6px 14px' }}>
        {selectiveChips.map((c, i) => (
          <ColorChip key={i} color={c} selected={group === i} modified={!deepEqual(params.groups[i], [0, 0, 0, 0])} onClick={() => setGroup(i)} />
        ))}
      </div>
      <FocusSwap swapKey={String(group)}>
        <div>
          <ScrubRow title={L('青色', 'Cyan')} value={g[0]} onChange={setG(0)} range={[-100, 100]} help="sc.cyan" hint={[...Hint.cyanRed].reverse()} suffix="%" />
          <ScrubRow title={L('洋红', 'Magenta')} value={g[1]} onChange={setG(1)} range={[-100, 100]} help="sc.magenta" hint={[...Hint.magentaGreen].reverse()} suffix="%" />
          <ScrubRow title={L('黄色', 'Yellow')} value={g[2]} onChange={setG(2)} range={[-100, 100]} help="sc.yellow" hint={[...Hint.yellowBlue].reverse()} suffix="%" />
          <ScrubRow title={L('黑色', 'Black')} value={g[3]} onChange={setG(3)} range={[-100, 100]} help="sc.black" hint={[gray(0.95), gray(0.12)]} suffix="%" />
        </div>
      </FocusSwap>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{L('计算方式', 'Method')}</span>
        <HelpBadge k="sc.mode" />
        <span style={{ flex: 1 }} />
        <InkSegment items={[[true, L('相对', 'Relative')], [false, L('绝对', 'Absolute')]]} selection={params.relative} onSelect={(v) => set({ ...params, relative: v })} style={{ width: 120 }} />
      </div>
    </div>
  )
}

// MARK: - 通道混合器

export function ChannelMixerPanel({ params, set }: { params: ChannelMixerParams; set: (p: ChannelMixerParams) => void }) {
  const [output, setOutput] = useState(0)
  useEffect(() => setOutput(0), [params.monochrome])
  const key = (o: number): 'gray' | 'red' | 'green' | 'blue' => (params.monochrome ? 'gray' : (['red', 'green', 'blue'] as const)[Math.min(o, 2)])
  const defaults = (o: number) => (params.monochrome ? [40, 40, 20, 0] : [[100, 0, 0, 0], [0, 100, 0, 0], [0, 0, 100, 0]][Math.min(o, 2)])
  return (
    <div>
      <InkToggleRow title={L('单色（输出黑白）', 'Monochrome (black & white output)')} on={params.monochrome} onChange={(v) => set({ ...params, monochrome: v })} help="cm.mono" />
      <div className="hairline-h" />
      <Pager
        tabs={params.monochrome ? [L('灰色', 'Gray')] : [L('输出 红', 'Red out'), L('输出 绿', 'Green out'), L('输出 蓝', 'Blue out')]}
        selection={output}
        onSelect={setOutput}
      >
        {(o) => {
          const k = key(o)
          const r = params[k]
          const d = defaults(o)
          const s = (i: number) => (v: number) => set({ ...params, [k]: setAt(r, i, v) })
          const t = Math.round(r[0] + r[1] + r[2])
          const ok = Math.abs(t - 100) <= 5
          return (
            <div>
              <ScrubRow title={L('红色', 'Red')} value={r[0]} onChange={s(0)} range={[-200, 200]} defaultValue={d[0]} help="cm.red" suffix="%" dot="rgb(219,77,71)" />
              <ScrubRow title={L('绿色', 'Green')} value={r[1]} onChange={s(1)} range={[-200, 200]} defaultValue={d[1]} help="cm.green" suffix="%" dot="rgb(77,173,97)" />
              <ScrubRow title={L('蓝色', 'Blue')} value={r[2]} onChange={s(2)} range={[-200, 200]} defaultValue={d[2]} help="cm.blue" suffix="%" dot="rgb(77,107,209)" />
              <ScrubRow title={L('常数', 'Constant')} value={r[3]} onChange={s(3)} range={[-200, 200]} help="cm.constant" suffix="%" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{L('合计', 'Total')}</span>
                <span className="mono" style={{ fontSize: 11.5, fontWeight: 500 }}>{t}%</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: ok ? 'var(--text3)' : 'var(--text)' }}>
                  {ok ? L('亮度与原图接近', 'Brightness matches the original') : t > 100 ? L('会比原图亮', 'Brighter than the original') : L('会比原图暗', 'Darker than the original')}
                </span>
              </div>
            </div>
          )
        }}
      </Pager>
    </div>
  )
}

// MARK: - 黑白

export function BlackWhitePanel({ params, set }: { params: BlackWhiteParams; set: (p: BlackWhiteParams) => void }) {
  const [tab, setTab] = useState(0)
  const keys = ['bw.red', 'bw.yellow', 'bw.green', 'bw.cyan', 'bw.blue', 'bw.magenta']
  const hues = [0, 60, 120, 180, 240, 300]
  const defaults = [40, 60, 40, 60, 20, 80]
  const presets: [string, number[]][] = [
    [L('默认', 'Default'), [40, 60, 40, 60, 20, 80]],
    [L('红滤镜', 'Red'), [120, 110, -10, -50, -50, 120]],
    [L('黄滤镜', 'Yellow'), [120, 110, 40, -30, -40, 70]],
    [L('绿滤镜', 'Green'), [-40, 120, 120, -50, -50, -40]],
    [L('蓝滤镜', 'Blue'), [-50, -50, -30, 110, 130, 110]],
    [L('红外', 'Infrared'), [-40, 235, 144, -68, -3, -107]],
  ]
  const applyWeights = (to: number[]) => {
    const from = params.weights
    tween(480, (t) => 1 - Math.pow(1 - t, 3), (k) => set({ ...params, weights: to.map((v, i) => Math.round(from[i] + (v - from[i]) * k)) }))
  }
  return (
    <Pager tabs={[L('颜色', 'Colors'), L('色调', 'Tone')]} selection={tab} onSelect={setTab}>
      {(t) =>
        t === 0 ? (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 18px' }}>
              <div style={{ display: 'flex' }}>
                <MicroLabel text="Filters" />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {presets.map(([n, w]) => (
                  <TextLink key={n} onClick={() => applyWeights(w)}>
                    {n}
                  </TextLink>
                ))}
              </div>
            </div>
            {bwNames().map((name, i) => (
              <ScrubRow
                key={i}
                title={name}
                value={params.weights[i]}
                onChange={(v) => set({ ...params, weights: setAt(params.weights, i, v) })}
                range={[-200, 300]}
                defaultValue={defaults[i]}
                help={keys[i]}
                hint={[gray(0.1), muted(hues[i], 0.55), gray(0.98)]}
                suffix="%"
              />
            ))}
          </div>
        ) : (
          <div>
            <InkToggleRow title={L('给黑白染色', 'Tint the black & white')} on={params.tint} onChange={(v) => set({ ...params, tint: v })} help="bw.tint" />
            <ScrubRow title={L('色相', 'Hue')} value={params.tintHue} onChange={(v) => set({ ...params, tintHue: v })} range={[0, 360]} defaultValue={35} help="bw.tintHue" hint={Hint.spectrum()} suffix="°" />
            <ScrubRow title={L('饱和度', 'Saturation')} value={params.tintSaturation} onChange={(v) => set({ ...params, tintSaturation: v })} range={[0, 100]} defaultValue={25} help="bw.tintSat" suffix="%" />
          </div>
        )
      }
    </Pager>
  )
}

// MARK: - 照片滤镜

export function PhotoFilterPanel({ params, set }: { params: PhotoFilterParams; set: (p: PhotoFilterParams) => void }) {
  const presets: [string, number][] = [
    [L('加温 85', 'Warming 85'), 0xec8a00], [L('加温 LBA', 'Warming LBA'), 0xfa9600], [L('冷却 80', 'Cooling 80'), 0x006dff], [L('冷却 LBB', 'Cooling LBB'), 0x005dff],
    [L('深褐', 'Sepia'), 0xac7a33], [L('红', 'Red'), 0xea1a1a], [L('橙', 'Orange'), 0xf38417], [L('黄', 'Yellow'), 0xf9e31c],
    [L('绿', 'Green'), 0x19c919], [L('青', 'Cyan'), 0x1dcbea], [L('蓝', 'Blue'), 0x1d35ea], [L('紫', 'Violet'), 0x9b1dea],
  ]
  const c = params.color
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px 0 18px' }}>
        <MicroLabel text="Filter" />
        <HelpBadge k="pf.color" />
        <ColorWell color={params.color} onChange={(color) => set({ ...params, color })} />
      </div>
      <div style={{ margin: '10px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--line)', boxShadow: '0 0 0 0.5px var(--line)' }}>
        {presets.map(([name, hex]) => {
          const pc = rgbHex(hex)
          const selected = Math.abs(pc.r - c.r) < 1e-3 && Math.abs(pc.g - c.g) < 1e-3 && Math.abs(pc.b - c.b) < 1e-3
          return (
            <button
              key={name}
              onClick={() => set({ ...params, color: pc })}
              style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', background: selected ? 'rgb(240,240,240)' : 'white', transition: 'background-color 0.2s' }}
            >
              <span style={{ height: 18, background: cssColor(pc) }} />
              <span style={{ fontSize: 10, textAlign: 'left', color: selected ? 'var(--text)' : 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{name}</span>
            </button>
          )
        })}
      </div>
      <ScrubRow title={L('浓度', 'Density')} value={params.density} onChange={(v) => set({ ...params, density: v })} range={[0, 100]} defaultValue={25} help="pf.density" hint={[gray(0.9), cssColor(c).replace('rgb', 'rgba').replace(')', ', 0.7)')]} suffix="%" />
      <InkToggleRow title={L('保持明度', 'Preserve luminosity')} on={params.preserveLuminosity} onChange={(v) => set({ ...params, preserveLuminosity: v })} help="pf.preserve" />
    </div>
  )
}
