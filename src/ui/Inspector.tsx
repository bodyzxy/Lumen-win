import { ReactNode, useRef } from 'react'
import { spring } from '../anim'
import { L } from '../i18n'
import { doc, useDoc } from '../model/doc'
import {
  AdjustmentLayer, blendModes, blendModeTitle, cssColor, kindEnglish, LayerParams, maskIsActive, maskKinds, maskKindTitle, MaskKind, resetLayerParams,
} from '../model/types'
import { Icon, kindSymbol } from './icons'
import { BareIcon, GlassButton, HelpBadge, HistogramPanel, NoteText, ScrubRow } from './kit'
import { FocusSwap } from './motion'
import { openMenuAt } from './overlays'
import { BlackWhitePanel, ChannelMixerPanel, ColorBalancePanel, HSLPanel, HueSatPanel, PhotoFilterPanel, SelectiveColorPanel } from './panels/ColorPanels'
import { EqualizePanel, HDRToningPanel, MatchColorPanel, ReplaceColorPanel, ShadowsHighlightsPanel } from './panels/ImagePanels'
import { BasicPanel, BrightnessContrastPanel, CurvesPanel, ExposurePanel, LevelsPanel, VibrancePanel } from './panels/TonePanels'
import { ColorGradingPanel, GradientMapPanel, LUTPanel, PosterizePanel, ThresholdPanel } from './panels/ToningPanels'

/** 右侧调整面板：直角、发丝线分隔，像一台精密仪器。
 *  上面是直方图，中间是当前图层的信息，下面按页展示参数（不再无限下滑）。 */
export function Inspector() {
  const histogram = useDoc((d) => d.histogram)
  const selected = useDoc((d) => d.selectedLayer)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>
      <HistogramPanel histogram={histogram} />
      <div className="hairline-h" />
      <FocusSwap swapKey={selected ? selected.id : 'basic'} spring={spring(0.45, 0.88)} style={{ flex: 1, minHeight: 0 }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>{selected ? <LayerInspector layer={selected} /> : <BasicInspector />}</div>
      </FocusSwap>
    </div>
  )
}

/** 面板标题区 */
function InspectorHeader({ symbol, title, english, trailing }: { symbol: string; title: ReactNode; english: ReactNode; trailing?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 10px 18px' }}>
      <div style={{ width: 22, display: 'grid', placeItems: 'center' }}>
        <Icon name={symbol} size={16} weight="light" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div className="micro" style={{ letterSpacing: 1.8, display: 'flex', alignItems: 'center', gap: 6 }}>
          {english}
        </div>
      </div>
      {trailing}
    </div>
  )
}

function BasicInspector() {
  const basic = useDoc((d) => d.state.basic)
  return (
    <>
      <InspectorHeader
        symbol="slider.horizontal.3"
        title={L('基础调整', 'Basic')}
        english="BASIC"
        trailing={<BareIcon icon="arrow.counterclockwise" onClick={() => doc.resetBasic()} help={L('恢复全部基础调整', 'Reset all basic adjustments')} />}
      />
      <div className="scroll-y" style={{ flex: 1, minHeight: 0 }}>
        <BasicPanel basic={basic} />
      </div>
    </>
  )
}

function LayerInspector({ layer }: { layer: AdjustmentLayer }) {
  const moreRef = useRef<HTMLButtonElement>(null)
  const update = (fn: (l: AdjustmentLayer) => AdjustmentLayer) => doc.updateLayer(layer.id, fn)
  const setParams = <K extends keyof LayerParams>(k: K) => (p: LayerParams[K]) => update((l) => ({ ...l, params: { ...l.params, [k]: p } }))
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 4px 18px' }}>
        <div style={{ width: 22, display: 'grid', placeItems: 'center' }}>
          <Icon name={kindSymbol[layer.kind]} size={16} weight="light" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={layer.name}
            placeholder={L('图层名称', 'Layer name')}
            onChange={(e) => update((l) => ({ ...l, name: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            spellCheck={false}
            style={{ border: 0, background: 'transparent', padding: 0, fontSize: 15, fontWeight: 600, width: '100%' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="micro" style={{ letterSpacing: 1.8 }}>{kindEnglish[layer.kind]}</span>
            <HelpBadge k={`layer.${layer.kind}`} />
          </div>
        </div>
        <BareIcon
          icon={layer.visible ? 'eye' : 'eye.slash'}
          onClick={() => update((l) => ({ ...l, visible: !l.visible }))}
          help={layer.visible ? L('隐藏图层', 'Hide layer') : L('显示图层', 'Show layer')}
        />
        <BareIcon
          icon="ellipsis"
          buttonRef={moreRef}
          onClick={() =>
            openMenuAt(moreRef.current!, [
              { label: L('重置参数', 'Reset Settings'), action: () => update((l) => resetLayerParams(l)) },
              { label: L('复制图层', 'Duplicate Layer'), action: () => doc.duplicateLayer(layer.id) },
              'sep',
              { label: L('上移一层', 'Move Up'), action: () => doc.moveLayer(layer.id, true) },
              { label: L('下移一层', 'Move Down'), action: () => doc.moveLayer(layer.id, false) },
              'sep',
              { label: L('删除图层', 'Delete Layer'), destructive: true, action: () => doc.deleteLayer(layer.id) },
            ], 'right')
          }
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 2px 18px' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{L('混合', 'Blend')}</span>
        <select
          value={layer.blendMode}
          onChange={(e) => update((l) => ({ ...l, blendMode: e.target.value as any }))}
          style={{
            marginLeft: 'auto', fontSize: 12, color: 'var(--text)', background: 'var(--control)',
            border: '0.5px solid var(--line)', borderRadius: 6, padding: '3px 8px', outline: 'none',
          }}
        >
          {blendModes.map((m) => (
            <option key={m} value={m}>{blendModeTitle(m)}</option>
          ))}
        </select>
      </div>
      <ScrubRow title={L('不透明度', 'Opacity')} value={layer.opacity} onChange={(v) => update((l) => ({ ...l, opacity: v }))} range={[0, 100]} defaultValue={100} help="opacity" suffix="%" />
      <MaskInspector layer={layer} update={update} />
      <div className="hairline-h" />
      <div className="scroll-y" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ opacity: layer.visible ? 1 : 0.45, transition: 'opacity 0.2s ease-out' }}>{panelFor(layer, setParams)}</div>
      </div>
    </>
  )
}

function panelFor(layer: AdjustmentLayer, setParams: <K extends keyof LayerParams>(k: K) => (p: LayerParams[K]) => void): ReactNode {
  const p = layer.params
  switch (layer.kind) {
    case 'curves': return <CurvesPanel params={p.curves} set={setParams('curves')} />
    case 'levels': return <LevelsPanel params={p.levels} set={setParams('levels')} />
    case 'brightnessContrast': return <BrightnessContrastPanel params={p.brightnessContrast} set={setParams('brightnessContrast')} />
    case 'exposure': return <ExposurePanel params={p.exposure} set={setParams('exposure')} />
    case 'vibrance': return <VibrancePanel params={p.vibrance} set={setParams('vibrance')} />
    case 'hueSaturation': return <HueSatPanel params={p.hueSaturation} set={setParams('hueSaturation')} />
    case 'hsl': return <HSLPanel params={p.hsl} set={setParams('hsl')} />
    case 'colorBalance': return <ColorBalancePanel params={p.colorBalance} set={setParams('colorBalance')} />
    case 'selectiveColor': return <SelectiveColorPanel params={p.selectiveColor} set={setParams('selectiveColor')} />
    case 'channelMixer': return <ChannelMixerPanel params={p.channelMixer} set={setParams('channelMixer')} />
    case 'blackWhite': return <BlackWhitePanel params={p.blackWhite} set={setParams('blackWhite')} />
    case 'photoFilter': return <PhotoFilterPanel params={p.photoFilter} set={setParams('photoFilter')} />
    case 'gradientMap': return <GradientMapPanel params={p.gradientMap} set={setParams('gradientMap')} />
    case 'colorGrading': return <ColorGradingPanel params={p.colorGrading} set={setParams('colorGrading')} />
    case 'posterize': return <PosterizePanel params={p.posterize} set={setParams('posterize')} />
    case 'threshold': return <ThresholdPanel params={p.threshold} set={setParams('threshold')} />
    case 'invert':
      return <NoteText style={{ paddingTop: 18 }}>{L('反相没有参数。用上面的不透明度控制程度；50% 时画面会变成一片灰，这是正常的。', 'Invert has no settings. Use Opacity above to control the strength; at 50% the image turns flat gray, which is expected.')}</NoteText>
    case 'desaturate':
      return <NoteText style={{ paddingTop: 18 }}>{L('去色会把照片直接变成灰度（按 PS 的方式取每个像素最亮和最暗通道的平均）。想精细控制每种颜色的明暗，请用「黑白」。', "Desaturate turns the photo grayscale directly (averaging each pixel's brightest and darkest channels, like Photoshop). For control over how each color renders, use Black & White.")}</NoteText>
    case 'lut': return <LUTPanel layerID={layer.id} params={p.lut} set={setParams('lut')} />
    case 'shadowsHighlights': return <ShadowsHighlightsPanel params={p.shadowsHighlights} set={setParams('shadowsHighlights')} />
    case 'hdrToning': return <HDRToningPanel params={p.hdrToning} set={setParams('hdrToning')} />
    case 'matchColor': return <MatchColorPanel layerID={layer.id} params={p.matchColor} set={setParams('matchColor')} />
    case 'replaceColor': return <ReplaceColorPanel layerID={layer.id} params={p.replaceColor} set={setParams('replaceColor')} />
    case 'equalize': return <EqualizePanel layerID={layer.id} params={p.equalize} />
  }
}

function MaskInspector({ layer, update }: { layer: AdjustmentLayer; update: (fn: (l: AdjustmentLayer) => AdjustmentLayer) => void }) {
  const eyedropper = useDoc((d) => d.eyedropper)
  const brushErase = useDoc((d) => d.maskBrushErase)
  const brushSize = useDoc((d) => d.maskBrushSize)
  const brushHardness = useDoc((d) => d.maskBrushHardness)
  const m = layer.mask
  const setMask = (patch: Partial<typeof m>) => update((l) => ({ ...l, mask: { ...l.mask, ...patch } }))
  const activeColorDrop = eyedropper?.kind === 'colorRangeMask' && eyedropper.layerID === layer.id
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 18px' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{L('蒙版', 'Mask')}</span>
        <span style={{ flex: 1 }} />
        {maskIsActive(m) && (
          <BareIcon
            icon="arrow.2.circlepath"
            size={24}
            active={m.invert}
            onClick={() => setMask({ invert: !m.invert })}
            help={L('反转蒙版', 'Invert mask')}
          />
        )}
        <select
          value={m.kind}
          onChange={(e) => setMask({ kind: e.target.value as MaskKind })}
          style={{
            fontSize: 12, color: 'var(--text)', background: 'var(--control)',
            border: '0.5px solid var(--line)', borderRadius: 6, padding: '3px 8px', outline: 'none',
          }}
        >
          {maskKinds.map((k) => (
            <option key={k} value={k}>{maskKindTitle(k)}</option>
          ))}
        </select>
      </div>
      {m.kind === 'radial' && (
        <ScrubRow title={L('羽化', 'Softness')} value={m.softness} onChange={(v) => setMask({ softness: v })} range={[0, 100]} defaultValue={55} />
      )}
      {m.kind === 'lumaRange' && (
        <>
          <ScrubRow title={L('最低亮度', 'Min Luma')} value={m.lumaMin} onChange={(v) => setMask({ lumaMin: v })} range={[0, 1]} defaultValue={0.55} decimals={2} />
          <ScrubRow title={L('最高亮度', 'Max Luma')} value={m.lumaMax} onChange={(v) => setMask({ lumaMax: v })} range={[0, 1]} defaultValue={1} decimals={2} />
          <ScrubRow title={L('过渡羽化', 'Falloff')} value={m.lumaFalloff} onChange={(v) => setMask({ lumaFalloff: v })} range={[0.01, 0.5]} defaultValue={0.15} decimals={2} />
        </>
      )}
      {m.kind === 'colorRange' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 18px' }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{L('目标色', 'Target Color')}</span>
            <span style={{ flex: 1 }} />
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: cssColor({ r: m.targetR, g: m.targetG, b: m.targetB }),
              boxShadow: 'inset 0 0 0 0.6px var(--line-strong)',
            }} />
            <BareIcon
              icon="eyedropper"
              size={24}
              active={activeColorDrop}
              onClick={() => doc.setEyedropper(activeColorDrop ? null : { kind: 'colorRangeMask', layerID: layer.id })}
              help={L('吸取目标颜色', 'Sample target color')}
            />
          </div>
          <ScrubRow title={L('颜色容差', 'Tolerance')} value={m.colorTolerance} onChange={(v) => setMask({ colorTolerance: v })} range={[0.02, 1]} defaultValue={0.28} decimals={2} />
          <ScrubRow title={L('边缘柔和', 'Softness')} value={m.colorSoftness} onChange={(v) => setMask({ colorSoftness: v })} range={[0.02, 1]} defaultValue={0.25} decimals={2} />
        </>
      )}
      {m.kind === 'brush' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 18px' }}>
            <GlassButton prominent={!brushErase} onClick={() => doc.set('maskBrushErase', false)}>{L('画笔', 'Paint')}</GlassButton>
            <GlassButton prominent={brushErase} onClick={() => doc.set('maskBrushErase', true)}>{L('橡皮', 'Erase')}</GlassButton>
            <span style={{ flex: 1 }} />
            <GlassButton disabled={!m.strokes.length} onClick={() => setMask({ strokes: [] })}>{L('清空', 'Clear')}</GlassButton>
          </div>
          <ScrubRow title={L('笔刷大小', 'Brush Size')} value={brushSize} onChange={(v) => doc.set('maskBrushSize', v)} range={[0.01, 0.25]} defaultValue={0.06} decimals={2} />
          <ScrubRow title={L('硬度', 'Hardness')} value={brushHardness} onChange={(v) => doc.set('maskBrushHardness', v)} range={[0, 1]} defaultValue={0.5} decimals={2} />
          <ScrubRow title={L('羽化', 'Feather')} value={m.feather} onChange={(v) => setMask({ feather: v })} range={[0, 100]} defaultValue={20} />
        </>
      )}
    </div>
  )
}
