import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animateSpring, focusPullIn, focusPullOut, Spring, spring } from '../anim'

/**
 * 弹簧驱动的数值：目标变化时从当前位置和速度继续（和 SwiftUI 的弹簧动画一样会保留速度）。
 * 返回当前动画中的值。
 */
export function useSpringValue(target: number, s: Spring, immediate = false): number {
  const [value, setValue] = useState(target)
  const st = useRef({ x: target, v: 0, target, raf: 0, last: 0 })
  useEffect(() => {
    const S = st.current
    S.target = target
    if (immediate) {
      cancelAnimationFrame(S.raf)
      S.raf = 0
      S.x = target
      S.v = 0
      setValue(target)
      return
    }
    if (S.raf) return
    const k = (2 * Math.PI / s.response) ** 2
    const c = (4 * Math.PI * s.damping) / s.response
    S.last = performance.now()
    const step = (now: number) => {
      let dt = Math.min(0.05, (now - S.last) / 1000)
      S.last = now
      // 小步长积分，数值稳定
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240)
        const a = -k * (S.x - S.target) - c * S.v
        S.v += a * h
        S.x += S.v * h
        dt -= h
      }
      const span = Math.max(1e-6, Math.abs(S.target) + 1)
      if (Math.abs(S.x - S.target) < 1e-4 * span && Math.abs(S.v) < 1e-3 * span) {
        S.x = S.target
        S.v = 0
        S.raf = 0
        setValue(S.target)
        return
      }
      setValue(S.x)
      S.raf = requestAnimationFrame(step)
    }
    S.raf = requestAnimationFrame(step)
  }, [target, s.response, s.damping, immediate])
  useEffect(
    () => () => {
      cancelAnimationFrame(st.current.raf)
      st.current.raf = 0
    },
    [],
  )
  return value
}

/** 跟踪一个元素的尺寸 */
export function useSize<T extends HTMLElement>(): [React.RefObject<T>, { width: number; height: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize((old) => (old.width === r.width && old.height === r.height ? old : { width: r.width, height: r.height }))
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    setSize({ width: r.width, height: r.height })
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

interface SwapItem {
  key: string
  node: ReactNode
  leaving: boolean
}

/**
 * 内容切换：旧内容失焦淡出，新内容从虚到实（.transition(.focusPull)）。
 * 旧内容在离开动画期间绝对定位叠在上面，不占位置。
 */
export function FocusSwap({
  swapKey,
  children,
  spring: sp = spring(0.42, 0.86),
  style,
  className,
  initial = false,
}: {
  swapKey: string
  children: ReactNode
  spring?: Spring
  style?: CSSProperties
  className?: string
  /** 第一次出现时也播放进入动画 */
  initial?: boolean
}) {
  const [items, setItems] = useState<SwapItem[]>([{ key: swapKey, node: children, leaving: false }])
  const first = useRef(!initial)

  // 同一个 key：直接更新内容
  if (items.length && items[items.length - 1].key === swapKey && items[items.length - 1].node !== children) {
    const copy = items.slice()
    copy[copy.length - 1] = { ...copy[copy.length - 1], node: children }
    setItems(copy)
  } else if (!items.some((i) => i.key === swapKey && !i.leaving)) {
    // 切回一个还在淡出的内容时，先去掉它的旧副本，避免重复的 key
    setItems([...items.filter((i) => i.key !== swapKey).map((i) => ({ ...i, leaving: true })), { key: swapKey, node: children, leaving: false }])
  }

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {items.map((it) => (
        <SwapChild
          key={it.key}
          leaving={it.leaving}
          animateIn={!first.current}
          spring={sp}
          onGone={() => setItems((all) => all.filter((x) => x.key !== it.key || !x.leaving))}
          onMounted={() => (first.current = false)}
        >
          {it.node}
        </SwapChild>
      ))}
    </div>
  )
}

function SwapChild({
  children, leaving, animateIn, spring: sp, onGone, onMounted,
}: { children: ReactNode; leaving: boolean; animateIn: boolean; spring: Spring; onGone: () => void; onMounted: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (animateIn && ref.current) animateSpring(ref.current, focusPullIn, sp)
    onMounted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useLayoutEffect(() => {
    if (!leaving || !ref.current) return
    const a = animateSpring(ref.current, focusPullOut, sp)
    a.onfinish = onGone
    return () => a.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving])
  return (
    <div
      ref={ref}
      style={
        leaving
          ? { position: 'absolute', left: 0, right: 0, top: 0, pointerEvents: 'none', transformOrigin: 'top center' }
          : { transformOrigin: 'top center' }
      }
    >
      {children}
    </div>
  )
}

/**
 * 出现 / 消失的过渡（SwiftUI 里 if 条件 + .transition）。
 * enter / exit 是 Web Animations 关键帧；exit 不传就用 enter 倒放。
 */
export function Presence({
  show,
  children,
  enter,
  exit,
  spring: sp = spring(0.4, 0.86),
  exitSpring,
  style,
  className,
  initial = true,
}: {
  show: boolean
  children: ReactNode
  enter: Keyframe[]
  exit?: Keyframe[]
  spring?: Spring
  exitSpring?: Spring
  style?: CSSProperties
  className?: string
  initial?: boolean
}) {
  const [mounted, setMounted] = useState(show)
  const [content, setContent] = useState(children)
  const ref = useRef<HTMLDivElement>(null)
  const firstRun = useRef(true)
  const anim = useRef<Animation | null>(null)

  useEffect(() => {
    if (show) setContent(children)
  }, [show, children])

  useEffect(() => {
    if (show) setMounted(true)
  }, [show])

  useLayoutEffect(() => {
    const el = ref.current
    const isFirst = firstRun.current
    firstRun.current = false
    if (!el) return
    if (show) {
      if (isFirst && !initial) return
      anim.current?.cancel()
      anim.current = animateSpring(el, enter, sp)
    } else if (mounted) {
      anim.current?.cancel()
      const a = animateSpring(el, exit ?? [...enter].reverse(), exitSpring ?? sp)
      anim.current = a
      a.onfinish = () => setMounted(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, mounted])

  if (!mounted) return null
  return (
    <div ref={ref} className={className} style={{ ...style, pointerEvents: show ? style?.pointerEvents : 'none' }}>
      {show ? children : content}
    </div>
  )
}

/**
 * 带动画的列表：新项目播放进入动画，删掉的项目播放离开动画，其他项目平滑挪到新位置（FLIP）。
 * 对应 SwiftUI ForEach + transition + withAnimation。
 */
export function AnimatedList<T>({
  items,
  keyOf,
  render,
  enter,
  exit,
  spring: sp = spring(0.45, 0.82),
  moveSpring,
  style,
  className,
}: {
  items: T[]
  keyOf: (t: T) => string
  render: (t: T, leaving: boolean) => ReactNode
  enter: Keyframe[]
  exit?: Keyframe[]
  spring?: Spring
  moveSpring?: Spring
  style?: CSSProperties
  className?: string
}) {
  type Row = { key: string; item: T; leaving: boolean }
  const [rows, setRows] = useState<Row[]>(() => items.map((i) => ({ key: keyOf(i), item: i, leaving: false })))
  const els = useRef(new Map<string, HTMLElement>())
  const rects = useRef(new Map<string, { left: number; top: number }>())
  const mountedKeys = useRef(new Set(items.map(keyOf)))
  const exiting = useRef(new Set<string>())

  // 合并：保留正在离开的项目在原来的位置
  const nextKeys = items.map(keyOf)
  const same = rows.filter((r) => !r.leaving).map((r) => r.key).join('|') === nextKeys.join('|') && rows.every((r) => r.leaving || items[nextKeys.indexOf(r.key)] === r.item)
  if (!same) {
    // 先按新顺序放，再把离开的插回原来的位置附近
    const nextSet = new Set(nextKeys)
    const result: Row[] = items.map((it) => ({ key: keyOf(it), item: it, leaving: false }))
    rows.forEach((r, idx) => {
      if (!nextSet.has(r.key)) result.splice(Math.min(idx, result.length), 0, { ...r, leaving: true })
    })
    setRows(result)
  }

  useLayoutEffect(() => {
    const ms = moveSpring ?? sp
    els.current.forEach((el, key) => {
      const now = { left: el.offsetLeft, top: el.offsetTop }
      const prev = rects.current.get(key)
      const row = rows.find((r) => r.key === key)
      if (!row) return
      if (!mountedKeys.current.has(key)) {
        mountedKeys.current.add(key)
        animateSpring(el, enter, sp)
      } else if (row.leaving && !exiting.current.has(key)) {
        exiting.current.add(key)
        const a = animateSpring(el, exit ?? [...enter].reverse(), sp)
        a.onfinish = () => {
          exiting.current.delete(key)
          mountedKeys.current.delete(key)
          setRows((rs) => rs.filter((r) => !(r.key === key && r.leaving)))
        }
      } else if (prev && !row.leaving && (Math.abs(prev.left - now.left) > 0.5 || Math.abs(prev.top - now.top) > 0.5)) {
        const dx = prev.left - now.left
        const dy = prev.top - now.top
        animateSpring(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], ms)
      }
    })
    rects.current.clear()
    els.current.forEach((el, key) => rects.current.set(key, { left: el.offsetLeft, top: el.offsetTop }))
  })

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {rows.map((r) => (
        <div
          key={r.key}
          ref={(el) => {
            if (el) els.current.set(r.key, el)
            else els.current.delete(r.key)
          }}
          style={r.leaving ? { pointerEvents: 'none' } : undefined}
        >
          {render(r.item, r.leaving)}
        </div>
      ))}
    </div>
  )
}

export const fx = {
  opacity: [{ opacity: 0 }, { opacity: 1 }] as Keyframe[],
  moveTopFade: [
    { transform: 'translateY(-60px)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1 },
  ] as Keyframe[],
  moveTopFadeScale: (s: number) =>
    [
      { transform: `translateY(-60px) scale(${s})`, opacity: 0 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ] as Keyframe[],
  moveBottomFade: [
    { transform: 'translateY(160px)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1 },
  ] as Keyframe[],
  scaleFade: (s: number) =>
    [
      { transform: `scale(${s})`, opacity: 0 },
      { transform: 'scale(1)', opacity: 1 },
    ] as Keyframe[],
  focusPullIn,
  focusPullOut,
}
