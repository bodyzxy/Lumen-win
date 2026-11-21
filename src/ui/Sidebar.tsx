import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { spring, springTransition } from '../anim'
import { helpEntry } from '../help/help'
import { L } from '../i18n'
import { doc, EditDocument, useDoc } from '../model/doc'
import { builtInPresets, BuiltInPreset } from '../model/presets'
import { AdjustmentLayer, allKinds, basicIsDefault, kindEnglish, kindTitle, LayerKind } from '../model/types'
import { Bitmap } from './Bitmap'
import { Icon, kindSymbol } from './icons'
import { BareIcon, HelpBadge, MicroLabel } from './kit'
import { AnimatedList, FocusSwap, Presence, fx } from './motion'
import { openMenu, Popover } from './overlays'

const ROW_H = 30

export function Sidebar() {
  const layers = useDoc((d) => d.state.layers)
  const hasImage = useDoc((d) => d.hasImage)
  const selected = useDoc((d) => d.selectedLayerID)
  const [showPalette, setShowPalette] = useState(false)
  const plusRef = useRef<HTMLButtonElement>(null)
  const display = useMemo(() => [...layers].reverse(), [layers])

  // 拖动排序
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null)
  const dragInfo = useRef<{ id: string; startY: number; grab: number; active: boolean; pointer: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const onRowPointerDown = (e: React.PointerEvent, layer: AdjustmentLayer) => {
    if (e.button !== 0) return
    const row = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragInfo.current = { id: layer.id, startY: e.clientY, grab: e.clientY - row.top, active: false, pointer: e.pointerId }
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragInfo.current
      if (!d || !listRef.current) return
      if (!d.active) {
        if (Math.abs(e.clientY - d.startY) < 4) return
        d.active = true
      }
      const list = listRef.current.getBoundingClientRect()
      const disp = [...doc.state.layers].reverse()
      const from = disp.findIndex((l) => l.id === d.id)
      if (from < 0) return
      const y = e.clientY - list.top - d.grab
      const to = Math.max(0, Math.min(disp.length - 1, Math.round(y / ROW_H)))
      if (to !== from) doc.reorderDisplay(from, to)
      setDrag({ id: d.id, dy: y - to * ROW_H })
    }
    const up = () => {
      if (dragInfo.current?.active) setDrag(null)
      dragInfo.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const select = (id: string | null) => doc.selectLayer(id === EditDocument.basicID ? null : id)

  return (
    <div className="scroll-y" style={{ height: '100%', padding: '0 10px 16px 10px' }}>
      <SectionHeader>
        <span>{L('图层', 'Layers')}</span>
        <HelpBadge k="layers" />
        <span style={{ flex: 1 }} />
        <BareIcon
          icon="plus"
          size={22}
          iconSize={11}
          iconWeight="medium"
          buttonRef={plusRef}
          disabled={!hasImage}
          onClick={() => setShowPalette(true)}
          help={hasImage ? L('添加调整图层', 'Add adjustment layer') : L('先打开一张照片', 'Open a photo first')}
        />
      </SectionHeader>
      <Popover anchor={plusRef} open={showPalette} onClose={() => setShowPalette(false)} edge="right">
        <AdjustmentPalette
          onPick={(k) => {
            setShowPalette(false)
            doc.addLayer(k)
          }}
        />
      </Popover>

      <Presence show={layers.length === 0} enter={fx.focusPullIn} exit={fx.focusPullOut} initial={false}>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', padding: '4px 10px 6px 10px' }}>{L('还没有调整图层', 'No adjustment layers yet')}</div>
      </Presence>
      <div ref={listRef}>
        <AnimatedList
          items={display}
          keyOf={(l) => l.id}
          enter={fx.focusPullIn}
          exit={fx.focusPullOut}
          spring={spring(0.45, 0.82)}
          moveSpring={spring(0.4, 0.85)}
          render={(l) => (
            <div
              onPointerDown={(e) => onRowPointerDown(e, l)}
              style={
                drag?.id === l.id
                  ? { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 2, boxShadow: '0 4px 14px rgba(0,0,0,0.1)', borderRadius: 6, background: 'var(--sidebar)' }
                  : undefined
              }
            >
              <LayerRow layer={l} selected={selected === l.id} onSelect={() => select(l.id)} />
            </div>
          )}
        />
      </div>

      <SectionHeader>{L('基础', 'Basic')}</SectionHeader>
      <BasicRow selected={selected == null} onSelect={() => select(null)} />

      {/* 没有照片时不显示风格（缩略图是用你的照片生成的） */}
      <Presence show={hasImage} enter={fx.focusPullIn} exit={fx.focusPullOut} spring={spring(0.5, 0.86)}>
        <SectionHeader>{L('风格', 'Looks')}</SectionHeader>
        <PresetGrid />
      </Presence>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '10px 10px 0 10px', boxSizing: 'content-box', fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>
      {children}
    </div>
  )
}

function RowShell({ selected, onSelect, children, onContextMenu }: { selected: boolean; onSelect: () => void; children: React.ReactNode; onContextMenu?: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: ROW_H, display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 0 10px', borderRadius: 6,
        background: selected ? 'rgba(0,0,0,0.085)' : hover ? 'rgba(0,0,0,0.035)' : 'transparent',
        transition: 'background-color 0.15s ease-out',
      }}
      data-hover={hover ? '1' : undefined}
    >
      {children}
    </div>
  )
}

function LayerRow({ layer, selected, onSelect }: { layer: AdjustmentLayer; selected: boolean; onSelect: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <RowShell
        selected={selected}
        onSelect={onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu([
            { label: L('复制图层', 'Duplicate Layer'), action: () => doc.duplicateLayer(layer.id) },
            { label: L('上移一层', 'Move Up'), action: () => doc.moveLayer(layer.id, true) },
            { label: L('下移一层', 'Move Down'), action: () => doc.moveLayer(layer.id, false) },
            { label: layer.visible ? L('隐藏', 'Hide') : L('显示', 'Show'), action: () => doc.toggleVisible(layer.id) },
            'sep',
            { label: L('删除图层', 'Delete Layer'), destructive: true, action: () => doc.deleteLayer(layer.id) },
          ], e.clientX, e.clientY)
        }}
      >
        <span style={{ width: 18, display: 'grid', placeItems: 'center', color: layer.visible ? 'var(--text2)' : 'var(--text3)' }}>
          <Icon name={kindSymbol[layer.kind]} size={12} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span
            style={{
              fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              color: layer.visible ? 'var(--text)' : 'var(--text3)',
              textDecoration: layer.visible ? 'none' : 'line-through',
              textDecorationColor: 'var(--text3)',
            }}
          >
            {layer.name}
          </span>
          {layer.opacity < 100 && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1 }}>
              {Math.floor(layer.opacity)}%
            </span>
          )}
        </div>
        <span style={{ opacity: hover || !layer.visible ? 1 : 0, transition: 'opacity 0.2s ease-out' }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <BareIcon icon={layer.visible ? 'eye' : 'eye.slash'} size={20} iconSize={10.5} onClick={() => doc.toggleVisible(layer.id)} />
        </span>
      </RowShell>
    </div>
  )
}

function BasicRow({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const modified = useDoc((d) => !basicIsDefault(d.state.basic))
  return (
    <RowShell selected={selected} onSelect={onSelect}>
      <span style={{ width: 18, display: 'grid', placeItems: 'center', color: 'var(--text2)' }}>
        <Icon name="slider.horizontal.3" size={12} />
      </span>
      <span style={{ fontSize: 12.5, flex: 1 }}>{L('基础调整', 'Basic')}</span>
      <span
        style={{
          width: 5, height: 5, borderRadius: '50%', background: 'var(--text)',
          opacity: modified ? 1 : 0, transform: `scale(${modified ? 1 : 0.2})`,
          transition: springTransition(['transform', 'opacity'], spring(0.35, 0.7)),
        }}
      />
    </RowShell>
  )
}

// MARK: - 风格缩略图：直接在当前照片上预览每种风格

function PresetGrid() {
  const thumbs = useDoc((d) => d.presetThumbnails)
  const presets = useMemo(() => builtInPresets(), [])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 8px', padding: '6px 8px 10px 8px' }}>
      {presets.map((p) => (
        <PresetTile key={p.key} preset={p} image={thumbs[p.key] ?? null} />
      ))}
    </div>
  )
}

function PresetTile({ preset, image }: { preset: BuiltInPreset; image: ImageBitmap | null }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={() => doc.applyBuiltInPreset(builtInPresets().find((p) => p.key === preset.key)!)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-help={preset.subtitle}
      style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'stretch', minWidth: 0 }}
    >
      <div
        style={{
          position: 'relative', height: 62, background: 'var(--wash-strong)', overflow: 'hidden',
          boxShadow: `inset 0 0 0 0.5px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,${hover ? 0.14 : 0})`,
          transform: `scale(${hover ? 1.035 : 1})`,
          transition: springTransition(['transform', 'box-shadow'], spring(0.3, 0.75)),
        }}
      >
        <Presence show={!!image} enter={fx.opacity} spring={spring(0.5, 1)} style={{ position: 'absolute', inset: 0 }}>
          {image && <Bitmap image={image} fit="cover" style={{ width: '100%', height: '100%' }} />}
        </Presence>
        <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.06)' }} />
      </div>
      <span style={{ fontSize: 11, textAlign: 'left', color: hover ? 'var(--text)' : 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.2s' }}>
        {preset.name}
      </span>
    </button>
  )
}

// MARK: - 添加调整的面板
//
// 横向四列，和 PS「图像 › 调整」菜单同样的分组；高度固定、不滚动，不会超出窗口。
// 顶部有搜索框：直接打字筛选，回车添加第一项。

const COLUMN_W = 156
const GAP = 14
const PANEL_W = GAP * 2 + COLUMN_W * 4 + GAP * 3

const paletteColumns = (): { title: string; kinds: LayerKind[] }[][] => [
  [
    { title: L('明暗', 'Tone'), kinds: ['brightnessContrast', 'levels', 'curves', 'exposure'] },
    { title: L('影调', 'Light'), kinds: ['shadowsHighlights', 'hdrToning'] },
  ],
  [{ title: L('色彩', 'Color'), kinds: ['vibrance', 'hueSaturation', 'colorBalance', 'blackWhite', 'photoFilter', 'channelMixer', 'lut'] }],
  [{ title: L('特殊', 'Special'), kinds: ['invert', 'posterize', 'threshold', 'gradientMap', 'selectiveColor'] }],
  [
    { title: L('图像', 'Image'), kinds: ['desaturate', 'matchColor', 'replaceColor', 'equalize'] },
    { title: 'Camera Raw', kinds: ['hsl', 'colorGrading'] },
  ],
]

function AdjustmentPalette({ onPick }: { onPick: (k: LayerKind) => void }) {
  const [query, setQuery] = useState('')
  const [appeared, setAppeared] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    requestAnimationFrame(() => setAppeared(true))
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [])
  const q = query.trim().toLowerCase()
  const results = q ? allKinds.filter((k) => kindTitle(k).toLowerCase().includes(q) || kindEnglish[k].toLowerCase().includes(q)) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 16px', color: 'var(--text3)' }}>
        <Icon name="magnifyingglass" size={12} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) onPick(results[0])
          }}
          placeholder={L('搜索调整，例如 曲线、HSL、色阶', 'Search adjustments — e.g. Curves, HSL, Levels')}
          spellCheck={false}
          style={{ flex: 1, border: 0, background: 'transparent', fontSize: 13, color: 'var(--text)' }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ color: 'var(--text3)' }}>
            <Icon name="xmark.circle.fill" size={12} />
          </button>
        )}
      </div>
      <div className="hairline-h" />
      <FocusSwap swapKey={q ? 'results' : 'columns'} spring={spring(0.4, 0.88)} style={{ width: PANEL_W, height: 300 + GAP * 2, padding: GAP }}>
        {q ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {results.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: 8 }}>{L(`没有找到“${query}”`, `Nothing found for “${query}”`)}</div>
            ) : (
              <>
                <div style={{ display: 'flex', padding: '0 8px 4px 8px' }}>
                  <MicroLabel text="Results" trailing={L('⏎ 添加第一项', '⏎ adds the first')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(4, ${COLUMN_W}px)`, columnGap: GAP, rowGap: 2 }}>
                  {results.map((k, i) => (
                    <PaletteRow key={k} kind={k} highlighted={i === 0} onPick={onPick} />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: GAP }}>
            {paletteColumns().map((groups, ci) => (
              <div key={ci} style={{ width: COLUMN_W, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {groups.map((g, gi) => (
                  <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', padding: '0 8px 4px 8px' }}>
                      <MicroLabel text={g.title} />
                    </div>
                    {g.kinds.map((k, i) => {
                      // 错落浮现
                      const delay = (ci * 0.045 + gi * 0.06 + i * 0.016) * 1000
                      return (
                        <div
                          key={k}
                          style={{
                            opacity: appeared ? 1 : 0,
                            transform: `translateY(${appeared ? 0 : 6}px)`,
                            filter: `blur(${appeared ? 0 : 3}px)`,
                            transition: springTransition(['opacity', 'transform', 'filter'], spring(0.45, 0.82), delay),
                          }}
                        >
                          <PaletteRow kind={k} onPick={onPick} />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </FocusSwap>
    </div>
  )
}

function PaletteRow({ kind, highlighted = false, onPick }: { kind: LayerKind; highlighted?: boolean; onPick: (k: LayerKind) => void }) {
  const [hover, setHover] = useState(false)
  const on = hover || highlighted
  return (
    <button
      onClick={() => onPick(kind)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-help={helpEntry(`layer.${kind}`).what}
      style={{
        width: '100%', height: 27, display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px', borderRadius: 5,
        background: on ? 'var(--text)' : 'transparent', color: on ? 'white' : 'var(--text)',
        transition: 'background-color 0.12s ease-out, color 0.12s ease-out',
      }}
    >
      <span style={{ width: 16, display: 'grid', placeItems: 'center' }}>
        <Icon name={kindSymbol[kind]} size={12} weight="light" />
      </span>
      <FitText text={kindTitle(kind)} size={12.5} />
    </button>
  )
}

/** 文字放不下时缩小（最多缩到 80%），和 Mac 上的 minimumScaleFactor(0.8) 一样 */
function FitText({ text, size }: { text: string; size: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [fs, setFs] = useState(size)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.fontSize = size + 'px'
    const k = el.clientWidth / Math.max(1, el.scrollWidth)
    setFs(k < 1 ? Math.max(size * 0.8, size * k - 0.1) : size)
  }, [text, size])
  return (
    <span ref={ref} style={{ fontSize: fs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1, textAlign: 'left' }}>
      {text}
    </span>
  )
}
