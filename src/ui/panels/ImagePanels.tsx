import { useState } from 'react'
import { CM } from '../../engine/colormath'
import { L } from '../../i18n'
import { doc, useDoc } from '../../model/doc'
import { ColorStats, cssColor, EqualizeParams, hexString, HDRToningParams, MatchColorParams, ReplaceColorParams, ShadowsHighlightsParams } from '../../model/types'
import { Icon } from '../icons'
import { ColorWell, GlassButton, GlassIcon, HelpBadge, Hint, InkToggleRow, MicroLabel, NoteText, Pager, ScrubRow } from '../kit'
import { useSize } from '../motion'
import { FileRow } from './ToningPanels'

// MARK: - 阴影/高光

export function ShadowsHighlightsPanel({ params, set }: { params: ShadowsHighlightsParams; set: (p: ShadowsHighlightsParams) => void }) {
  const [tab, setTab] = useState(0)
  const s = (k: keyof ShadowsHighlightsParams) => (v: number) => set({ ...params, [k]: v })
  return (
    <Pager tabs={[L('阴影', 'Shadows'), L('高光', 'Highlights'), L('调整', 'Adjust')]} selection={tab} onSelect={setTab}>
      {(t) =>
        t === 0 ? (
          <div>
            <ScrubRow title={L('数量', 'Amount')} value={params.shadowsAmount} onChange={s('shadowsAmount')} range={[0, 100]} defaultValue={35} help="sh.shadowsAmount" suffix="%" />
            <ScrubRow title={L('半径', 'Radius')} value={params.shadowsRadius} onChange={s('shadowsRadius')} range={[1, 100]} defaultValue={30} help="sh.radius" suffix=" px" />
          </div>
        ) : t === 1 ? (
          <div>
            <ScrubRow title={L('数量', 'Amount')} value={params.highlightsAmount} onChange={s('highlightsAmount')} range={[0, 100]} help="sh.highlightsAmount" suffix="%" />
            <ScrubRow title={L('半径', 'Radius')} value={params.highlightsRadius} onChange={s('highlightsRadius')} range={[1, 100]} defaultValue={30} help="sh.radius" suffix=" px" />
          </div>
        ) : (
          <div>
            <ScrubRow title={L('颜色校正', 'Color correction')} value={params.colorCorrection} onChange={s('colorCorrection')} range={[-100, 100]} defaultValue={20} help="sh.colorCorrection" />
            <ScrubRow title={L('中间调对比度', 'Midtone contrast')} value={params.midtoneContrast} onChange={s('midtoneContrast')} range={[-100, 100]} help="sh.midtoneContrast" />
          </div>
        )
      }
    </Pager>
  )
}

// MARK: - HDR 色调

export function HDRToningPanel({ params, set }: { params: HDRToningParams; set: (p: HDRToningParams) => void }) {
  const [tab, setTab] = useState(0)
  const s = (k: keyof HDRToningParams) => (v: number) => set({ ...params, [k]: v })
  return (
    <Pager tabs={[L('边缘光', 'Edge Glow'), L('色调与细节', 'Tone & Detail'), L('颜色', 'Colors')]} selection={tab} onSelect={setTab}>
      {(t) =>
        t === 0 ? (
          <div>
            <ScrubRow title={L('半径', 'Radius')} value={params.radius} onChange={s('radius')} range={[1, 100]} defaultValue={30} help="hdr.radius" suffix=" px" />
            <ScrubRow title={L('强度', 'Strength')} value={params.strength} onChange={s('strength')} range={[0, 100]} defaultValue={50} help="hdr.strength" suffix="%" />
          </div>
        ) : t === 1 ? (
          <div>
            <ScrubRow title={L('灰度系数', 'Gamma')} value={params.gamma} onChange={s('gamma')} range={[0.2, 2.5]} defaultValue={1} help="hdr.gamma" decimals={2} />
            <ScrubRow title={L('曝光度', 'Exposure')} value={params.exposure} onChange={s('exposure')} range={[-3, 3]} help="hdr.exposure" hint={Hint.tone} decimals={2} />
            <ScrubRow title={L('细节', 'Detail')} value={params.detail} onChange={s('detail')} range={[-100, 200]} defaultValue={30} help="hdr.detail" suffix="%" />
          </div>
        ) : (
          <div>
            <ScrubRow title={L('自然饱和度', 'Vibrance')} value={params.vibrance} onChange={s('vibrance')} range={[-100, 100]} help="basic.vibrance" />
            <ScrubRow title={L('饱和度', 'Saturation')} value={params.saturation} onChange={s('saturation')} range={[-100, 100]} defaultValue={20} help="basic.saturation" />
          </div>
        )
      }
    </Pager>
  )
}

// MARK: - 匹配颜色

function statSwatch(title: string, s: ColorStats | null) {
  let c = { r: 0.9, g: 0.9, b: 0.9 }
  if (s) {
    const rgb = CM.fromYCbCr(s.mean[0], s.mean[1] * 3, s.mean[2] * 3)
    c = { r: CM.clamp(rgb[0]), g: CM.clamp(rgb[1]), b: CM.clamp(rgb[2]) }
  }
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <span style={{ width: 22, height: 22, background: cssColor(c), boxShadow: 'inset 0 0 0 0.5px var(--line)' }} />
      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{title}</span>
    </div>
  )
}

export function MatchColorPanel({ layerID, params, set }: { layerID: string; params: MatchColorParams; set: (p: MatchColorParams) => void }) {
  const s = (k: 'luminance' | 'intensity' | 'fade') => (v: number) => set({ ...params, [k]: v })
  return (
    <div style={{ padding: '6px 0' }}>
      <FileRow
        title={params.reference == null ? L('未选择参考照片', 'No reference photo') : params.referenceName}
        subtitle={params.reference == null ? L('选一张你喜欢的照片，当前照片的色调会向它靠拢', "Pick a photo you like — this photo's tones will move toward it") : L('已分析参考照片的颜色分布', 'Reference colors analyzed')}
        buttonTitle={params.reference == null ? L('选择…', 'Choose…') : L('更换…', 'Change…')}
        onClick={() => doc.chooseMatchReference(layerID)}
      />
      {params.reference && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 18px 8px 18px', color: 'var(--text3)' }}>
          {statSwatch(L('当前', 'Current'), params.source)}
          <Icon name="arrow.right" size={10} />
          {statSwatch(L('参考', 'Reference'), params.reference)}
        </div>
      )}
      <div className="hairline-h" />
      <ScrubRow title={L('明亮度', 'Luminance')} value={params.luminance} onChange={s('luminance')} range={[1, 200]} defaultValue={100} help="mc.luminance" />
      <ScrubRow title={L('颜色强度', 'Color intensity')} value={params.intensity} onChange={s('intensity')} range={[1, 200]} defaultValue={100} help="mc.intensity" />
      <ScrubRow title={L('渐隐', 'Fade')} value={params.fade} onChange={s('fade')} range={[0, 100]} help="mc.fade" />
      <InkToggleRow title={L('中和', 'Neutralize')} on={params.neutralize} onChange={(v) => set({ ...params, neutralize: v })} help="mc.neutralize" />
    </div>
  )
}

// MARK: - 替换颜色

export function ReplaceColorPanel({ layerID, params, set }: { layerID: string; params: ReplaceColorParams; set: (p: ReplaceColorParams) => void }) {
  const eyedropper = useDoc((d) => d.eyedropper)
  const picking = eyedropper?.kind === 'replaceColor' && eyedropper.layerID === layerID
  const s = (k: 'fuzziness' | 'hue' | 'saturation' | 'lightness') => (v: number) => set({ ...params, [k]: v })
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
        <span style={{ width: 34, height: 34, flex: 'none', background: cssColor(params.target), boxShadow: 'inset 0 0 0 0.5px var(--line-strong)', transition: 'background-color 0.3s ease-out' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{L('要替换的颜色', 'Color to replace')}</span>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>{hexString(params.target)}</span>
        </div>
        <ColorWell color={params.target} onChange={(c) => set({ ...params, target: c })} />
        <GlassIcon
          icon="eyedropper"
          size={28}
          active={picking}
          onClick={() => doc.setEyedropper(picking ? null : { kind: 'replaceColor', layerID })}
          help={L('从照片上吸取颜色', 'Pick a color from the photo')}
        />
      </div>
      <ScrubRow title={L('容差', 'Fuzziness')} value={params.fuzziness} onChange={s('fuzziness')} range={[0, 200]} defaultValue={40} help="rc.fuzziness" />
      <div style={{ display: 'flex', padding: '10px 18px 0 18px' }}>
        <MicroLabel text="Replacement" />
      </div>
      <ScrubRow title={L('色相', 'Hue')} value={params.hue} onChange={s('hue')} range={[-180, 180]} help="rc.hue" hint={Hint.spectrum(180, 540)} suffix="°" />
      <ScrubRow title={L('饱和度', 'Saturation')} value={params.saturation} onChange={s('saturation')} range={[-100, 100]} help="rc.saturation" />
      <ScrubRow title={L('明度', 'Lightness')} value={params.lightness} onChange={s('lightness')} range={[-100, 100]} help="rc.lightness" hint={Hint.tone} />
    </div>
  )
}

// MARK: - 色调均化

export function EqualizePanel({ layerID, params }: { layerID: string; params: EqualizeParams }) {
  return (
    <div>
      <NoteText>
        {L('色调均化会重新分布亮度，让每个亮度级别的像素数量尽量相同。暗淡、发灰的照片会立刻变得层次分明。', 'Equalize redistributes brightness so every level holds about the same number of pixels. Dull, gray photos instantly gain separation.')}
      </NoteText>
      {params.curve.length === 256 && (
        <div style={{ padding: '6px 18px' }}>
          <CurvePreview values={params.curve} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px' }}>
        <GlassButton onClick={() => doc.recomputeEqualize(layerID)}>{L('按当前画面重新计算', 'Recalculate from Current Image')}</GlassButton>
        <HelpBadge k="eq.recompute" />
      </div>
    </div>
  )
}

/** 只读的映射曲线预览 */
function CurvePreview({ values }: { values: number[] }) {
  const [ref, { width: w }] = useSize<HTMLDivElement>()
  const h = 120
  let d = ''
  values.forEach((v, i) => (d += `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(2)},${((1 - v) * h).toFixed(2)}`))
  return (
    <div ref={ref} style={{ height: h, background: 'white', boxShadow: 'inset 0 0 0 0.5px var(--line-strong)' }}>
      {w > 0 && (
        <svg width={w} height={h}>
          <path d={`M0 ${h} L${w} 0`} stroke="rgba(0,0,0,0.1)" strokeWidth={0.5} strokeDasharray="3 3" />
          <path d={d} fill="none" stroke="var(--text)" strokeWidth={1.2} />
        </svg>
      )}
    </div>
  )
}
