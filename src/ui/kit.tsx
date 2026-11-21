import { CSSProperties, ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ease, spring, springTransition, tween } from '../anim'
import { Histogram } from '../engine/analysis'
import { CM, gray, muted } from '../engine/colormath'
import { helpEntry } from '../help/help'
import { L } from '../i18n'
import { RGBColor, cssColor, hexString, parseHex } from '../model/types'
import { Icon } from './icons'
import { FocusSwap, useSize, useSpringValue } from './motion'
import { Popover } from './overlays'

// MARK: - 按下状态

function usePressed() {
  const [pressed, setPressed] = useState(false)
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button === 0) setPressed(true)
    },
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
  }
  return [pressed, handlers] as const
}

const pressSpring = springTransition(['transform'], spring(0.22, 0.7))

// MARK: - 按钮

/** 胶囊形玻璃按钮 */
export function GlassButton({
  children, onClick, prominent = false, disabled = false, help, style,
}: { children: ReactNode; onClick?: () => void; prominent?: boolean; disabled?: boolean; help?: string; style?: CSSProperties }) {
  const [pressed, h] = usePressed()
  return (
    <button
      {...h}
      className={`glass glass-button${prominent ? ' prominent' : ''}${pressed ? ' pressed' : ''}`}
      onClick={onClick}
      disabled={disabled}
      data-help={help}
      style={{
        transform: `scale(${pressed ? 0.97 : 1})`,
        transition: pressSpring + ', box-shadow 0.2s ease-out, opacity 0.2s ease-out',
        color: prominent ? 'white' : 'var(--text)',
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/** 圆形玻璃图标按钮 */
export function GlassIcon({ icon, size = 30, active = false, onClick, help }: { icon: string; size?: number; active?: boolean; onClick?: () => void; help?: string }) {
  const [pressed, h] = usePressed()
  return (
    <button
      {...h}
      className={`glass${active ? ' prominent' : ''}${pressed ? ' pressed' : ''}`}
      onClick={onClick}
      data-help={help}
      style={{
        width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none',
        color: active ? 'white' : 'var(--text)',
        transform: `scale(${pressed ? 0.94 : 1})`,
        transition: pressSpring,
      }}
    >
      <Icon name={icon} size={13} />
    </button>
  )
}

/** 无底色的图标按钮（悬停时出现一层很淡的底） */
export function BareIcon({
  icon, size = 28, active = false, onClick, help, disabled = false, iconSize = 13, iconWeight, children, buttonRef, style,
}: {
  icon?: string; size?: number; active?: boolean; onClick?: (e: React.MouseEvent) => void; help?: string; disabled?: boolean
  iconSize?: number; iconWeight?: 'regular' | 'medium' | 'light'; children?: ReactNode; buttonRef?: React.Ref<HTMLButtonElement>; style?: CSSProperties
}) {
  const [pressed, h] = usePressed()
  const [hover, setHover] = useState(false)
  return (
    <button
      ref={buttonRef}
      {...h}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        h.onPointerLeave()
      }}
      onClick={onClick}
      disabled={disabled}
      data-help={help}
      style={{
        width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none',
        color: active ? 'white' : 'var(--text)',
        background: active ? 'var(--text)' : hover || pressed ? 'var(--wash-strong)' : 'transparent',
        transform: `scale(${pressed ? 0.92 : 1})`,
        transition: pressSpring + ', background-color 0.15s ease-out, opacity 0.2s',
        opacity: disabled ? 0.35 : 1,
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={iconSize} weight={iconWeight} /> : children}
    </button>
  )
}

/** 纯文字按钮（链接样式） */
export function TextLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
    </button>
  )
}

// MARK: - 小标签

export function MicroLabel({ text, trailing, style }: { text: string; trailing?: string; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, ...style }}>
      <span className="micro">{text}</span>
      <div className="hairline-h" style={{ flex: 1 }} />
      {trailing && (
        <span className="micro" style={{ letterSpacing: 1.2 }}>
          {trailing}
        </span>
      )}
    </div>
  )
}

// MARK: - 问号说明

export function HelpBadge({ k, style }: { k: string; style?: CSSProperties }) {
  const [hovering, setHovering] = useState(false)
  const [show, setShow] = useState(false)
  const timer = useRef(0)
  const ref = useRef<HTMLSpanElement>(null)
  const onHover = (inside: boolean) => {
    setHovering(inside)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShow(inside), inside ? 250 : 120)
  }
  return (
    <>
      <span
        ref={ref}
        data-help-badge
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 13, height: 13, flex: 'none', borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
          fontFamily: 'var(--rounded)', fontSize: 8.5, fontWeight: 700, lineHeight: 1,
          color: hovering ? 'white' : 'var(--text3)',
          background: hovering ? 'var(--text)' : 'transparent',
          boxShadow: hovering ? 'none' : 'inset 0 0 0 0.8px var(--line-strong)',
          transition: 'background-color 0.15s ease-out, color 0.15s ease-out, box-shadow 0.15s ease-out',
          position: 'relative',
          ...style,
        }}
      >
        ?
        {/* 扩大一点悬停范围 */}
        <span style={{ position: 'absolute', inset: -4 }} />
      </span>
      <Popover anchor={ref} open={show} onClose={() => setShow(false)} edge="left" hoverOnly>
        <HelpCard k={k} />
      </Popover>
    </>
  )
}

function HelpCard({ k }: { k: string }) {
  const e = helpEntry(k)
  const row = (symbol: string, label: string, text: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: 40, flex: 'none', color: 'var(--text)' }}>
        <Icon name={symbol} size={9} weight="semibold" />
        <span style={{ fontSize: 10.5, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text)' }}>{text}</div>
    </div>
  )
  return (
    <div style={{ width: 268, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 }}>{e.what}</div>
      {(e.up || e.down) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 2 }}>
          {e.up && row('arrow.up', L('调大', 'Raise'), e.up)}
          {e.down && row('arrow.down', L('调小', 'Lower'), e.down)}
        </div>
      )}
      {e.tip && (
        <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.45, paddingLeft: 10, borderLeft: '1.5px solid var(--line-strong)' }}>
          {e.tip}
        </div>
      )}
    </div>
  )
}

// MARK: - 刻度尺滑杆
//
// 每个参数是一条“刻度尺”：在整行任意位置左右拖动就能调整（相对拖动，不会跳），
// 按住 Alt（或 Shift）是微调；单击刻度尺直接跳到那个位置；双击参数名恢复默认。
// 拖动时指针附近的刻度会像放大镜一样隆起。

function Ruler({ needle, focus, hover, dragging, hint, frac, originFrac, width }: {
  needle: number; focus: number; hover: boolean; dragging: boolean; hint?: string[]; frac: number; originFrac: number; width: number
}) {
  const count = 48
  const h = 16
  const bottomPad = hint ? 3 : 0
  const ticks: ReactNode[] = []
  if (width > 0) {
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const x = t * width
      const base = i % 8 === 0 ? 6 : 3
      const d = (t - needle) / 0.065
      const boost = focus * Math.exp(-d * d) * 7
      const th = Math.min(h, base + boost)
      ticks.push(<rect key={i} x={x - 0.4} y={h - bottomPad - th} width={0.8} height={th} />)
    }
  }
  const x = frac * width
  const ox = originFrac * width
  const nw = dragging ? 2.5 : 1.75
  const nh = dragging ? 16 : 13
  return (
    <div style={{ position: 'relative', height: h }}>
      {hint && (
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, opacity: 0.9,
            background: `linear-gradient(to right, ${hint.join(', ')})`,
          }}
        />
      )}
      <svg width={width} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <g fill={hover || dragging ? 'var(--text2)' : 'rgba(163,163,168,0.75)'} style={{ transition: 'fill 0.15s' }}>
          {ticks}
        </g>
      </svg>
      {/* 从默认值到当前值的那一段 */}
      <div
        style={{
          position: 'absolute', bottom: 0, height: 1.5, background: 'rgba(29,29,31,0.85)',
          left: Math.min(x, ox), width: Math.max(0, Math.abs(x - ox)),
        }}
      />
      {/* 指针 */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: x - nw / 2, width: nw, height: nh, borderRadius: 2,
          background: 'var(--text)',
          transition: springTransition(['width', 'height'], spring(0.4, 0.8)),
        }}
      />
    </div>
  )
}

const fineModifier = (e: { altKey: boolean; shiftKey: boolean }) => e.altKey || e.shiftKey

export interface ScrubRowProps {
  title: string
  value: number
  onChange: (v: number) => void
  range: [number, number]
  defaultValue?: number
  help?: string
  hint?: string[]
  decimals?: number
  suffix?: string
  dot?: string
}

export function ScrubRow({ title, value, onChange, range, defaultValue = 0, help, hint, decimals = 0, suffix = '', dot }: ScrubRowProps) {
  const [hover, setHover] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [rulerRef, { width }] = useSize<HTMLDivElement>()
  const drag = useRef<{ startX: number; startV: number; active: boolean; onRuler: boolean; id: number } | null>(null)

  const [lo, hi] = range
  const span = hi - lo
  const frac = CM.clamp((value - lo) / span)
  const originFrac = CM.clamp((defaultValue - lo) / span)
  const modified = Math.abs(value - defaultValue) > 0.0001

  // 指针位置用弹簧跟随（和 Mac 上 .animation(.spring(response: 0.28, dampingFraction: 0.82), value: frac) 一样）
  const shownFrac = useSpringValue(frac, spring(0.28, 0.82))
  const focus = useSpringValue(dragging ? 1 : hover ? 0.35 : 0, dragging ? spring(0.3, 0.75) : spring(0.4, 0.8))

  const valueText = useMemo(() => {
    const s = value.toFixed(decimals)
    const signed = lo < 0 && value > 0.00001 && defaultValue === 0 ? '+' + s : s
    return signed + suffix
  }, [value, decimals, lo, defaultValue, suffix])

  const set = useCallback(
    (raw: number) => {
      let v = Math.min(Math.max(raw, lo), hi)
      const p = Math.pow(10, decimals)
      v = Math.round(v * p) / p
      if (Math.abs(v - defaultValue) < span * 0.008) v = defaultValue
      if (v !== value) onChange(v)
    },
    [lo, hi, decimals, defaultValue, span, value, onChange],
  )

  /** 设置一个新值（双击复位、点刻度跳转）：参数立即生效，指针用弹簧过渡过去 */
  const animateTo = (target: number) => {
    const p = Math.pow(10, decimals)
    const v = Math.round(target * p) / p
    if (v !== value) onChange(v)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const onRuler = !!rulerRef.current?.contains(e.target as Node)
    drag.current = { startX: e.clientX, startV: value, active: false, onRuler, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (!d.active) {
      if (Math.abs(dx) < 2) return
      d.active = true
      d.startX = e.clientX
      setDragging(true)
      return
    }
    const delta = (dx / Math.max(width, 1)) * span * (fineModifier(e) ? 0.12 : 1)
    set(d.startV + delta)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.active) {
      setDragging(false)
    } else if (d.onRuler && rulerRef.current) {
      // 单击刻度尺：跳到那个位置
      const r = rulerRef.current.getBoundingClientRect()
      const f = CM.clamp((e.clientX - r.left) / Math.max(1, r.width))
      let v = Math.min(Math.max(lo + f * span, lo), hi)
      if (Math.abs(v - defaultValue) < span * 0.008) v = defaultValue
      animateTo(v)
    }
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null
        setDragging(false)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '9px 18px',
        background: hover || dragging ? 'var(--wash)' : 'transparent',
        transition: 'background-color 0.15s ease-out',
        touchAction: 'none',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 16, marginBottom: 7 }}
        onDoubleClick={() => animateTo(defaultValue)}
        data-help={L('双击恢复默认值 · 左右拖动调整 · 按住 Alt 微调', 'Double-click to reset · drag left or right · hold Alt to fine-tune')}
      >
        {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: 'none' }} />}
        <span style={{ fontSize: 12.5, fontWeight: modified ? 500 : 400, color: modified ? 'var(--text)' : 'var(--text2)', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        {help && <HelpBadge k={help} />}
        <span style={{ flex: 1, minWidth: 6 }} />
        <span className="mono" style={{ fontSize: 11.5, fontWeight: 500, color: modified ? 'var(--text)' : 'var(--text3)' }}>
          {valueText}
        </span>
      </div>
      <div ref={rulerRef}>
        <Ruler
          needle={shownFrac}
          focus={focus}
          hover={hover}
          dragging={dragging}
          hint={hint}
          frac={shownFrac}
          originFrac={originFrac}
          width={width}
        />
      </div>
    </div>
  )
}

// MARK: - 分页标签

export function InkTabs({ items, selection, onSelect }: { items: string[]; selection: number; onSelect: (i: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  const en = L('zh', 'en') === 'en'
  useLayoutEffect(() => {
    const el = refs.current[selection]
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth })
  }, [selection, items.join('|')])
  return (
    <div style={{ position: 'relative', display: 'flex', gap: en ? 14 : 20, padding: '12px 18px 0 18px' }}>
      {items.map((t, i) => (
        <button
          key={i}
          ref={(el) => (refs.current[i] = el)}
          onClick={() => onSelect(i)}
          style={{
            fontSize: en ? 12 : 12.5,
            fontWeight: i === selection ? 600 : 400,
            color: i === selection ? 'var(--text)' : 'var(--text3)',
            paddingBottom: 7 + 1.5,
            whiteSpace: 'nowrap',
            transition: 'color 0.2s',
          }}
        >
          {t}
        </button>
      ))}
      {bar && (
        <div
          style={{
            position: 'absolute', bottom: 0, height: 1.5, background: 'var(--text)',
            left: bar.left, width: bar.width,
            transition: springTransition(['left', 'width'], spring(0.42, 0.86)),
          }}
        />
      )}
    </div>
  )
}

/** 分页容器：切换时旧页失焦淡出、新页从虚到实 */
export function Pager({ tabs, selection, onSelect, children }: { tabs: string[]; selection: number; onSelect: (i: number) => void; children: (page: number) => ReactNode }) {
  const page = Math.min(selection, Math.max(0, tabs.length - 1))
  return (
    <div>
      {tabs.length > 1 && (
        <>
          <InkTabs items={tabs} selection={page} onSelect={onSelect} />
          <div className="hairline-h" />
        </>
      )}
      <FocusSwap swapKey={String(page) + tabs.length} style={{ padding: '6px 0' }}>
        {children(page)}
      </FocusSwap>
    </div>
  )
}

// MARK: - 分段选择

export function InkSegment<T>({ items, selection, onSelect, style }: { items: [T, string][]; selection: T; onSelect: (v: T) => void; style?: CSSProperties }) {
  const idx = Math.max(0, items.findIndex((i) => i[0] === selection))
  const n = items.length
  return (
    <div style={{ position: 'relative', display: 'flex', padding: 2, borderRadius: 7, background: 'var(--wash-strong)', ...style }}>
      <div
        style={{
          position: 'absolute', top: 2, bottom: 2, borderRadius: 5, background: 'white',
          boxShadow: '0 0.5px 1.5px rgba(0,0,0,0.1), 0 0 1px rgba(0,0,0,0.06)',
          width: `calc((100% - 4px) / ${n})`,
          left: `calc(2px + (100% - 4px) / ${n} * ${idx})`,
          transition: springTransition(['left'], spring(0.32, 0.82)),
        }}
      />
      {items.map(([v, label], i) => (
        <button
          key={i}
          onClick={() => onSelect(v)}
          style={{
            position: 'relative', flex: 1, height: 24, fontSize: 11.5, whiteSpace: 'nowrap',
            fontWeight: i === idx ? 600 : 400, color: i === idx ? 'var(--text)' : 'var(--text2)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// MARK: - 开关

export function InkSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        position: 'relative', width: 30, height: 18, borderRadius: 9, flex: 'none',
        background: on ? 'var(--text)' : 'var(--wash-strong)',
        boxShadow: on ? 'none' : 'inset 0 0 0 0.5px var(--line)',
        transition: 'background-color 0.25s ease-out',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 1.5px rgba(0,0,0,0.18)',
          transform: `translateX(${on ? 12 : 0}px)`,
          transition: springTransition(['transform'], spring(0.3, 0.72)),
        }}
      />
    </button>
  )
}

export function InkToggleRow({ title, on, onChange, help }: { title: string; on: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px' }}>
      <span style={{ fontSize: 12.5, color: on ? 'var(--text)' : 'var(--text2)' }}>{title}</span>
      {help && <HelpBadge k={help} />}
      <span style={{ flex: 1 }} />
      <InkSwitch on={on} onChange={onChange} />
    </div>
  )
}

// MARK: - 色块选择

export function ColorChip({ color, selected, modified = false, onClick }: { color: string; selected: boolean; modified?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ position: 'relative', width: 28, height: 34, display: 'grid', placeItems: 'center' }}>
      <span style={{ width: 20, height: 20, background: color, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.12)' }} />
      <span
        style={{
          position: 'absolute', width: 26, height: 26, left: 1, top: 4, boxShadow: 'inset 0 0 0 1.5px var(--text)',
          opacity: selected ? 1 : 0, transform: `scale(${selected ? 1 : 0.85})`,
          transition: springTransition(['transform', 'opacity'], spring(0.3, 0.75)),
        }}
      />
      {modified && <span style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', background: 'var(--text)', left: 12, top: 31 }} />}
    </button>
  )
}

// MARK: - 颜色选择（对应 Mac 的 ColorPicker：一个小色块，点开系统取色器）

export function ColorWell({ color, onChange }: { color: RGBColor; onChange: (c: RGBColor) => void }) {
  return (
    <label
      style={{
        position: 'relative', width: 36, height: 22, borderRadius: 6, flex: 'none', display: 'block',
        background: 'white', boxShadow: 'inset 0 0 0 0.5px var(--line-strong), 0 0.5px 1px rgba(0,0,0,0.06)',
        padding: 3,
      }}
    >
      <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: 3, background: cssColor(color), boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.12)' }} />
      <input
        type="color"
        value={hexString(color).toLowerCase()}
        onChange={(e) => onChange(parseHex(e.target.value))}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'default', border: 0, padding: 0 }}
      />
    </label>
  )
}

// MARK: - 会“流动”的直方图

/** 数组之间做缓动过渡 */
export function useAnimatedArray(target: number[] | null, duration = 300): number[] | null {
  const [cur, setCur] = useState(target)
  const curRef = useRef(target)
  const cancel = useRef<() => void>()
  useLayoutEffect(() => {
    cancel.current?.()
    const from = curRef.current
    if (!target || !from || from.length !== target.length) {
      curRef.current = target
      setCur(target)
      return
    }
    cancel.current = tween(duration, (t) => 1 - Math.pow(1 - t, 2), (k) => {
      const v = target.map((x, i) => from[i] + (x - from[i]) * k)
      curRef.current = v
      setCur(v)
    })
    return () => cancel.current?.()
  }, [target, duration])
  return cur
}

export function histPath(v: number[], w: number, h: number, filled: boolean) {
  const n = v.length
  if (n < 2) return ''
  const pt = (i: number) => `${((i / (n - 1)) * w).toFixed(2)},${(h - Math.sqrt(Math.max(0, v[i])) * h * 0.94).toFixed(2)}`
  let d = filled ? `M0,${h} L` : 'M'
  for (let i = 0; i < n; i++) d += (i ? ' L' : '') + pt(i)
  if (filled) d += ` L${w},${h} Z`
  return d
}

export function HistogramPanel({ histogram }: { histogram: Histogram | null }) {
  const [showRGB, setShowRGB] = useState(false)
  const [ref, { width }] = useSize<HTMLDivElement>()
  const luma = useAnimatedArray(histogram?.luma ?? null)
  const red = useAnimatedArray(histogram?.red ?? null)
  const green = useAnimatedArray(histogram?.green ?? null)
  const blue = useAnimatedArray(histogram?.blue ?? null)
  const H = 78
  const clip = (title: string, v: number) => {
    const warn = v > 0.003
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: warn ? 'var(--text)' : 'transparent', boxShadow: 'inset 0 0 0 0.8px var(--line-strong)' }} />
        <span className="mono" style={{ fontSize: 10, color: warn ? 'var(--text)' : 'var(--text3)' }}>
          {title} {(v * 100).toFixed(1)}%
        </span>
      </div>
    )
  }
  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text2)' }}>{L('直方图', 'Histogram')}</span>
        <HelpBadge k="histogram" />
        <span style={{ flex: 1 }} />
        <InkSegment items={[[false, L('亮度', 'Luma')], [true, 'RGB']]} selection={showRGB} onSelect={setShowRGB} style={{ width: 96 }} />
      </div>
      <div ref={ref} style={{ position: 'relative', height: H, boxShadow: 'inset 0 0 0 0.5px var(--line)' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 25}%`, width: 0.5, background: 'var(--line)' }} />
        ))}
        {histogram && luma ? (
          <svg width={width} height={H} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <linearGradient id="hgrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(29,29,31,0.22)" />
                <stop offset="1" stopColor="rgba(29,29,31,0.08)" />
              </linearGradient>
            </defs>
            <g style={{ opacity: showRGB ? 1 : 0, transition: 'opacity 0.35s ease-out', mixBlendMode: 'multiply' }}>
              {red && <path d={histPath(red, width, H, true)} fill="rgba(217,89,82,0.28)" style={{ mixBlendMode: 'multiply' }} />}
              {green && <path d={histPath(green, width, H, true)} fill="rgba(82,179,107,0.28)" style={{ mixBlendMode: 'multiply' }} />}
              {blue && <path d={histPath(blue, width, H, true)} fill="rgba(82,115,217,0.28)" style={{ mixBlendMode: 'multiply' }} />}
            </g>
            <path d={histPath(luma, width, H, true)} fill="url(#hgrad)" style={{ opacity: showRGB ? 0 : 1, transition: 'opacity 0.35s ease-out' }} />
            <path d={histPath(luma, width, H, false)} fill="none" stroke="rgba(29,29,31,0.7)" strokeWidth={1} />
          </svg>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--text3)' }}>
            {L('打开照片后显示', 'Appears when a photo is open')}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {clip(L('暗部溢出', 'Shadow clipping'), histogram?.clipLow ?? 0)}
        {clip(L('高光溢出', 'Highlight clipping'), histogram?.clipHigh ?? 0)}
      </div>
    </div>
  )
}

// MARK: - 色轮（低饱和、细线条）

export function ColorWheel({ hue, saturation, onChange, size = 176 }: { hue: number; saturation: number; onChange: (h: number, s: number) => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const r = size / 2
  const h = useSpringValue(hue, spring(0.25, 0.8))
  const s = useSpringValue(saturation, spring(0.25, 0.8))
  const angle = (h * Math.PI) / 180
  const dist = (s / 100) * r
  const px = r + Math.cos(angle) * dist
  const py = r + Math.sin(angle) * dist
  const stops = useMemo(() => Array.from({ length: 25 }, (_, i) => muted((360 * i) / 24)).join(', '), [])

  const handle = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const dx = e.clientX - rect.left - r
    const dy = e.clientY - rect.top - r
    let a = (Math.atan2(dy, dx) * 180) / Math.PI
    if (a < 0) a += 360
    const k = Math.min(1, Math.hypot(dx, dy) / r)
    onChange(Math.round(a), Math.round(k * 100))
  }
  return (
    <div
      ref={ref}
      style={{ position: 'relative', width: size, height: size, borderRadius: '50%', touchAction: 'none' }}
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        handle(e)
      }}
      onPointerMove={(e) => e.buttons & 1 && handle(e)}
      onDoubleClick={() => {
        const from = saturation
        tween(450, (t) => 1 - Math.pow(1 - t, 3), (k) => onChange(hue, Math.round(from * (1 - k))))
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from 90deg, ${stops})` }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle closest-side, ${gray(0.96)}, rgba(245,245,245,0))` }} />
      {[0.33, 0.66].map((k) => (
        <div
          key={k}
          style={{
            position: 'absolute', left: r - (size * k) / 2, top: r - (size * k) / 2, width: size * k, height: size * k,
            borderRadius: '50%', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.06)',
          }}
        />
      ))}
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={`M0 ${r} H${size} M${r} 0 V${size}`} stroke="rgba(0,0,0,0.08)" strokeWidth={0.5} />
        <circle cx={r} cy={r} r={r - 0.25} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} />
        <line x1={r} y1={r} x2={px} y2={py} stroke="rgba(29,29,31,0.6)" strokeWidth={1} />
      </svg>
      <div
        style={{
          position: 'absolute', left: px - 8, top: py - 8, width: 16, height: 16, borderRadius: '50%', background: 'white',
          boxShadow: 'inset 0 0 0 1.5px var(--text), 0 1px 3px rgba(0,0,0,0.2)', display: 'grid', placeItems: 'center',
        }}
      >
        {saturation >= 1 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: muted(hue, 0.7, 0.85) }} />}
      </div>
    </div>
  )
}

// MARK: - 文字

export function NoteText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5, padding: '10px 18px', ...style }}>{children}</div>
}

export const Hint = {
  spectrum: (from = 0, to = 360, steps = 12) => Array.from({ length: steps + 1 }, (_, i) => muted(from + ((to - from) * i) / steps)),
  temperature: ['rgb(140,173,219)', gray(0.86), 'rgb(224,194,122)'],
  tint: ['rgb(143,199,153)', gray(0.86), 'rgb(214,153,204)'],
  cyanRed: ['rgb(128,199,209)', gray(0.86), 'rgb(219,133,128)'],
  magentaGreen: ['rgb(214,143,204)', gray(0.86), 'rgb(143,199,148)'],
  yellowBlue: ['rgb(224,209,128)', gray(0.86), 'rgb(133,153,219)'],
  tone: [gray(0.15), gray(0.95)],
}

export { ease }
