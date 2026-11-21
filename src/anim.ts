// 动画工具：把 SwiftUI 的 spring(response:dampingFraction:) 和 timingCurve 换算成 CSS / Web Animations，
// 保证 Windows 版和 Mac 版的动画曲线、时长一样。

export interface Spring {
  response: number
  damping: number
}

export const spring = (response: number, damping: number): Spring => ({ response, damping })

/** 弹簧位移曲线：0 → 1（质量 1，刚度 (2π/response)²，阻尼比 dampingFraction —— 和 SwiftUI 的定义一致） */
function springValue(t: number, s: Spring): number {
  const w0 = (2 * Math.PI) / s.response
  const z = s.damping
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z)
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
  }
  // 临界阻尼
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
}

/** 弹簧安静下来所需的时间（误差小于 0.1%） */
function settleTime(s: Spring): number {
  const dt = 1 / 240
  let last = 0
  for (let t = 0; t < 5; t += dt) {
    const v = springValue(t, s)
    if (Math.abs(1 - v) > 0.001) last = t
  }
  return Math.max(0.05, last + dt)
}

const cache = new Map<string, { easing: string; duration: number }>()

/** 生成 CSS 的 linear() 缓动函数和时长（毫秒） */
export function springCSS(s: Spring): { easing: string; duration: number } {
  const key = `${s.response}/${s.damping}`
  const hit = cache.get(key)
  if (hit) return hit
  const T = settleTime(s)
  const n = Math.min(80, Math.max(24, Math.round(T * 60)))
  const pts: string[] = []
  for (let i = 0; i <= n; i++) {
    const v = i === n ? 1 : springValue((i / n) * T, s)
    pts.push(+v.toFixed(4) + '')
  }
  const r = { easing: `linear(${pts.join(', ')})`, duration: Math.round(T * 1000) }
  cache.set(key, r)
  return r
}

/** CSS transition 简写，例如 transition: springTransition(['transform', 'opacity'], spring(0.4, 0.86)) */
export function springTransition(props: string[], s: Spring, delayMs = 0): string {
  const { easing, duration } = springCSS(s)
  return props.map((p) => `${p} ${duration}ms ${easing} ${delayMs}ms`).join(', ')
}

export const ease = {
  /** SwiftUI .easeOut */
  out: 'cubic-bezier(0, 0, 0.58, 1)',
  in: 'cubic-bezier(0.42, 0, 1, 1)',
  inOut: 'cubic-bezier(0.42, 0, 0.58, 1)',
}

/** SwiftUI .snappy(duration:) 近似（阻尼比约 0.85 的弹簧） */
export const snappy = (d = 0.2) => spring(d * 1.25, 0.85)

// MARK: - 三次贝塞尔（SwiftUI 的 timingCurve）

export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x
      const d = dx(t)
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break
      t -= e / d
    }
    return sy(Math.min(1, Math.max(0, t)))
  }
}

export const springFn = (s: Spring) => {
  const T = settleTime(s)
  return { fn: (x: number) => (x >= 1 ? 1 : springValue(x * T, s)), duration: T * 1000 }
}

/** 用 requestAnimationFrame 推进一个 0→1 的进度；返回取消函数 */
export function tween(durationMs: number, easing: (t: number) => number, onFrame: (p: number) => void, onDone?: () => void): () => void {
  let raf = 0
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs)
    onFrame(easing(t))
    if (t < 1) raf = requestAnimationFrame(step)
    else onDone?.()
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

// MARK: - 对焦转场：旧内容失焦淡出，新内容从虚到实（Theme.swift 里的 focusPull）

export const focusPullIn: Keyframe[] = [
  { filter: 'blur(12px)', opacity: 0, transform: 'scale(0.985)' },
  { filter: 'blur(0px)', opacity: 1, transform: 'scale(1)' },
]
export const focusPullOut: Keyframe[] = [
  { filter: 'blur(0px)', opacity: 1, transform: 'scale(1)' },
  { filter: 'blur(8px)', opacity: 0, transform: 'scale(1.01)' },
]

export function animateSpring(el: Element, frames: Keyframe[], s: Spring, delayMs = 0): Animation {
  const { easing, duration } = springCSS(s)
  return el.animate(frames, { duration, easing, delay: delayMs, fill: 'both' })
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
