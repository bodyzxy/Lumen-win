import { useEffect, useRef, useState } from 'react'
import { L, Lang } from '../i18n'
import { doc, useDoc } from '../model/doc'
import { isTauri, onMaximizedChange, windowControl } from '../platform'
import { BareIcon, GlassButton } from './kit'
import { FocusSwap } from './motion'
import { MenuEntry, openMenuAt } from './overlays'

export const TOOLBAR_H = 52

/** 统一工具栏：中间是文件名，右边是打开、更多、导出、调整面板，最右是 Windows 的窗口按钮 */
export function Toolbar() {
  const hasImage = useDoc((d) => d.hasImage)
  const fileName = useDoc((d) => d.fileName)
  const size = useDoc((d) => d.imageSize)
  const showSidebar = useDoc((d) => d.showSidebar)
  const moreRef = useRef<HTMLButtonElement>(null)

  const moreMenu = (): MenuEntry[] => [
    { label: L('拷贝调整', 'Copy Adjustments'), shortcut: 'Ctrl+Shift+C', disabled: !doc.hasImage, action: () => doc.copyAdjustments() },
    { label: L('粘贴调整', 'Paste Adjustments'), shortcut: 'Ctrl+Shift+V', disabled: !doc.clipboard || !doc.hasImage, action: () => doc.pasteAdjustments() },
    { label: L('同步当前调整到全部照片', 'Sync Current Adjustments to All Photos'), disabled: doc.filmstrip.length < 2, action: () => doc.applyCurrentToAll() },
    'sep',
    { label: L('保存当前为预设…', 'Save as Preset…'), shortcut: 'Ctrl+S', action: () => doc.savePreset() },
    { label: L('载入预设…', 'Load Preset…'), shortcut: 'Ctrl+L', action: () => doc.loadPreset() },
    'sep',
    { label: L('导出 LUT（.cube）…', 'Export LUT (.cube)…'), shortcut: 'Ctrl+Shift+E', action: () => doc.exportLUT() },
    'sep',
    { header: L('语言', 'Language') },
    ...Lang.all.map((l) => ({ label: Lang.displayName(l), checked: Lang.current === l, action: () => Lang.set(l) })),
    'sep',
    { label: L('关闭当前照片', 'Close Photo'), shortcut: 'Ctrl+W', disabled: !doc.hasImage, action: () => doc.activeID && doc.closeSession(doc.activeID) },
    { label: L('全部重置', 'Reset All'), action: () => doc.resetAll() },
  ]

  return (
    <div
      data-tauri-drag-region
      style={{
        height: TOOLBAR_H, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: showSidebar ? 12 : 10,
        background: 'var(--toolbar)', boxShadow: 'inset 0 -0.5px 0 var(--line)', position: 'relative',
      }}
    >
      {!showSidebar && <BareIcon icon="sidebar.leading" onClick={() => doc.set('showSidebar', true)} help={L('显示侧栏', 'Show sidebar')} />}
      {/* 标题（整条工具栏居中） */}
      <div data-tauri-drag-region style={{ position: 'absolute', left: '50%', top: 0, height: TOOLBAR_H, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 200, pointerEvents: 'none' }}>
        <FocusSwap swapKey={hasImage ? fileName : 'empty'} style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasImage ? fileName : 'Lumen'}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {hasImage ? `${size.width} × ${size.height} · sRGB` : L('光调', 'Light & Tone')}
            </span>
          </div>
        </FocusSwap>
      </div>
      <span data-tauri-drag-region style={{ flex: 1, alignSelf: 'stretch' }} />
      <BareIcon icon="photo.on.rectangle" onClick={() => doc.presentOpenPanel()} help={L('打开照片 Ctrl+O', 'Open photos Ctrl+O')} iconSize={14} />
      <BareIcon icon="ellipsis.circle" buttonRef={moreRef} onClick={() => openMenuAt(moreRef.current!, moreMenu(), 'right')} help={L('预设与 LUT', 'Presets and LUTs')} iconSize={14} />
      <GlassButton prominent disabled={!hasImage} onClick={() => doc.set('showExportSheet', true)} help={L('导出照片 Ctrl+E', 'Export photo Ctrl+E')} style={{ margin: '0 4px' }}>
        {L('导出', 'Export')}
      </GlassButton>
      <BareIcon icon="sidebar.trailing" onClick={() => doc.set('showInspector', !doc.showInspector)} help={L('显示或隐藏调整面板', 'Show or hide the adjustments panel')} iconSize={14} />
      <WindowControls />
    </div>
  )
}

/** Windows 的最小化 / 最大化 / 关闭（单色，悬停出现淡底；关闭悬停时是 Windows 惯用的红色） */
function WindowControls() {
  const [max, setMax] = useState(false)
  useEffect(() => {
    let un: (() => void) | undefined
    onMaximizedChange(setMax).then((u) => (un = u))
    return () => un?.()
  }, [])
  if (!isTauri) return <span style={{ width: 6 }} />
  const btn = (kind: 'min' | 'max' | 'close') => (
    <CaptionButton kind={kind} maximized={max} onClick={() => windowControl(kind === 'min' ? 'minimize' : kind === 'max' ? 'toggleMaximize' : 'close')} />
  )
  return (
    <div style={{ display: 'flex', alignSelf: 'stretch', marginLeft: 8 }}>
      <span className="hairline-v" style={{ alignSelf: 'center', height: 18, marginRight: 4 }} />
      {btn('min')}
      {btn('max')}
      {btn('close')}
    </div>
  )
}

function CaptionButton({ kind, maximized, onClick }: { kind: 'min' | 'max' | 'close'; maximized: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  const [down, setDown] = useState(false)
  const close = kind === 'close'
  const bg = close ? (down ? 'rgb(148,20,10)' : hover ? 'rgb(196,43,28)' : 'transparent') : down ? 'rgba(0,0,0,0.09)' : hover ? 'rgba(0,0,0,0.05)' : 'transparent'
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setDown(false)
      }}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      style={{ width: 46, display: 'grid', placeItems: 'center', background: bg, color: close && hover ? 'white' : 'var(--text)', transition: 'background-color 0.12s ease-out' }}
    >
      <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1}>
        {kind === 'min' && <path d="M0 5.5 H10" />}
        {kind === 'max' && !maximized && <rect x={0.5} y={0.5} width={9} height={9} rx={1} />}
        {kind === 'max' && maximized && (
          <>
            <rect x={0.5} y={2.5} width={7} height={7} rx={1} />
            <path d="M2.5 2.5 V1.5 A1 1 0 0 1 3.5 0.5 H8.5 A1 1 0 0 1 9.5 1.5 V6.5 A1 1 0 0 1 8.5 7.5 H7.5" />
          </>
        )}
        {close && <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" />}
      </svg>
    </button>
  )
}
