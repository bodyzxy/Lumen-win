import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { animateSpring, spring } from '../anim'
import { Icon } from './icons'

// MARK: - 工具提示（对应 Mac 的 .help）：给元素加 data-help 属性即可

export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  useEffect(() => {
    let timer = 0
    let current: Element | null = null
    let pos = { x: 0, y: 0 }
    const over = (e: MouseEvent) => {
      pos = { x: e.clientX, y: e.clientY }
      // 悬停在“?”上时由帮助卡片负责说明，不再显示工具提示
      const el = (e.target as Element)?.closest?.('[data-help-badge]') ? null : (e.target as Element)?.closest?.('[data-help]')
      if (el === current) return
      current = el
      clearTimeout(timer)
      setTip(null)
      if (!el) return
      timer = window.setTimeout(() => {
        const text = el.getAttribute('data-help')
        if (text && document.contains(el)) setTip({ text, x: pos.x, y: pos.y })
      }, 750)
    }
    const move = (e: MouseEvent) => (pos = { x: e.clientX, y: e.clientY })
    const hide = () => {
      clearTimeout(timer)
      current = null
      setTip(null)
    }
    window.addEventListener('mouseover', over)
    window.addEventListener('mousemove', move)
    window.addEventListener('pointerdown', hide, true)
    window.addEventListener('wheel', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('mouseover', over)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('pointerdown', hide, true)
      window.removeEventListener('wheel', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])
  const ref = useRef<HTMLDivElement>(null)
  const [adj, setAdj] = useState({ x: 0, y: 0 })
  useLayoutEffect(() => {
    if (!tip || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    let x = tip.x + 4
    let y = tip.y + 22
    if (x + r.width > window.innerWidth - 6) x = window.innerWidth - r.width - 6
    if (y + r.height > window.innerHeight - 6) y = tip.y - r.height - 8
    setAdj({ x, y })
  }, [tip])
  if (!tip) return null
  return createPortal(
    <div ref={ref} className="tooltip" style={{ left: adj.x, top: adj.y }}>
      {tip.text}
    </div>,
    document.body,
  )
}

// MARK: - 菜单（Mac 的 Menu / contextMenu）

export type MenuEntry =
  | { label: string; action?: () => void; disabled?: boolean; destructive?: boolean; checked?: boolean; shortcut?: string }
  | { header: string }
  | 'sep'

type MenuState = { items: MenuEntry[]; x: number; y: number; align: 'left' | 'right'; anchorBottom?: number } | null
let setMenuGlobal: (m: MenuState) => void = () => {}

export function openMenu(items: MenuEntry[], x: number, y: number, align: 'left' | 'right' = 'left') {
  setMenuGlobal({ items, x, y, align })
}

/** 在某个按钮下面弹出菜单 */
export function openMenuAt(el: Element, items: MenuEntry[], align: 'left' | 'right' = 'left') {
  const r = el.getBoundingClientRect()
  setMenuGlobal({ items, x: align === 'left' ? r.left : r.right, y: r.bottom + 4, align })
}

export function MenuLayer() {
  const [menu, setMenu] = useState<MenuState>(null)
  setMenuGlobal = setMenu
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    let x = menu.align === 'left' ? menu.x : menu.x - r.width
    let y = menu.y
    if (x + r.width > window.innerWidth - 6) x = window.innerWidth - r.width - 6
    if (x < 6) x = 6
    if (y + r.height > window.innerHeight - 6) y = Math.max(6, menu.y - r.height - 8)
    setPos({ x, y })
    ref.current.animate(
      [
        { opacity: 0, transform: 'scale(0.98)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 120, easing: 'ease-out' },
    )
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      setMenu(null)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('wheel', close, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('wheel', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', key, true)
    }
  }, [menu])

  if (!menu) return null
  return createPortal(
    <div
      ref={ref}
      className="menu"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="menu-sep" />
        if ('header' in it) return <div key={i} className="menu-header">{it.header}</div>
        return (
          <button
            key={i}
            className={`menu-item${it.disabled ? ' disabled' : ''}${it.destructive ? ' destructive' : ''}`}
            onClick={() => {
              if (it.disabled) return
              setMenu(null)
              it.action?.()
            }}
          >
            {it.checked && (
              <span className="check">
                <Icon name="checkmark" size={10} weight="semibold" />
              </span>
            )}
            {it.label}
            {it.shortcut && <span className="shortcut">{it.shortcut}</span>}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

// MARK: - 弹出面板（Mac 的 .popover）

export function Popover({
  anchor,
  open,
  onClose,
  edge,
  children,
  arrow = true,
  hoverOnly = false,
}: {
  anchor: React.RefObject<Element>
  open: boolean
  onClose: () => void
  /** 面板出现在锚点的哪一侧 */
  edge: 'left' | 'right' | 'bottom'
  children: ReactNode
  arrow?: boolean
  /** 只是悬停说明，不接收鼠标 */
  hoverOnly?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; side: 'left' | 'right' | 'bottom'; ay: number; ax: number } | null>(null)
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useLayoutEffect(() => {
    if (!mounted || !ref.current || !anchor.current) return
    const a = anchor.current.getBoundingClientRect()
    const r = ref.current.getBoundingClientRect()
    const gap = arrow ? 12 : 6
    let side = edge
    if (side === 'left' && a.left - r.width - gap < 6) side = 'right'
    if (side === 'right' && a.right + r.width + gap > window.innerWidth - 6) side = 'left'
    let x: number, y: number
    if (side === 'bottom') {
      x = a.left + a.width / 2 - r.width / 2
      y = a.bottom + gap
    } else {
      x = side === 'left' ? a.left - r.width - gap : a.right + gap
      y = a.top + a.height / 2 - r.height / 2
    }
    x = Math.max(6, Math.min(window.innerWidth - r.width - 6, x))
    y = Math.max(6, Math.min(window.innerHeight - r.height - 6, y))
    setPos({ x, y, side, ay: a.top + a.height / 2 - y, ax: a.left + a.width / 2 - x })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, edge])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !pos) return
    const origin = pos.side === 'left' ? `right ${pos.ay}px` : pos.side === 'right' ? `left ${pos.ay}px` : `${pos.ax}px top`
    el.style.transformOrigin = origin
    if (open) {
      animateSpring(el, [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'scale(1)' }], spring(0.3, 0.8))
    } else {
      const an = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: 'ease-out', fill: 'both' })
      an.onfinish = () => setMounted(false)
    }
  }, [open, pos?.x, pos?.y])

  useEffect(() => {
    if (!open || hoverOnly) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
    }
  }, [open, hoverOnly, onClose, anchor])

  if (!mounted) return null
  return createPortal(
    <div
      ref={ref}
      className="popover"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, pointerEvents: hoverOnly ? 'none' : 'auto' }}
    >
      {arrow && pos && <PopoverArrow side={pos.side} offset={pos.side === 'bottom' ? pos.ax : pos.ay} />}
      {children}
    </div>,
    document.body,
  )
}

function PopoverArrow({ side, offset }: { side: 'left' | 'right' | 'bottom'; offset: number }) {
  const s = 9
  const common: React.CSSProperties = { position: 'absolute', width: s * 2, height: s * 2, pointerEvents: 'none' }
  const style: React.CSSProperties =
    side === 'left'
      ? { ...common, right: -s * 2 + 1, top: offset - s }
      : side === 'right'
        ? { ...common, left: -s * 2 + 1, top: offset - s }
        : { ...common, top: -s * 2 + 1, left: offset - s }
  const rot = side === 'left' ? 0 : side === 'right' ? 180 : 270
  return (
    <svg style={style} viewBox="0 0 18 18">
      <g transform={`rotate(${rot} 9 9)`}>
        <path d="M0 0.5 L9 9 L0 17.5" fill="rgba(252,252,251,0.97)" stroke="rgba(0,0,0,0.12)" strokeWidth="0.6" />
        <rect x="-1" y="0" width="1.4" height="18" fill="rgba(252,252,251,1)" />
      </g>
    </svg>
  )
}
