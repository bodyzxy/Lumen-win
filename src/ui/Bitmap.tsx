import { CSSProperties, useLayoutEffect, useRef } from 'react'

/**
 * 显示一张 ImageBitmap（渲染结果、缩略图）。
 * fill：拉伸到元素大小（照片本身已经按比例算好尺寸）；cover：裁切填满；
 * pixelated：放大镜里用最近邻插值。
 */
export function Bitmap({ image, fit = 'fill', style, pixelated = false }: { image: ImageBitmap; fit?: 'fill' | 'cover'; style?: CSSProperties; pixelated?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const c = ref.current
    if (!c || !image || image.width === 0) return
    if (c.width !== image.width) c.width = image.width
    if (c.height !== image.height) c.height = image.height
    const ctx = c.getContext('2d', { alpha: false })
    if (!ctx) return
    try {
      ctx.drawImage(image, 0, 0)
    } catch {
      /* 已经被释放的位图 */
    }
  }, [image])
  return (
    <canvas
      ref={ref}
      style={{
        display: 'block',
        objectFit: fit === 'cover' ? 'cover' : 'fill',
        imageRendering: pixelated ? 'pixelated' : 'auto',
        ...style,
      }}
    />
  )
}
