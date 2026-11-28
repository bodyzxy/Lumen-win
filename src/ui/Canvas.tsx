import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animateSpring, bezier, spring, Spring, springTransition, tween } from '../anim'
import { CM } from '../engine/colormath'
import { L } from '../i18n'
import { ApplyBanner, doc, eyedropperHint, FilmItem, useDoc } from '../model/doc'
import { hexString, cssColor, RGBColor } from '../model/types'
import { Bitmap } from './Bitmap'
import { Icon } from './icons'
import { BareIcon, GlassButton, TextLink } from './kit'
import { AnimatedList, FocusSwap, fx, Presence, useSize } from './motion'
import { openMenu } from './overlays'

/**
 * 中间的画布：照片舞台 + 底部的控制条和胶片条 + 顶部的提示
 *
 * 缩放方式：
 * · 触控板双指捏合缩放，双指滑动平移
 * · 鼠标滚轮缩放；按住 Ctrl 或 Alt 滚动也是缩放
 * · 放大后可以直接拖动照片
 * · 双击在“适应窗口”和“100% 原始像素”之间切换
 */
export function CanvasView() {
  const [ref, full] = useSize<HTMLDivElement>()
  const hasImage = useDoc((d) => d.hasImage)
  const imageSize = useDoc((d) => d.imageSize)
  const isCropping = useDoc((d) => d.isCropping)
  const crop = useDoc((d) => d.state.crop)
  const preview = useDoc((d) => d.previewImage)
  const original = useDoc((d) => d.originalImage)
  const activeID = useDoc((d) => d.activeID)
  const isLoading = useDoc((d) => d.isLoading)
  const isExporting = useDoc((d) => d.isExporting)
  const banner = useDoc((d) => d.applyBanner)
  const eyedropper = useDoc((d) => d.eyedropper)
  const toast = useDoc((d) => d.toast)
  const dropHover = useDoc((d) => d.dropHover)
  const zoom = useDoc((d) => d.zoom)
  const pan = useDoc((d) => d.pan)
  const viewAnim = useDoc((d) => d.viewAnimation)
  const viewToken = useDoc((d) => d.viewAnimationToken)
  const error = useDoc((d) => d.error)

  /** 底部控制条 + 胶片条占用的高度 */
  const bottomReserve = hasImage ? 132 : 0
  const stage = { width: full.width, height: Math.max(100, full.height - bottomReserve) }

  /** 照片在“适应窗口”时的显示尺寸（严格按原图比例） */
  const fit = (() => {
    const W = preview?.width ?? imageSize.width
    const H = preview?.height ?? imageSize.height
    if (W <= 0 || H <= 0) return { width: 0, height: 0 }
    const k = Math.min(Math.max(10, stage.width - 64) / W, Math.max(10, stage.height - 48) / H)
    return { width: W * k, height: H * k }
  })()

  useEffect(() => {
    doc.updateViewport(stage, fit)
  }, [stage.width, stage.height, fit.width, fit.height])

  // 缩放 / 平移：手势时立即跟手，按钮、双击时用弹簧过渡
  const view = useViewSpring(zoom, pan, viewAnim, viewToken)

  // 拖动平移
  const dragRef = useRef<{ x: number; y: number; pan: { x: number; y: number }; samples: { t: number; x: number; y: number }[] } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || doc.zoom <= 1.01 || doc.eyedropper) return
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, pan: { ...doc.pan }, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    d.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY })
    if (d.samples.length > 6) d.samples.shift()
    doc.setView(doc.zoom, { x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y }, null)
  }
  const onPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    // 松手后带一点惯性
    const a = d.samples[0], b = d.samples[d.samples.length - 1]
    const dt = Math.max(1, b.t - a.t) / 1000
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt
    const target = doc.clampedPan({ x: doc.pan.x + vx * 0.08, y: doc.pan.y + vy * 0.08 })
    doc.setView(doc.zoom, target, spring(0.5, 0.86))
  }

  // 滚轮 / 触控板：放大时平移，按住 Ctrl/Alt、双指捏合或使用鼠标滚轮时缩放
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!doc.hasImage) return
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      const stageH = Math.max(100, r.height - 132)
      // 鼠标在底部胶片条上时，不拦截
      if (py > stageH) return
      e.preventDefault()
      const anchor = { x: px - r.width / 2, y: py - stageH / 2 }
      const isMouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50)
      const wantsZoom = e.ctrlKey || e.altKey || e.metaKey || isMouseWheel
      if (wantsZoom) {
        const k = e.ctrlKey && !isMouseWheel ? 0.012 : 0.0012
        const dy = -(e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY) * k
        if (dy === 0) return
        doc.setZoom(doc.zoom * Math.exp(dy), anchor, null)
        if (doc.zoom <= 1.001) doc.setView(1, { x: 0, y: 0 }, null)
        return
      }
      if (doc.zoom <= 1.01) return
      doc.setView(doc.zoom, doc.clampedPan({ x: doc.pan.x - e.deltaX, y: doc.pan.y - e.deltaY }), null)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!doc.hasImage || doc.eyedropper) return
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - r.top
    if (y > stage.height) return
    doc.toggleActualSize({ x: e.clientX - r.left - stage.width / 2, y: y - stage.height / 2 })
  }

  const w = fit.width * view.zoom
  const h = fit.height * view.zoom

  return (
    <div
      ref={ref}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--paper)', cursor: zoom > 1.01 && !eyedropper ? (dragRef.current ? 'grabbing' : 'grab') : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {preview && original && activeID ? (
        <div
          style={{
            position: 'absolute', left: stage.width / 2 - w / 2 + view.pan.x, top: stage.height / 2 - h / 2 + view.pan.y, width: w, height: h,
          }}
        >
          <PhotoView key={activeID} id={activeID} edited={preview} original={original} width={w} height={h} />
          {isCropping && <CropOverlay x={crop.x} y={crop.y} width={crop.width} height={crop.height} stageW={w} stageH={h} />}
        </div>
      ) : isLoading ? (
        <Spinner style={{ position: 'absolute', left: stage.width / 2 - 9, top: stage.height / 2 - 9 }} />
      ) : null}

      <Presence show={!hasImage && !isLoading} enter={fx.opacity} spring={spring(0.5, 0.86)} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <EmptyStage hover={dropHover} error={error} />
      </Presence>

      {/* 顶部提示 */}
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>
        <Presence show={!!banner} enter={fx.moveTopFadeScale(0.96)} spring={spring(0.5, 0.82)} style={{ pointerEvents: 'auto' }}>
          {banner && <ApplyBannerView banner={banner} />}
        </Presence>
        <Presence show={!!eyedropper} enter={fx.moveTopFade} spring={spring(0.45, 0.86)} style={{ pointerEvents: 'auto' }}>
          {eyedropper && <EyedropperBanner text={eyedropperHint(eyedropper)} />}
        </Presence>
        <Presence show={!!toast} enter={fx.moveTopFadeScale(0.9)} spring={spring(0.4, 0.85)} exitSpring={spring(0.3, 1)}>
          <div className="glass" style={{ height: 32, padding: '0 16px', borderRadius: 16, display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {toast}
          </div>
        </Presence>
      </div>

      {/* 底部：控制条 + 胶片条 */}
      <Presence
        show={hasImage}
        enter={fx.moveBottomFade}
        spring={spring(0.5, 0.86)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
      >
        <div data-nodrag style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }} onDoubleClick={(e) => e.stopPropagation()}>
          <CanvasControlBar />
          <Filmstrip />
        </div>
      </Presence>

      <Presence show={isExporting} enter={fx.scaleFade(0.96)} spring={spring(0.3, 1)} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div className="glass" style={{ padding: 22, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Spinner />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{L('正在导出全尺寸照片', 'Exporting full-size photo')}</span>
        </div>
      </Presence>
    </div>
  )
}

/** 缩放和平移的弹簧（gesture 时直接跟手） */
function useViewSpring(zoom: number, pan: { x: number; y: number }, anim: Spring | null, token: number) {
  const [v, setV] = useState({ zoom, pan })
  const st = useRef({ x: [zoom, pan.x, pan.y], vel: [0, 0, 0], raf: 0, last: 0, target: [zoom, pan.x, pan.y], k: 0, c: 0 })
  useEffect(() => {
    const S = st.current
    S.target = [zoom, pan.x, pan.y]
    if (!anim) {
      cancelAnimationFrame(S.raf)
      S.raf = 0
      S.x = [...S.target]
      S.vel = [0, 0, 0]
      setV({ zoom, pan })
      return
    }
    S.k = (2 * Math.PI / anim.response) ** 2
    S.c = (4 * Math.PI * anim.damping) / anim.response
    if (S.raf) return
    S.last = performance.now()
    const step = (now: number) => {
      let dt = Math.min(0.05, (now - S.last) / 1000)
      S.last = now
      while (dt > 0) {
        const hh = Math.min(dt, 1 / 240)
        for (let i = 0; i < 3; i++) {
          const a = -S.k * (S.x[i] - S.target[i]) - S.c * S.vel[i]
          S.vel[i] += a * hh
          S.x[i] += S.vel[i] * hh
        }
        dt -= hh
      }
      const done = S.x.every((x, i) => Math.abs(x - S.target[i]) < (i === 0 ? 1e-4 : 0.05)) && S.vel.every((x, i) => Math.abs(x) < (i === 0 ? 1e-3 : 0.5))
      if (done) {
        S.x = [...S.target]
        S.raf = 0
        setV({ zoom: S.x[0], pan: { x: S.x[1], y: S.x[2] } })
        return
      }
      setV({ zoom: S.x[0], pan: { x: S.x[1], y: S.x[2] } })
      S.raf = requestAnimationFrame(step)
    }
    S.raf = requestAnimationFrame(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  useEffect(
    () => () => {
      cancelAnimationFrame(st.current.raf)
      st.current.raf = 0
    },
    [],
  )
  return v
}

export function Spinner({ style }: { style?: CSSProperties }) {
  return (
    <div style={{ width: 18, height: 18, ...style }}>
      <svg width={18} height={18} viewBox="0 0 18 18" style={{ animation: 'lumen-spin 0.9s linear infinite' }}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={8.25} y={1.5} width={1.5} height={4.5} rx={0.75} fill="var(--text2)" opacity={0.2 + (i / 8) * 0.8} transform={`rotate(${i * 45} 9 9)`} />
        ))}
      </svg>
    </div>
  )
}

// MARK: - 照片

function PhotoView({ id, edited, original, width, height }: { id: string; edited: ImageBitmap; original: ImageBitmap; width: number; height: number }) {
  const detail = useDoc((d) => d.currentDetail)
  const compare = useDoc((d) => d.compareMode)
  const split = useDoc((d) => d.splitPosition)
  const showOriginal = useDoc((d) => d.showOriginal)
  const sweepToken = useDoc((d) => d.sweepToken)
  const developToken = useDoc((d) => d.developToken)
  const eyedropper = useDoc((d) => d.eyedropper)
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<HTMLDivElement>(null)
  const [wipe, setWipe] = useState(showOriginal ? 1 : 0)
  const wipeAnim = useRef<() => void>()

  // 胶片条 → 画布 的形变过渡（matchedGeometryEffect）
  useLayoutEffect(() => {
    const el = outer.current
    const cell = document.querySelector(`[data-film-id="${id}"]`)
    if (!el || !cell) return
    const a = cell.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    if (b.width < 2 || a.width < 2) return
    const sx = a.width / b.width, sy = a.height / b.height
    animateSpring(
      el,
      [
        { transformOrigin: '0 0', transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${sx}, ${sy})`, opacity: 0.6 },
        { transformOrigin: '0 0', transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
      ],
      spring(0.55, 0.86),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 显影：从发白、失焦、无色，慢慢浮现出影像（新照片的第一帧出来时播放一次）
  useLayoutEffect(() => {
    if (doc.developID !== id) return
    doc.developID = null
    const el = inner.current
    if (!el) return
    const curve = bezier(0.16, 0.8, 0.24, 1)
    const frames: Keyframe[] = []
    for (let i = 0; i <= 40; i++) {
      const p = curve(i / 40)
      frames.push({
        offset: i / 40,
        filter: `saturate(${p}) brightness(${1 + (1 - p) * 0.35}) blur(${(1 - p) * 26}px)`,
        transform: `scale(${1 + (1 - p) * 0.035})`,
        opacity: Math.min(1, p * 2.2),
      })
    }
    el.animate(frames, { duration: 1600, easing: 'linear' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developToken])

  // 扫光：套用风格时一道光扫过照片
  const lastSweep = useRef(sweepToken)
  useEffect(() => {
    if (sweepToken === lastSweep.current) return
    lastSweep.current = sweepToken
    sweepRef.current?.animate(
      [{ transform: `translateX(${-1.4 * width}px) rotate(16deg)` }, { transform: `translateX(${1.4 * width}px) rotate(16deg)` }],
      { duration: 1100, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepToken])

  // 按住看原图：擦除式过渡
  useEffect(() => {
    wipeAnim.current?.()
    const from = wipe
    const to = showOriginal ? 1 : 0
    const curve = bezier(0.6, 0, 0.2, 1)
    wipeAnim.current = tween(550 * Math.max(0.2, Math.abs(to - from)), curve, (p) => setWipe(from + (to - from) * p))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOriginal])

  const a = CM.clamp(wipe * 1.25 - 0.25) * 100
  const b = CM.clamp(wipe * 1.25) * 100
  const wipeMask = `linear-gradient(to right, black ${a}%, transparent ${Math.max(a + 0.01, b)}%)`

  const fill: CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }

  return (
    <div
      ref={outer}
      style={{
        position: 'absolute', inset: 0,
        boxShadow: '0 12px 44px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div ref={inner} style={{ ...fill, overflow: 'hidden' }}>
        <Bitmap image={edited} style={fill} />
        {/* 放大时的原图分辨率局部 */}
        <Presence show={!!detail} enter={fx.opacity} spring={spring(0.25, 1)} style={{ ...fill, pointerEvents: 'none' }}>
          {detail && (
            <Bitmap
              image={detail.image}
              style={{ position: 'absolute', left: `${detail.rect.x * 100}%`, top: `${detail.rect.y * 100}%`, width: `${detail.rect.w * 100}%`, height: `${detail.rect.h * 100}%` }}
            />
          )}
        </Presence>
        {/* 按住看原图 */}
        {wipe > 0.0001 && (
          <div style={{ ...fill, WebkitMaskImage: wipeMask, maskImage: wipeMask, pointerEvents: 'none' }}>
            <Bitmap image={original} style={fill} />
          </div>
        )}
        {compare === 'split' && (
          <div style={{ ...fill, clipPath: `inset(0 ${(1 - split) * 100}% 0 0)`, pointerEvents: 'none' }}>
            <Bitmap image={original} style={fill} />
          </div>
        )}
        {/* 扫光 */}
        <div style={{ ...fill, overflow: 'hidden', pointerEvents: 'none' }}>
          <div
            ref={sweepRef}
            style={{
              position: 'absolute', top: '-30%', height: '160%', width: width * 0.32, left: width / 2 - width * 0.16,
              background: 'linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.55), rgba(255,255,255,0))',
              mixBlendMode: 'soft-light',
              transform: `translateX(${-1.4 * width}px) rotate(16deg)`,
            }}
          />
        </div>
      </div>
      <div style={{ ...fill, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.06)', pointerEvents: 'none' }} />

      <Presence show={compare === 'split'} enter={fx.opacity} spring={spring(0.4, 0.86)} style={{ ...fill, pointerEvents: 'none' }}>
        <SplitHandle width={width} height={height} split={split} />
      </Presence>

      {eyedropper && <EyedropperLayer edited={edited} width={width} height={height} />}

      <Presence show={showOriginal} enter={fx.opacity} spring={spring(0.3, 1)} style={{ position: 'absolute', left: 12, top: 12, pointerEvents: 'none' }}>
        <Tag>{L('原图', 'Original')}</Tag>
      </Presence>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass" style={{ height: 20, padding: '0 9px', borderRadius: 10, fontSize: 10.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
      {children}
    </div>
  )
}

function SplitHandle({ width, height, split }: { width: number; height: number; split: number }) {
  const x = width * split
  const onMove = (e: React.PointerEvent) => {
    if (!(e.buttons & 1)) return
    const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    doc.set('splitPosition', Math.min(Math.max((e.clientX - r.left) / r.width, 0.02), 0.98))
  }
  return (
    <>
      <div style={{ position: 'absolute', left: x - 0.5, top: 0, width: 1, height, background: 'white', boxShadow: '0 0 1px rgba(0,0,0,0.25)' }} />
      <div style={{ position: 'absolute', left: x - 75, top: 12, width: 150, display: 'flex', justifyContent: 'space-between' }}>
        <Tag>{L('原图', 'Original')}</Tag>
        <Tag>{L('调整后', 'Edited')}</Tag>
      </div>
      {/* 只有分割线附近可以拖，其他地方的拖动留给平移 */}
      <div
        data-nodrag
        style={{ position: 'absolute', left: x - 20, top: 0, width: 40, height, cursor: 'ew-resize', pointerEvents: 'auto', display: 'grid', placeItems: 'center', touchAction: 'none' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={onMove}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="glass" style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center' }}>
          <Icon name="arrow.left.and.right" size={10} weight="semibold" />
        </div>
      </div>
    </>
  )
}

/** 吸管模式：放大镜跟随鼠标，点击取色 */
function EyedropperLayer({ edited, width, height }: { edited: ImageBitmap; width: number; height: number }) {
  const [p, setP] = useState<{ x: number; y: number } | null>(null)
  return (
    <div
      data-nodrag
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
      onPointerMove={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setP({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onPointerLeave={() => setP(null)}
      onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        doc.pick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
      }}
    >
      <Presence show={!!p} enter={fx.scaleFade(0.6)} spring={spring(0.25, 0.85)} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        {p && (
          <div style={{ transform: `translate(${p.x - 56}px, ${p.y - 56 - 74}px)` }}>
            <Loupe image={edited} width={width} height={height} point={p} color={doc.sampleForLoupe(p.x / width, p.y / height)} />
          </div>
        )}
      </Presence>
    </div>
  )
}

/** 吸管放大镜 */
function Loupe({ image, width, height, point, color }: { image: ImageBitmap; width: number; height: number; point: { x: number; y: number }; color: RGBColor | null }) {
  const size = 112
  const zoom = 6
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = size * dpr
    c.height = size * dpr
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    // 屏幕上 1 点对应位图多少像素
    const k = image.width / width
    const srcW = (size / zoom) * k
    const srcH = (size / zoom) * (image.height / height)
    const sx = point.x * k - srcW / 2
    const sy = point.y * (image.height / height) - srcH / 2
    ctx.fillStyle = '#ddd'
    ctx.fillRect(0, 0, c.width, c.height)
    try {
      ctx.drawImage(image, sx, sy, srcW, srcH, 0, 0, c.width, c.height)
    } catch {}
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
        <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} />
        <div style={{ position: 'absolute', left: size / 2 - (zoom + 4) / 2, top: size / 2 - (zoom + 4) / 2, width: zoom + 4, height: zoom + 4, boxShadow: 'inset 0 0 0 1.5px white, 0 0 1px rgba(0,0,0,0.4)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: `inset 0 0 0 6px ${color ? cssColor(color) : 'white'}` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.9)' }} />
      </div>
      {color && (
        <div className="glass mono" style={{ height: 20, padding: '0 8px', borderRadius: 10, fontSize: 10.5, fontWeight: 500, display: 'flex', alignItems: 'center' }}>
          {hexString(color)}
        </div>
      )}
    </div>
  )
}

function EyedropperBanner({ text }: { text: string }) {
  return (
    <div className="glass" style={{ height: 34, padding: '0 16px', borderRadius: 17, display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
      <span style={{ animation: 'lumen-pulse 1.6s ease-in-out infinite' }}>
        <Icon name="eyedropper" size={12} />
      </span>
      <span style={{ fontSize: 12 }}>{text}</span>
      <span className="hairline-v" style={{ height: 14 }} />
      <TextLink onClick={() => doc.setEyedropper(null)}>{L('取消', 'Cancel')}</TextLink>
    </div>
  )
}

// MARK: - “沿用上一张的调整？”

function ApplyBannerView({ banner }: { banner: ApplyBanner }) {
  const film = useDoc((d) => d.filmstrip)
  const thumb = banner.kind === 'offer' ? film.find((f) => f.id === banner.sourceID)?.thumbnail : null
  return (
    <div className="glass" style={{ height: 52, padding: '0 12px 0 10px', borderRadius: 16, display: 'flex', alignItems: 'center' }}>
      <FocusSwap swapKey={banner.kind}>
        {banner.kind === 'offer' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 34, height: 34, background: 'var(--wash-strong)', overflow: 'hidden', flex: 'none' }}>
              {thumb && <Bitmap image={thumb} fit="cover" style={{ width: '100%', height: '100%' }} />}
              <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{L(`沿用「${banner.name}」的调整？`, `Use adjustments from “${banner.name}”?`)}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{banner.summary}</span>
            </div>
            <span style={{ width: 16 }} />
            <GlassButton onClick={() => doc.dismissBanner()}>{L('不用', 'Not Now')}</GlassButton>
            <GlassButton prominent onClick={() => doc.acceptApply()}>
              {L('应用', 'Apply')}
            </GlassButton>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--text)', color: 'white', display: 'grid', placeItems: 'center' }}>
              <Icon name="checkmark" size={10.5} weight="semibold" />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{L(`已应用「${banner.name}」的调整`, `Applied adjustments from “${banner.name}”`)}</span>
            <span className="hairline-v" style={{ height: 14 }} />
            <TextLink onClick={() => doc.undoApply()}>{L('撤销', 'Undo')}</TextLink>
          </div>
        )}
      </FocusSwap>
    </div>
  )
}

// MARK: - 胶片条：所有打开的照片，点击切换（照片会在缩略图和画布之间形变过渡）

const CELL_H = 42
const cellWidth = (f: FilmItem) => Math.min(Math.max(CELL_H * f.aspect, 30), 76)

function Filmstrip() {
  const film = useDoc((d) => d.filmstrip)
  const activeID = useDoc((d) => d.activeID)
  const contentWidth = film.reduce((a, f) => a + cellWidth(f), 0) + Math.max(0, film.length - 1) * 8 + 8
  return (
    <div className="glass" style={{ height: 62, padding: '0 8px', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        className="scroll-x"
        style={{ width: Math.min(contentWidth, 620), transition: springTransition(['width'], spring(0.5, 0.86)), overflowY: 'visible' }}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) (e.currentTarget as HTMLElement).scrollLeft += e.deltaY
        }}
      >
        <AnimatedList
          items={film}
          keyOf={(f) => f.id}
          enter={fx.scaleFade(0.6)}
          spring={spring(0.5, 0.86)}
          style={{ display: 'flex', gap: 8, padding: '6px 4px 8px 4px', width: 'max-content' }}
          render={(f) => <FilmCell item={f} active={f.id === activeID} count={film.length} />}
        />
      </div>
      <span className="hairline-v" style={{ height: 26 }} />
      <BareIcon icon="plus" size={28} iconSize={12} onClick={() => doc.presentOpenPanel()} help={L('添加照片（Ctrl+O）', 'Add photos (Ctrl+O)')} />
    </div>
  )
}

function FilmCell({ item, active, count }: { item: FilmItem; active: boolean; count: number }) {
  const [hover, setHover] = useState(false)
  const w = cellWidth(item)
  const sp = springTransition(['transform', 'opacity'], hover !== active ? spring(0.3, 0.75) : spring(0.45, 0.8))
  return (
    <div
      onClick={() => doc.switchTo(item.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-help={item.name}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(
          active
            ? [
                { label: L('拷贝调整', 'Copy Adjustments'), action: () => doc.copyAdjustments() },
                { label: L('同步当前调整到全部照片', 'Sync Current Adjustments to All Photos'), action: () => doc.applyCurrentToAll(), disabled: count < 2 },
                'sep',
                { label: L('关闭这张照片', 'Close This Photo'), destructive: true, action: () => doc.closeSession(item.id) },
              ]
            : [
                { label: L('切换到这张', 'Switch to This Photo'), action: () => doc.switchTo(item.id) },
                'sep',
                { label: L('把当前照片的调整应用到这张', 'Apply Current Adjustments to This Photo'), action: () => doc.applyCurrent(item.id) },
                { label: L('沿用这张的调整到当前照片', "Use This Photo's Adjustments"), action: () => doc.takeAdjustments(item.id) },
                'sep',
                { label: L('关闭这张照片', 'Close This Photo'), destructive: true, action: () => doc.closeSession(item.id) },
              ],
          e.clientX,
          e.clientY,
        )
      }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        transform: `translateY(${hover && !active ? -2 : 0}px) scale(${active ? 1 : hover ? 0.98 : 0.92})`,
        opacity: active || hover ? 1 : 0.68,
        transition: sp,
      }}
    >
      <div style={{ position: 'relative', width: w, height: CELL_H }}>
        <div data-film-id={active ? undefined : item.id} style={{ position: 'absolute', inset: 0, background: 'var(--wash-strong)', overflow: 'hidden' }}>
          {item.thumbnail && <Bitmap image={item.thumbnail} fit="cover" style={{ width: '100%', height: '100%' }} />}
        </div>
        <span style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 0 ${active ? 1 : 0.5}px ${active ? 'var(--text)' : 'rgba(0,0,0,0.08)'}`, pointerEvents: 'none' }} />
        {item.edited && (
          <span style={{ position: 'absolute', right: 3, top: 3, width: 6, height: 6, borderRadius: '50%', background: 'white', boxShadow: 'inset 0 0 0 1px var(--text)' }} />
        )}
        <span
          style={{
            position: 'absolute', right: -5, top: -5,
            opacity: hover ? 1 : 0, transform: `scale(${hover ? 1 : 0.4})`,
            transition: springTransition(['transform', 'opacity'], spring(0.3, 0.75)),
            pointerEvents: hover ? 'auto' : 'none',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              doc.closeSession(item.id)
            }}
            data-help={L('关闭这张照片', 'Close This Photo')}
            style={{ width: 14, height: 14, borderRadius: '50%', background: 'white', boxShadow: '0 0 1.5px rgba(0,0,0,0.3)', display: 'grid', placeItems: 'center', color: 'var(--text)' }}
          >
            <Icon name="xmark" size={6.5} weight="bold" />
          </button>
        </span>
      </div>
      <span
        style={{
          height: 2, borderRadius: 1, width: active ? 16 : 4, background: active ? 'var(--text)' : 'transparent',
          transition: springTransition(['width'], spring(0.45, 0.8)) + ', background-color 0.3s',
        }}
      />
    </div>
  )
}

// MARK: - 画布底部的玻璃控制条

function CanvasControlBar() {
  const canUndo = useDoc((d) => d.canUndo)
  const canRedo = useDoc((d) => d.canRedo)
  const compare = useDoc((d) => d.compareMode)
  const isCropping = useDoc((d) => d.isCropping)
  const zoom = useDoc((d) => d.zoom)
  const percent = useDoc((d) => d.actualPercent)
  const divider = <span className="hairline-v" style={{ height: 16, margin: '0 4px' }} />
  return (
    <div className="glass" style={{ height: 40, padding: '0 6px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
      <BareIcon icon="arrow.uturn.backward" disabled={!canUndo} onClick={() => doc.undo()} help={L('撤销 Ctrl+Z', 'Undo Ctrl+Z')} />
      <BareIcon icon="arrow.uturn.forward" disabled={!canRedo} onClick={() => doc.redo()} help={L('重做 Ctrl+Shift+Z', 'Redo Ctrl+Shift+Z')} />
      {divider}
      <BareIcon icon="square.split.2x1" active={compare === 'split'} onClick={() => doc.set('compareMode', compare === 'split' ? 'off' : 'split')} help={L('左右对比（\\）', 'Split view (\\)')} />
      <HoldOriginalButton />
      <BareIcon
        icon="crop"
        active={isCropping}
        onClick={() => {
          if (isCropping) doc.setActiveBasicTab(0)
          else {
            doc.selectLayer(null)
            doc.set('showInspector', true)
            doc.setActiveBasicTab(5)
          }
        }}
        help={L('裁剪与旋转', 'Crop & Straighten')}
      />
      {divider}
      <BareIcon icon="minus" onClick={() => doc.setZoom(doc.zoom / 1.5, undefined, spring(0.45, 0.86))} help={L('缩小（Ctrl+-）', 'Zoom out (Ctrl+-)')} />
      <button
        onClick={() => doc.toggleActualSize()}
        data-help={L('在适应窗口和 100% 之间切换（也可以双击照片）', 'Toggle between Fit and 100% (or double-click the photo)')}
        className="mono"
        style={{ width: 50, height: 28, fontSize: 11, fontWeight: 500, color: 'var(--text2)' }}
      >
        {zoom <= 1.001 ? L('适应', 'Fit') : `${percent}%`}
      </button>
      <BareIcon icon="plus" onClick={() => doc.setZoom(doc.zoom * 1.5, undefined, spring(0.45, 0.86))} help={L('放大（Ctrl+=）', 'Zoom in (Ctrl+=)')} />
    </div>
  )
}

function HoldOriginalButton() {
  const showOriginal = useDoc((d) => d.showOriginal)
  const [hover, setHover] = useState(false)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        doc.set('showOriginal', true)
      }}
      onPointerUp={() => doc.set('showOriginal', false)}
      onPointerCancel={() => doc.set('showOriginal', false)}
      data-help={L('按住查看原图', 'Hold to see the original')}
      style={{
        width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
        color: showOriginal ? 'white' : 'var(--text)',
        background: showOriginal ? 'var(--text)' : hover ? 'var(--wash-strong)' : 'transparent',
        transition: 'background-color 0.15s ease-out, color 0.15s ease-out',
      }}
    >
      <Icon name="eye" size={13} weight={showOriginal ? 'medium' : 'regular'} />
    </button>
  )
}

// MARK: - 空状态

function EmptyStage({ hover, error }: { hover: boolean; error: string | null }) {
  const sp = spring(0.45, 0.7)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      <div style={{ height: 100, display: 'grid', placeItems: 'center', position: 'relative', width: 140 }}>
        <div
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: hover ? 132 : 112, height: hover ? 96 : 80,
            transform: 'translate(-50%, -50%)',
            border: `0.8px ${hover ? 'solid' : 'dashed'} var(--line-strong)`,
            transition: springTransition(['width', 'height'], sp),
          }}
        />
        <span style={{ color: 'var(--text2)', transform: `rotate(${hover ? 60 : 0}deg)`, transition: springTransition(['transform'], sp) }}>
          <Icon name="camera.aperture" size={28} weight="ultraLight" />
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <FocusSwap swapKey={hover ? 'h' : 'n'} spring={spring(0.3, 1)}>
          <div style={{ fontSize: 19, fontWeight: 300 }}>{hover ? L('松开以打开', 'Release to open') : L('将照片拖到这里', 'Drop photos here')}</div>
        </FocusSwap>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.4, color: 'var(--text3)' }}>
          {L('JPG · PNG · WEBP · TIFF · 相机 RAW　可一次打开多张', 'JPG · PNG · WEBP · TIFF · Camera RAW — open several at once')}
        </div>
        {error && <div style={{ fontSize: 11, color: 'rgb(190,60,50)', maxWidth: 360, textAlign: 'center' }}>{error}</div>}
      </div>
      <GlassButton onClick={() => doc.presentOpenPanel()}>{L('打开照片…', 'Open Photos…')}</GlassButton>
    </div>
  )
}


function CropOverlay({ x, y, width, height, stageW, stageH }: {
  x: number; y: number; width: number; height: number; stageW: number; stageH: number
}) {
  const drag = useRef<{ mode: 'move' | 'tl' | 'tr' | 'bl' | 'br'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null)
  const start = (mode: 'move' | 'tl' | 'tr' | 'bl' | 'br', e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, sx: e.clientX, sy: e.clientY, ox: x, oy: y, ow: width, oh: height }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || stageW <= 0 || stageH <= 0) return
    const dx = (e.clientX - d.sx) / stageW
    const dy = (e.clientY - d.sy) / stageH
    const min = 0.05
    if (d.mode === 'move') {
      doc.setCrop({ x: Math.max(0, Math.min(1 - d.ow, d.ox + dx)), y: Math.max(0, Math.min(1 - d.oh, d.oy + dy)) })
    } else if (d.mode === 'tl') {
      const nx = Math.max(0, Math.min(d.ox + d.ow - min, d.ox + dx))
      const ny = Math.max(0, Math.min(d.oy + d.oh - min, d.oy + dy))
      doc.setCrop({ x: nx, y: ny, width: d.ox + d.ow - nx, height: d.oy + d.oh - ny })
    } else if (d.mode === 'tr') {
      const nw = Math.max(min, Math.min(1 - d.ox, d.ow + dx))
      const ny = Math.max(0, Math.min(d.oy + d.oh - min, d.oy + dy))
      doc.setCrop({ y: ny, width: nw, height: d.oy + d.oh - ny })
    } else if (d.mode === 'bl') {
      const nx = Math.max(0, Math.min(d.ox + d.ow - min, d.ox + dx))
      const nh = Math.max(min, Math.min(1 - d.oy, d.oh + dy))
      doc.setCrop({ x: nx, width: d.ox + d.ow - nx, height: nh })
    } else {
      doc.setCrop({ width: Math.max(min, Math.min(1 - d.ox, d.ow + dx)), height: Math.max(min, Math.min(1 - d.oy, d.oh + dy)) })
    }
  }
  const end = () => { drag.current = null }
  const left = x * stageW, top = y * stageH, w = width * stageW, h = height * stageH
  const handle = (mode: 'tl' | 'tr' | 'bl' | 'br', hx: number, hy: number, cursor: string) => (
    <div
      key={mode}
      onPointerDown={(e) => start(mode, e)}
      onPointerMove={move}
      onPointerUp={end}
      style={{
        position: 'absolute', left: hx - 6, top: hy - 6, width: 12, height: 12,
        borderRadius: 2, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.45)', cursor,
      }}
    />
  )
  return (
    <div data-nodrag style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
      <div style={{
        position: 'absolute', left, top, width: w, height: h,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.48), inset 0 0 0 1.5px rgba(255,255,255,0.9)',
        cursor: 'move',
      }} onPointerDown={(e) => start('move', e)} onPointerMove={move} onPointerUp={end}>
        <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 0.5, background: 'rgba(255,255,255,0.35)' }} />
        <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 0.5, background: 'rgba(255,255,255,0.35)' }} />
        <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 0.5, background: 'rgba(255,255,255,0.35)' }} />
        <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 0.5, background: 'rgba(255,255,255,0.35)' }} />
      </div>
      {handle('tl', left, top, 'nwse-resize')}
      {handle('tr', left + w, top, 'nesw-resize')}
      {handle('bl', left, top + h, 'nesw-resize')}
      {handle('br', left + w, top + h, 'nwse-resize')}
    </div>
  )
}
