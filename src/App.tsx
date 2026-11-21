import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { bezier, spring, springTransition, tween } from './anim'
import { L, Lang } from './i18n'
import { doc, useDoc } from './model/doc'
import { listenDragDrop } from './platform'
import { CanvasView } from './ui/Canvas'
import { ExportSheet } from './ui/ExportSheet'
import { Inspector } from './ui/Inspector'
import { BareIcon } from './ui/kit'
import { MenuLayer, TooltipLayer } from './ui/overlays'
import { Sidebar } from './ui/Sidebar'
import { Toolbar, TOOLBAR_H } from './ui/Toolbar'

const SIDEBAR_W = 232
const INSPECTOR_W = 336

/** 根视图：负责切换语言时的过渡（先轻微失焦，换好文字后再对焦回来） */
export function App() {
  const lang = useSyncExternalStore(Lang.subscribe, () => Lang.current)
  const [shown, setShown] = useState(lang)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (lang === shown) return
    const el = ref.current
    if (!el) return setShown(lang)
    // 失焦（0.18s easeIn）→ 换文字 → 对焦回来（0.6s）
    tween(180, bezier(0.42, 0, 1, 1), (p) => {
      el.style.filter = `blur(${12 * p}px)`
      el.style.opacity = String(1 - 0.45 * p)
    })
    const t = setTimeout(() => {
      setShown(lang)
      tween(600, bezier(0.16, 0.8, 0.24, 1), (p) => {
        el.style.filter = p >= 1 ? '' : `blur(${12 * (1 - p)}px)`
        el.style.opacity = String(0.55 + 0.45 * p)
      })
    }, 200)
    return () => clearTimeout(t)
  }, [lang, shown])

  return (
    <div ref={ref} style={{ height: '100%' }}>
      <Main key={shown} />
      <TooltipLayer />
      <MenuLayer />
    </div>
  )
}

function Main() {
  const showSidebar = useDoc((d) => d.showSidebar)
  const showInspector = useDoc((d) => d.showInspector)
  useShortcuts()

  useEffect(() => {
    let un: (() => void) | undefined
    listenDragDrop({
      over: (inside) => doc.dropHover !== inside && doc.set('dropHover', inside),
      drop: (files) => doc.open(files),
    }).then((u) => (un = u))
    return () => un?.()
  }, [])

  const colSpring = springTransition(['width'], spring(0.4, 0.86))

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }} onContextMenu={(e) => {
      const t = e.target as HTMLElement
      if (!t.closest('input, textarea')) e.preventDefault()
    }}>
      {/* 左：图层侧栏（和窗口一样高） */}
      <div style={{ width: showSidebar ? SIDEBAR_W : 0, flex: 'none', overflow: 'hidden', transition: colSpring, background: 'var(--sidebar)', boxShadow: 'inset -0.5px 0 0 var(--line)' }}>
        <div style={{ width: SIDEBAR_W, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div data-tauri-drag-region style={{ height: TOOLBAR_H, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
            <img src="/app-icon.png" alt="" width={18} height={18} style={{ borderRadius: 4, pointerEvents: 'none' }} draggable={false} />
            <span data-tauri-drag-region style={{ flex: 1, alignSelf: 'stretch' }} />
            <BareIcon icon="sidebar.leading" onClick={() => doc.set('showSidebar', false)} help={L('隐藏侧栏', 'Hide sidebar')} />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Sidebar />
          </div>
        </div>
      </div>

      {/* 中 + 右 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Toolbar />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CanvasView />
          </div>
          <div style={{ width: showInspector ? INSPECTOR_W : 0, flex: 'none', overflow: 'hidden', transition: colSpring, boxShadow: 'inset 0.5px 0 0 var(--line)' }}>
            <div style={{ width: INSPECTOR_W, height: '100%' }}>
              <Inspector />
            </div>
          </div>
          <ExportSheet />
        </div>
      </div>
    </div>
  )
}

/** 键盘快捷键（对应 Mac 菜单里的 ⌘ 组合键，Windows 上用 Ctrl） */
function useShortcuts() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.closest('input, textarea') && !(target as HTMLInputElement).type?.match(/color|checkbox/)
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (e.key === 'Escape' && doc.eyedropper) return run(() => doc.setEyedropper(null))
      if (mod) {
        if (k === 'o') return run(() => doc.presentOpenPanel())
        if (k === 'w') return run(() => doc.activeID && doc.closeSession(doc.activeID))
        if (k === 'e' && e.shiftKey) return run(() => doc.exportLUT())
        if (k === 'e') return run(() => doc.hasImage && doc.set('showExportSheet', true))
        if (k === 's') return run(() => doc.savePreset())
        if (k === 'l') return run(() => doc.loadPreset())
        if (k === '0') return run(() => doc.zoomToFit())
        if (k === '1') return run(() => doc.toggleActualSize())
        if (k === '=' || k === '+') return run(() => doc.setZoom(doc.zoom * 1.5, undefined, spring(0.45, 0.86)))
        if (k === '-') return run(() => doc.setZoom(doc.zoom / 1.5, undefined, spring(0.45, 0.86)))
        if (typing) return
        if (k === 'c' && e.shiftKey) return run(() => doc.hasImage && doc.copyAdjustments())
        if (k === 'v' && e.shiftKey) return run(() => doc.pasteAdjustments())
        if ((k === 'z' && e.shiftKey) || k === 'y') return run(() => doc.redo())
        if (k === 'z') return run(() => doc.undo())
        if ((k === 'delete' || k === 'backspace') && doc.selectedLayerID) return run(() => doc.deleteLayer(doc.selectedLayerID!))
        // 屏蔽 WebView 自带的刷新、打印、查找
        if (['r', 'p', 'f', 'g', 'j', 'u'].includes(k)) return e.preventDefault()
        return
      }
      if (typing) return
      if (e.key === '\\') return run(() => doc.hasImage && doc.set('compareMode', doc.compareMode === 'split' ? 'off' : 'split'))
      if (e.key === 'F5' || e.key === 'F7') return e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
}

