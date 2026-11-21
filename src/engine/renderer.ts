import { AdjustmentLayer, BasicSettings, EditState, isSpatial, LayerKind, levelsIsIdentity } from '../model/types'
import { CM, CubeLUT, curveIsIdentity, curveTable, CURVE_TABLE, whiteBalanceGains } from './colormath'
import * as S from './shaders'

/**
 * WebGL2 渲染管线（对应 Mac 版 RenderEngine.process）：
 * 曝光/白平衡（线性空间）→ 高光阴影 → 纹理/清晰度/去朦胧 → 降噪/锐化
 * → [逐像素段 → 空间类图层 → 逐像素段 …] → 暗角 → 颗粒 → sRGB 输出
 */

export interface Source {
  tex: WebGLTexture
  width: number
  height: number
}

/** 一次渲染的几何信息 */
export interface RenderGeometry {
  /** 整张图在当前分辨率下的尺寸（清晰度半径、暗角中心、颗粒大小都按它算） */
  refWidth: number
  refHeight: number
  /** 源纹理左上角在整张图中的位置 */
  originX: number
  originY: number
  /** 只处理源纹理中的这一块（源纹理像素，左上为原点）；不传就是整张 */
  srcRect?: { x: number; y: number; w: number; h: number }
  /** 要输出的区域（相对 srcRect 的像素，左上为原点）；不传就是整个 srcRect */
  crop?: { x: number; y: number; w: number; h: number }
  outWidth: number
  outHeight: number
}

interface Tex {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  w: number
  h: number
  float32?: boolean
}

type Prog = { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }

const KIND_ID: Partial<Record<LayerKind, number>> = {
  curves: 1, levels: 2, brightnessContrast: 3, exposure: 4, vibrance: 5, hueSaturation: 6, hsl: 7,
  colorBalance: 8, selectiveColor: 9, channelMixer: 10, blackWhite: 11, photoFilter: 12, gradientMap: 13,
  colorGrading: 14, posterize: 15, threshold: 16, invert: 17, lut: 18, desaturate: 19, matchColor: 20,
  replaceColor: 21, equalize: 22,
}

export class Renderer {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement
  readonly gl: WebGL2RenderingContext
  private progs = new Map<string, Prog>()
  private vao: WebGLVertexArrayObject
  private pool: Tex[] = []
  private tableTex: WebGLTexture
  private lutTex = new Map<string, WebGLTexture>()
  private emptyLut: WebGLTexture
  luts = new Map<string, CubeLUT>()

  constructor() {
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : document.createElement('canvas')
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null
    if (!gl) throw new Error('WebGL2 is not available')
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float is not available')
    gl.getExtension('OES_texture_float_linear')
    this.gl = gl

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.tableTex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.tableTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, CURVE_TABLE, 5, 0, gl.RED, gl.FLOAT, null)
    this.setNearest(gl.TEXTURE_2D)

    this.emptyLut = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_3D, this.emptyLut)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 2, 2, 2, 0, gl.RGBA, gl.FLOAT, new Float32Array(32))
    this.setLinear(gl.TEXTURE_3D)

    const programs: Record<string, string> = {
      input: S.FRAG_INPUT, copy: S.FRAG_COPY, blur: S.FRAG_BLUR, local: S.FRAG_LOCAL_CONTRAST,
      hs: S.FRAG_HIGHLIGHT_SHADOW, denoise: S.FRAG_DENOISE, controls: S.FRAG_COLOR_CONTROLS,
      dissolve: S.FRAG_DISSOLVE, finish: S.FRAG_FINISH, output: S.FRAG_OUTPUT, layer: S.FRAG_LAYER,
    }
    for (const [k, src] of Object.entries(programs)) this.progs.set(k, this.compile(src))
  }

  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)
  }

  // MARK: 基础设施

  private compile(frag: string): Prog {
    const gl = this.gl
    const mk = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error')
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, S.VERT))
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, frag))
    gl.bindAttribLocation(prog, 0, 'a_pos')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error')
    return { prog, loc: new Map() }
  }

  private setLinear(target: number) {
    const gl = this.gl
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
  }

  private setNearest(target: number) {
    const gl = this.gl
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  private acquire(w: number, h: number, float32 = false): Tex {
    const i = this.pool.findIndex((t) => t.w === w && t.h === h && !!t.float32 === float32)
    if (i >= 0) return this.pool.splice(i, 1)[0]
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, float32 ? gl.RGBA32F : gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null)
    float32 ? this.setNearest(gl.TEXTURE_2D) : this.setLinear(gl.TEXTURE_2D)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { tex, fbo, w, h, float32 }
  }

  private release(t: Tex) {
    this.pool.push(t)
    // 池子不要无限长大（不同尺寸的纹理只留最近用过的一些）
    while (this.pool.length > 14) {
      const old = this.pool.shift()!
      this.gl.deleteTexture(old.tex)
      this.gl.deleteFramebuffer(old.fbo)
    }
  }

  /** 清空纹理池（例如大图导出之后），释放显存 */
  trim() {
    for (const t of this.pool) {
      this.gl.deleteTexture(t.tex)
      this.gl.deleteFramebuffer(t.fbo)
    }
    this.pool = []
  }

  private use(name: string): (u: string) => WebGLUniformLocation | null {
    const p = this.progs.get(name)!
    this.gl.useProgram(p.prog)
    return (u: string) => {
      if (!p.loc.has(u)) p.loc.set(u, this.gl.getUniformLocation(p.prog, u))
      return p.loc.get(u)!
    }
  }

  private bindTex(unit: number, tex: WebGLTexture, target?: number) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(target ?? gl.TEXTURE_2D, tex)
  }

  private draw(target: Tex | null, w?: number, h?: number) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
    gl.viewport(0, 0, target ? target.w : w!, target ? target.h : h!)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  // MARK: 源图

  /** 上传源图（sRGB 8 位，取样时 GPU 自动转成线性值；按从上到下存放） */
  upload(image: ImageBitmap | ImageData | HTMLCanvasElement | OffscreenCanvas): Source {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // 不翻转（ImageBitmap 会忽略 UNPACK_FLIP_Y，各浏览器行为也不一致），第 0 行就是图片最上面一行
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, image as any)
    this.setLinear(gl.TEXTURE_2D)
    return { tex, width: image.width, height: image.height }
  }

  /** 上传已经是线性浮点值的数据（导出 LUT 时的网格） */
  uploadLinearFloat(data: Float32Array, w: number, h: number): Source {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data)
    this.setNearest(gl.TEXTURE_2D)
    return { tex, width: w, height: h }
  }

  dispose(src: Source | null | undefined) {
    if (src) this.gl.deleteTexture(src.tex)
  }

  setLUT(path: string, cube: CubeLUT) {
    this.luts.set(path, cube)
    const gl = this.gl
    const n = cube.size
    const rgba = new Float32Array(n * n * n * 4)
    for (let i = 0; i < n * n * n; i++) {
      rgba[i * 4] = cube.data[i * 3]
      rgba[i * 4 + 1] = cube.data[i * 3 + 1]
      rgba[i * 4 + 2] = cube.data[i * 3 + 2]
      rgba[i * 4 + 3] = 1
    }
    const old = this.lutTex.get(path)
    if (old) gl.deleteTexture(old)
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_3D, tex)
    // 红色变化最快 → x，绿色 → y，蓝色 → z（和 .cube 的存放顺序一致）
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, rgba)
    this.setLinear(gl.TEXTURE_3D)
    this.lutTex.set(path, tex)
  }

  // MARK: 模糊

  /** 高斯模糊；大半径时先缩小再模糊，返回的纹理可能比原图小（取样时用双三次放大） */
  private blur(src: Tex, sigma: number): Tex {
    const gl = this.gl
    let cur = src
    let scale = 1
    const owned: Tex[] = []
    while (sigma / scale > 3 && cur.w > 24 && cur.h > 24) {
      const next = this.acquire(Math.max(1, Math.ceil(cur.w / 2)), Math.max(1, Math.ceil(cur.h / 2)))
      const u = this.use('copy')
      this.bindTex(0, cur.tex)
      gl.uniform1i(u('u_src'), 0)
      this.draw(next)
      if (cur !== src) owned.push(cur)
      cur = next
      scale *= 2
    }
    // 下采样本身已经带来一点模糊，扣掉
    const s = Math.max(0.4, Math.sqrt(Math.max(0.16, (sigma / scale) ** 2 - (scale > 1 ? 0.5 : 0))))
    const radius = Math.min(64, Math.ceil(s * 3))
    const tmp = this.acquire(cur.w, cur.h)
    const out = this.acquire(cur.w, cur.h)
    const u = this.use('blur')
    gl.uniform1f(u('u_sigma'), s)
    gl.uniform1i(u('u_radius'), radius)
    gl.uniform1i(u('u_src'), 0)
    this.bindTex(0, cur.tex)
    gl.uniform2f(u('u_dir'), 1 / cur.w, 0)
    this.draw(tmp)
    this.bindTex(0, tmp.tex)
    gl.uniform2f(u('u_dir'), 0, 1 / cur.h)
    this.draw(out)
    this.release(tmp)
    if (cur !== src) owned.push(cur)
    owned.forEach((t) => this.release(t))
    return out
  }

  // MARK: 各个步骤

  private localContrast(img: Tex, amount: number, radius: number, strength: number): Tex {
    if (amount === 0) return img
    const r = Math.max(0.8, radius)
    const gl = this.gl
    const blurred = this.blur(img, amount > 0 ? r : r * 0.6)
    const out = this.acquire(img.w, img.h)
    const u = this.use('local')
    this.bindTex(0, img.tex)
    this.bindTex(1, blurred.tex)
    gl.uniform1i(u('u_src'), 0)
    gl.uniform1i(u('u_blur'), 1)
    if (amount > 0) {
      gl.uniform1i(u('u_mode'), 0)
      gl.uniform1f(u('u_amount'), amount * strength)
    } else {
      gl.uniform1i(u('u_mode'), 1)
      gl.uniform1f(u('u_amount'), Math.min(1, -amount * strength * 1.1))
    }
    this.draw(out)
    this.release(blurred)
    this.release(img)
    return out
  }

  private unsharp(img: Tex, radius: number, intensity: number, lumaOnly = false): Tex {
    const gl = this.gl
    const blurred = this.blur(img, Math.max(0.6, radius))
    const out = this.acquire(img.w, img.h)
    const u = this.use('local')
    this.bindTex(0, img.tex)
    this.bindTex(1, blurred.tex)
    gl.uniform1i(u('u_src'), 0)
    gl.uniform1i(u('u_blur'), 1)
    gl.uniform1i(u('u_mode'), lumaOnly ? 2 : 0)
    gl.uniform1f(u('u_amount'), intensity)
    this.draw(out)
    this.release(blurred)
    this.release(img)
    return out
  }

  private highlightShadow(img: Tex, shadow: number, highlight: number, radius: number): Tex {
    const gl = this.gl
    const blurred = this.blur(img, Math.max(1, radius))
    const out = this.acquire(img.w, img.h)
    const u = this.use('hs')
    this.bindTex(0, img.tex)
    this.bindTex(1, blurred.tex)
    gl.uniform1i(u('u_src'), 0)
    gl.uniform1i(u('u_blur'), 1)
    gl.uniform1f(u('u_shadow'), shadow)
    gl.uniform1f(u('u_highlight'), highlight)
    this.draw(out)
    this.release(blurred)
    this.release(img)
    return out
  }

  private colorControls(img: Tex, o: { saturation?: number; contrast?: number; vibrance?: number; exposure?: number; power?: number }): Tex {
    const gl = this.gl
    const out = this.acquire(img.w, img.h)
    const u = this.use('controls')
    this.bindTex(0, img.tex)
    gl.uniform1i(u('u_src'), 0)
    gl.uniform1f(u('u_saturation'), o.saturation ?? 1)
    gl.uniform1f(u('u_contrast'), o.contrast ?? 1)
    gl.uniform1f(u('u_vibrance'), o.vibrance ?? 0)
    gl.uniform1f(u('u_exposure'), o.exposure ?? 0)
    gl.uniform1f(u('u_power'), o.power ?? 1)
    this.draw(out)
    this.release(img)
    return out
  }

  // MARK: 逐像素图层

  private setLayerUniforms(u: (n: string) => WebGLUniformLocation | null, layer: AdjustmentLayer) {
    const gl = this.gl
    const p = new Float32Array(64)
    const c = new Float32Array(36)
    let flags = 0
    const P = layer.params
    const table = (rows: (Float32Array | null)[]) => {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, this.tableTex)
      rows.forEach((row, i) => {
        if (row) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, i, row.length, 1, gl.RED, gl.FLOAT, row)
      })
    }
    switch (layer.kind) {
      case 'curves': {
        const ch = [P.curves.rgb, P.curves.red, P.curves.green, P.curves.blue]
        const rows = ch.map((pts, i) => {
          if (curveIsIdentity(pts)) return null
          flags |= 1 << i
          return curveTable(pts)
        })
        table(rows)
        break
      }
      case 'levels': {
        const chs = [P.levels.master, P.levels.red, P.levels.green, P.levels.blue]
        chs.forEach((ch, i) => {
          if (!levelsIsIdentity(ch)) flags |= 1 << i
          p.set([ch.inBlack, ch.inWhite, ch.gamma, ch.outBlack, ch.outWhite], i * 5)
        })
        break
      }
      case 'brightnessContrast':
        p.set([P.brightnessContrast.brightness, P.brightnessContrast.contrast])
        break
      case 'exposure':
        p.set([P.exposure.exposure, P.exposure.offset, P.exposure.gamma])
        break
      case 'vibrance':
        p.set([P.vibrance.vibrance, P.vibrance.saturation])
        break
      case 'hueSaturation': {
        const h = P.hueSaturation
        p.set([h.hue, h.saturation, h.lightness, h.colorize ? 1 : 0, h.colorizeHue, h.colorizeSaturation])
        break
      }
      case 'hsl':
        p.set(P.hsl.hue.slice(0, 8), 0)
        p.set(P.hsl.saturation.slice(0, 8), 8)
        p.set(P.hsl.luminance.slice(0, 8), 16)
        break
      case 'colorBalance': {
        const b = P.colorBalance
        p.set([...b.shadows, ...b.midtones, ...b.highlights, b.preserveLuminosity ? 1 : 0])
        break
      }
      case 'selectiveColor':
        P.selectiveColor.groups.slice(0, 9).forEach((g, i) => p.set(g.slice(0, 4), i * 4))
        p[36] = P.selectiveColor.relative ? 1 : 0
        break
      case 'channelMixer': {
        const m = P.channelMixer
        p.set([...m.red, ...m.green, ...m.blue, ...m.gray, m.monochrome ? 1 : 0])
        break
      }
      case 'blackWhite': {
        const b = P.blackWhite
        p.set([...b.weights.slice(0, 6), b.tint ? 1 : 0, b.tintHue, b.tintSaturation])
        break
      }
      case 'photoFilter': {
        const f = P.photoFilter
        p.set([f.density, f.preserveLuminosity ? 1 : 0])
        c.set([f.color.r, f.color.g, f.color.b])
        break
      }
      case 'gradientMap': {
        const stops = [...P.gradientMap.stops].sort((a, b) => a.position - b.position).slice(0, 12)
        p[0] = stops.length
        p[1] = P.gradientMap.reverse ? 1 : 0
        stops.forEach((s, i) => {
          p[2 + i] = s.position
          c.set([s.color.r, s.color.g, s.color.b], i * 3)
        })
        break
      }
      case 'colorGrading': {
        const g = P.colorGrading
        const w = (t: { hue: number; saturation: number; luminance: number }) => [t.hue, t.saturation, t.luminance]
        p.set([...w(g.shadows), ...w(g.midtones), ...w(g.highlights), ...w(g.global), g.blending, g.balance])
        break
      }
      case 'posterize':
        p[0] = P.posterize.levels
        break
      case 'threshold':
        p[0] = P.threshold.level
        break
      case 'lut': {
        const path = P.lut.path
        const cube = path ? this.luts.get(path) : undefined
        const tex = path ? this.lutTex.get(path) : undefined
        if (cube && tex) {
          p.set([P.lut.intensity, cube.size, ...cube.domainMin, ...cube.domainMax, 1])
          this.bindTex(3, tex, gl.TEXTURE_3D)
        }
        break
      }
      case 'matchColor': {
        const m = P.matchColor
        if (m.reference && m.source) {
          p.set([...m.reference.mean, ...m.reference.std, ...m.source.mean, ...m.source.std, m.luminance, m.intensity, m.fade, m.neutralize ? 1 : 0, 1])
        }
        break
      }
      case 'replaceColor': {
        const r = P.replaceColor
        p.set([r.fuzziness, r.hue, r.saturation, r.lightness])
        c.set([r.target.r, r.target.g, r.target.b])
        break
      }
      case 'equalize':
        if (P.equalize.curve.length === 256) {
          p[0] = 1
          const row = new Float32Array(CURVE_TABLE)
          row.set(P.equalize.curve)
          table([null, null, null, null, row])
        }
        break
    }
    gl.uniform1i(u('u_kind'), KIND_ID[layer.kind] ?? 0)
    gl.uniform1f(u('u_opacity'), CM.clamp(layer.opacity / 100))
    gl.uniform1fv(u('u_p'), p)
    gl.uniform3fv(u('u_c'), c)
    gl.uniform1i(u('u_flags'), flags)
  }

  private setBasicToneUniforms(u: (n: string) => WebGLUniformLocation | null, b: BasicSettings) {
    const gl = this.gl
    let c = b.contrast / 100
    let bl = b.blacks / 100
    let sat = b.saturation / 100
    const d = b.dehaze / 100
    if (d > 0) {
      c += d * 0.35
      sat += d * 0.25
      bl -= d * 0.3
    }
    const p = new Float32Array(64)
    p.set([CM.clamp(c, -1, 1.5), Math.max(0, b.highlights / 100), b.whites / 100, bl, d, b.vibrance / 100, sat, b.shadowTint / 100])
    const calib = [b.redHue, b.redSaturation, b.greenHue, b.greenSaturation, b.blueHue, b.blueSaturation]
    if (calib.some((v) => v !== 0)) {
      // 每个原色先在色环上转动、再调整纯度，三个原色组成新的混合矩阵
      const prim = (base: number, hue: number, s: number) => CM.hslToRgb(base + (hue / 100) * 30, CM.clamp(1 + (s / 100) * 0.6), 0.5)
      const pr = prim(0, b.redHue, b.redSaturation)
      const pg = prim(120, b.greenHue, b.greenSaturation)
      const pb = prim(240, b.blueHue, b.blueSaturation)
      const m = [pr[0], pg[0], pb[0], pr[1], pg[1], pb[1], pr[2], pg[2], pb[2]]
      for (let row = 0; row < 3; row++) {
        const s = m[row * 3] + m[row * 3 + 1] + m[row * 3 + 2]
        if (s > 1e-6) for (let k = 0; k < 3; k++) m[row * 3 + k] /= s
      }
      p[8] = 1
      p.set(m, 9)
    }
    gl.uniform1i(u('u_kind'), 100)
    gl.uniform1f(u('u_opacity'), 1)
    gl.uniform1fv(u('u_p'), p)
    gl.uniform1i(u('u_flags'), 0)
  }

  private basicToneIsIdle(b: BasicSettings) {
    return (
      b.contrast === 0 && b.highlights <= 0 && b.whites === 0 && b.blacks === 0 && b.dehaze === 0 &&
      b.vibrance === 0 && b.saturation === 0 && b.shadowTint === 0 && b.redHue === 0 && b.redSaturation === 0 &&
      b.greenHue === 0 && b.greenSaturation === 0 && b.blueHue === 0 && b.blueSaturation === 0
    )
  }

  /** 一段逐像素调整：基础色调（可选）+ 若干图层，每个一次绘制 */
  private pixelSegment(img: Tex, basic: BasicSettings | null, layers: AdjustmentLayer[]): Tex {
    const gl = this.gl
    const u = this.use('layer')
    gl.uniform1i(u('u_src'), 0)
    gl.uniform1i(u('u_table'), 2)
    gl.uniform1i(u('u_lut'), 3)
    this.bindTex(3, this.emptyLut, gl.TEXTURE_3D)
    const step = (set: () => void) => {
      const out = this.acquire(img.w, img.h, img.float32)
      this.bindTex(0, img.tex)
      set()
      this.draw(out)
      this.release(img)
      img = out
    }
    if (basic && !this.basicToneIsIdle(basic)) step(() => this.setBasicToneUniforms(u, basic))
    for (const layer of layers) {
      step(() => {
        this.bindTex(3, this.emptyLut, gl.TEXTURE_3D)
        this.setLayerUniforms(u, layer)
      })
    }
    return img
  }

  private spatial(input: Tex, layer: AdjustmentLayer, longSide: number): Tex {
    const scale = longSide / 1000
    const keep = this.acquire(input.w, input.h)
    this.copyInto(input, keep)
    let img = input
    if (layer.kind === 'shadowsHighlights') {
      const p = layer.params.shadowsHighlights
      if (p.shadowsAmount > 0) img = this.highlightShadow(img, p.shadowsAmount / 100, 1, Math.max(1, p.shadowsRadius * scale * 0.4))
      if (p.highlightsAmount > 0) img = this.highlightShadow(img, 0, 1 - p.highlightsAmount / 100, Math.max(1, p.highlightsRadius * scale * 0.4))
      const correction = ((p.colorCorrection / 100) * Math.max(p.shadowsAmount, p.highlightsAmount)) / 100
      if (correction !== 0 || p.midtoneContrast !== 0) {
        img = this.colorControls(img, { saturation: 1 + correction * 0.6, contrast: 1 + (p.midtoneContrast / 100) * 0.3 })
      }
    } else if (layer.kind === 'hdrToning') {
      const p = layer.params.hdrToning
      if (p.strength > 0) img = this.unsharp(img, Math.max(2, p.radius * scale * 1.2), (p.strength / 100) * 1.2)
      if (p.detail !== 0) img = this.localContrast(img, p.detail / 100, 2.5 * scale, 0.8)
      if (p.exposure !== 0 || p.gamma !== 1 || p.vibrance !== 0 || p.saturation !== 0) {
        img = this.colorControls(img, {
          exposure: p.exposure,
          power: 1 / Math.max(0.1, p.gamma),
          vibrance: p.vibrance / 100,
          saturation: 1 + p.saturation / 100,
        })
      }
    }
    if (layer.opacity < 99.9) {
      const gl = this.gl
      const out = this.acquire(img.w, img.h)
      const u = this.use('dissolve')
      this.bindTex(0, keep.tex)
      this.bindTex(1, img.tex)
      gl.uniform1i(u('u_a'), 0)
      gl.uniform1i(u('u_b'), 1)
      gl.uniform1f(u('u_t'), layer.opacity / 100)
      this.draw(out)
      this.release(img)
      img = out
    }
    this.release(keep)
    return img
  }

  private copyInto(src: Tex, dst: Tex) {
    const u = this.use('copy')
    this.bindTex(0, src.tex)
    this.gl.uniform1i(u('u_src'), 0)
    this.draw(dst)
  }

  // MARK: 主管线

  /** 跑完整条管线，返回线性浮点纹理（调用方负责 release） */
  private process(src: Source, state: EditState, geo: RenderGeometry): Tex {
    const gl = this.gl
    const b = state.basic
    const longSide = Math.max(geo.refWidth, geo.refHeight)
    // 只处理源纹理的一块（放大时的局部、导出时的分块）
    const r = geo.srcRect ?? { x: 0, y: 0, w: src.width, h: src.height }

    // 1–2. 曝光、白平衡
    let img = this.acquire(r.w, r.h)
    {
      const u = this.use('input')
      this.bindTex(0, src.tex)
      gl.uniform1i(u('u_src'), 0)
      gl.uniform4f(u('u_rect'), r.x / src.width, r.y / src.height, r.w / src.width, r.h / src.height)
      gl.uniform1f(u('u_exposure'), b.exposure)
      const g = b.temperature !== 0 || b.tint !== 0 ? whiteBalanceGains(b.temperature, b.tint) : [1, 1, 1]
      gl.uniform3f(u('u_gains'), g[0], g[1], g[2])
      this.draw(img)
    }

    // 3. 高光（压暗部分）与阴影
    if (b.highlights < 0 || b.shadows !== 0) {
      const hAmount = b.highlights < 0 ? 1 + b.highlights / 100 : 1
      img = this.highlightShadow(img, b.shadows / 100, hAmount, Math.max(2, longSide * 0.004))
    }

    // 4. 纹理 / 清晰度 / 去朦胧
    img = this.localContrast(img, b.texture / 100, longSide * 0.0025, 0.9)
    img = this.localContrast(img, b.clarity / 100, longSide * 0.015, 0.55)
    if (b.dehaze > 0) img = this.localContrast(img, b.dehaze / 100, longSide * 0.06, 0.35)

    // 5. 降噪与锐化
    if (b.noiseReduction > 0) {
      const out = this.acquire(img.w, img.h)
      const u = this.use('denoise')
      this.bindTex(0, img.tex)
      gl.uniform1i(u('u_src'), 0)
      gl.uniform1f(u('u_level'), (b.noiseReduction / 100) * 0.08)
      this.draw(out)
      this.release(img)
      img = out
    }
    if (b.sharpen > 0) img = this.unsharp(img, 1.69 * Math.max(1, longSide / 2200), (b.sharpen / 100) * 1.6, true)

    // 6. 图层栈：连续的逐像素图层一段段计算，遇到空间类图层就先结算再处理它
    let tone: BasicSettings | null = b
    let pending: AdjustmentLayer[] = []
    for (const layer of state.layers) {
      if (!layer.visible || layer.opacity <= 0) continue
      if (isSpatial(layer.kind)) {
        img = this.pixelSegment(img, tone, pending)
        tone = null
        pending = []
        img = this.spatial(img, layer, longSide)
      } else pending.push(layer)
    }
    img = this.pixelSegment(img, tone, pending)

    // 7–8. 暗角、颗粒
    if (b.vignette !== 0 || b.grain > 0) {
      const out = this.acquire(img.w, img.h)
      const u = this.use('finish')
      this.bindTex(0, img.tex)
      gl.uniform1i(u('u_src'), 0)
      gl.uniform2f(u('u_texSize'), img.w, img.h)
      gl.uniform2f(u('u_origin'), geo.originX, geo.originY)
      gl.uniform2f(u('u_refSize'), geo.refWidth, geo.refHeight)
      gl.uniform1f(u('u_vignette'), b.vignette / 100)
      gl.uniform1f(u('u_grain'), b.grain / 100)
      gl.uniform1f(u('u_grainScale'), Math.max(1, ((1 + (b.grainSize / 100) * 3) * longSide) / 2400))
      gl.uniform1f(u('u_seed'), 17.0)
      this.draw(out)
      this.release(img)
      img = out
    }
    return img
  }

  private output(img: Tex, geo: RenderGeometry, target: Tex | null) {
    const gl = this.gl
    const crop = geo.crop ?? { x: 0, y: 0, w: img.w, h: img.h }
    const u = this.use('output')
    this.bindTex(0, img.tex)
    gl.uniform1i(u('u_src'), 0)
    // 纹理坐标左下为原点，crop 是左上为原点
    gl.uniform4f(u('u_crop'), crop.x / img.w, (img.h - crop.y - crop.h) / img.h, crop.w / img.w, crop.h / img.h)
    gl.uniform2f(u('u_step'), crop.w / img.w / geo.outWidth, crop.h / img.h / geo.outHeight)
    gl.uniform1i(u('u_ss'), crop.w / geo.outWidth > 1.4 ? 1 : 0)
    this.draw(target, geo.outWidth, geo.outHeight)
  }

  // MARK: 对外接口

  /** 渲染成 ImageBitmap（预览、缩略图、放大局部） */
  renderBitmap(src: Source, state: EditState, geo: RenderGeometry, histogram?: (px: Uint8Array, w: number, h: number) => void): ImageBitmap {
    const img = this.process(src, state, geo)
    if (histogram) {
      const k = Math.min(1, 360 / Math.max(geo.outWidth, geo.outHeight))
      const hw = Math.max(1, Math.round(geo.outWidth * k))
      const hh = Math.max(1, Math.round(geo.outHeight * k))
      const t = this.acquireRGBA8(hw, hh)
      this.output(img, { ...geo, outWidth: hw, outHeight: hh }, t as any)
      const px = new Uint8Array(hw * hh * 4)
      this.gl.readPixels(0, 0, hw, hh, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px)
      histogram(px, hw, hh)
    }
    if (this.canvas.width !== geo.outWidth) this.canvas.width = geo.outWidth
    if (this.canvas.height !== geo.outHeight) this.canvas.height = geo.outHeight
    this.output(img, geo, null)
    this.release(img)
    if ('transferToImageBitmap' in this.canvas) return (this.canvas as OffscreenCanvas).transferToImageBitmap()
    throw new Error('OffscreenCanvas is required')
  }

  private rgba8: { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number } | null = null
  private acquireRGBA8(w: number, h: number) {
    const gl = this.gl
    if (this.rgba8 && this.rgba8.w === w && this.rgba8.h === h) return this.rgba8
    if (this.rgba8) {
      gl.deleteTexture(this.rgba8.tex)
      gl.deleteFramebuffer(this.rgba8.fbo)
    }
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    this.rgba8 = { tex, fbo, w, h }
    return this.rgba8
  }

  /**
   * 渲染并读回像素（导出用）。返回从上到下排列的 RGBA；
   * bits=8 → Uint8Array，bits=16 → Uint16Array（sRGB 编码）
   */
  renderPixels(src: Source, state: EditState, geo: RenderGeometry, bits: 8 | 16): Uint8Array | Uint16Array {
    const gl = this.gl
    const img = this.process(src, state, geo)
    const w = geo.outWidth
    const h = geo.outHeight
    let out: Uint8Array | Uint16Array
    if (bits === 8) {
      const t = this.acquireRGBA8(w, h)
      this.output(img, geo, t as any)
      const px = new Uint8Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
      out = flipRows(px, w, h)
    } else {
      const t = this.acquire(w, h, true)
      this.output(img, geo, t)
      const f = new Float32Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f)
      this.release(t)
      const u16 = new Uint16Array(w * h * 4)
      for (let i = 0; i < f.length; i++) u16[i] = Math.round(CM.clamp(f[i]) * 65535)
      out = flipRows(u16, w, h)
    }
    this.release(img)
    return out
  }

  /** 导出 .cube：把整张图的颜色部分（基础色调 + 非空间图层）作用在一个 size³ 的网格上 */
  buildLUT(state: EditState, size: number): Float32Array {
    const gl = this.gl
    const w = size * size
    const h = size
    const data = new Float32Array(w * h * 4)
    // 纹理第 0 行在底部；让第 y 行对应蓝色 = y
    for (let bi = 0; bi < size; bi++) {
      for (let gi = 0; gi < size; gi++) {
        for (let ri = 0; ri < size; ri++) {
          const i = (bi * w + gi * size + ri) * 4
          data[i] = CM.toLinear(ri / (size - 1))
          data[i + 1] = CM.toLinear(gi / (size - 1))
          data[i + 2] = CM.toLinear(bi / (size - 1))
          data[i + 3] = 1
        }
      }
    }
    const src = this.uploadLinearFloat(data, w, h)
    let img = this.acquire(w, h, true)
    this.copyInto({ tex: src.tex, fbo: null as any, w, h }, img)
    img = this.pixelSegment(img, state.basic, state.layers.filter((l) => l.visible && l.opacity > 0 && !isSpatial(l.kind)))
    const out = this.acquire(w, h, true)
    const u = this.use('output')
    this.bindTex(0, img.tex)
    gl.uniform1i(u('u_src'), 0)
    gl.uniform4f(u('u_crop'), 0, 0, 1, 1)
    gl.uniform2f(u('u_step'), 1 / w, 1 / h)
    gl.uniform1i(u('u_ss'), 0)
    this.draw(out)
    const f = new Float32Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f)
    this.release(out)
    this.release(img)
    this.dispose(src)
    // 行顺序：蓝色 bi 对应第 bi 行（自底向上），和 .cube 的顺序一致：先红、再绿、最后蓝
    return f
  }
}

function flipRows<T extends Uint8Array | Uint16Array>(px: T, w: number, h: number): T {
  const row = w * 4
  const out = new (px.constructor as any)(px.length) as T
  for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row)
  return out
}
