// 全部调色算法的 GLSL 版本。逐像素部分和 Mac 版 LUTBuilder.swift 一一对应（同样的公式、同样的常数），
// Mac 版把它们烘焙成 3D LUT，这里直接在 GPU 上逐像素计算，结果一致而且没有 LUT 插值误差。
// 空间类效果（清晰度、阴影高光、暗角、颗粒……）对应 RenderEngine.swift 里的 Core Image 滤镜。

export const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
in vec2 v_uv;
out vec4 outColor;

float clamp01(float v) { return clamp(v, 0.0, 1.0); }
vec3 clamp01(vec3 v) { return clamp(v, 0.0, 1.0); }
float luma(vec3 c) { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
float lumaLin(vec3 c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

float toLinear1(float v) { return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4); }
float toGamma1(float v) { float x = max(0.0, v); return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1.0 / 2.4) - 0.055; }
vec3 toLinear(vec3 c) { return vec3(toLinear1(c.r), toLinear1(c.g), toLinear1(c.b)); }
vec3 toGamma(vec3 c) { return vec3(toGamma1(c.r), toGamma1(c.g), toGamma1(c.b)); }

float smoothstep2(float e0, float e1, float x) {
  float t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3.0 - 2.0 * t);
}

vec3 rgbToHsl(vec3 c) {
  float maxV = max(c.r, max(c.g, c.b));
  float minV = min(c.r, min(c.g, c.b));
  float l = (maxV + minV) / 2.0;
  float d = maxV - minV;
  if (d < 1e-9) return vec3(0.0, 0.0, l);
  float s = l > 0.5 ? d / (2.0 - maxV - minV) : d / (maxV + minV);
  float h;
  if (maxV == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (maxV == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return vec3(h * 60.0, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(float hDeg, float s, float l) {
  if (s <= 1e-9) return vec3(l);
  float h = mod(hDeg, 360.0);
  if (h < 0.0) h += 360.0;
  float hn = h / 360.0;
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, hn + 1.0 / 3.0), hue2rgb(p, q, hn), hue2rgb(p, q, hn - 1.0 / 3.0));
}

float blendCh(float b, float t, int mode) {
  b = clamp01(b); t = clamp01(t);
  switch (mode) {
    case 1: return b * t;
    case 2: return 1.0 - (1.0 - b) * (1.0 - t);
    case 3: return b < 0.5 ? 2.0 * b * t : 1.0 - 2.0 * (1.0 - b) * (1.0 - t);
    case 4: return t <= 0.5 ? b - (1.0 - 2.0 * t) * b * (1.0 - b) : b + (2.0 * t - 1.0) * (sqrt(b) - b);
    case 5: return t < 0.5 ? 2.0 * b * t : 1.0 - 2.0 * (1.0 - b) * (1.0 - t);
    case 6: return t >= 0.9999 ? 1.0 : min(1.0, b / max(1e-5, 1.0 - t));
    case 7: return t <= 0.0001 ? 0.0 : max(0.0, 1.0 - (1.0 - b) / max(1e-5, t));
    case 8: return min(b, t);
    case 9: return max(b, t);
  }
  return t;
}

vec3 applyBlend(vec3 base, vec3 top, int mode) {
  if (mode == 0) return top;
  if (mode == 10) {
    vec3 hb = rgbToHsl(clamp01(base));
    vec3 ht = rgbToHsl(clamp01(top));
    return hslToRgb(ht.x, ht.y, hb.z);
  }
  if (mode == 11) {
    vec3 hb = rgbToHsl(clamp01(base));
    vec3 ht = rgbToHsl(clamp01(top));
    return hslToRgb(hb.x, hb.y, ht.z);
  }
  return vec3(blendCh(base.r, top.r, mode), blendCh(base.g, top.g, mode), blendCh(base.b, top.b, mode));
}

float contrastCurve(float v, float a) {
  float x = clamp01(v);
  float e = a > 0.0 ? 1.0 + a * 1.2 : 1.0 / (1.0 + (-a) * 0.9);
  return x < 0.5 ? 0.5 * pow(2.0 * x, e) : 1.0 - 0.5 * pow(2.0 * (1.0 - x), e);
}

vec3 vibranceFn(vec3 c, float amt) {
  if (amt == 0.0) return c;
  float s = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float l = luma(c);
  float amount = amt * (1.0 - s) * (1.0 - s) * 1.4;
  if (amt > 0.0) {
    float h = rgbToHsl(c).x;
    if (h > 10.0 && h < 55.0) amount *= 0.5;
  }
  float f = 1.0 + amount;
  return vec3(l) + (c - vec3(l)) * f;
}

vec3 saturateFn(vec3 c, float amt) {
  if (amt == 0.0) return c;
  float l = luma(c);
  float f = max(0.0, 1.0 + amt);
  return vec3(l) + (c - vec3(l)) * f;
}

float angleDiff(float a, float b) {
  float d = mod(a - b, 360.0);
  if (d > 180.0) d -= 360.0;
  return d;
}

// 双三次（B 样条）取样：用低分辨率模糊结果放大时不会出现网格感
vec4 sampleBicubic(sampler2D tex, vec2 uv) {
  vec2 texSize = vec2(textureSize(tex, 0));
  vec2 st = uv * texSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 / 6.0) * (-f3 + 3.0 * f2 - 3.0 * f + 1.0);
  vec2 w1 = (1.0 / 6.0) * (3.0 * f3 - 6.0 * f2 + 4.0);
  vec2 w2 = (1.0 / 6.0) * (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0);
  vec2 w3 = (1.0 / 6.0) * f3;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (w1 / g0) - 1.0 + i + 0.5;
  vec2 h1 = (w3 / g1) + 1.0 + i + 0.5;
  vec4 t00 = texture(tex, h0 / texSize);
  vec4 t10 = texture(tex, vec2(h1.x, h0.y) / texSize);
  vec4 t01 = texture(tex, vec2(h0.x, h1.y) / texSize);
  vec4 t11 = texture(tex, h1 / texSize);
  return g0.y * (g0.x * t00 + g1.x * t10) + g1.y * (g0.x * t01 + g1.x * t11);
}
`

/** 读取源图（sRGB 纹理，取样时自动转线性），做曝光和白平衡（线性空间，和 Mac 一致） */
export const FRAG_INPUT = COMMON + `
uniform sampler2D u_src;
uniform float u_exposure;
uniform vec3 u_gains;
uniform vec4 u_rect;   // 取源纹理的哪一块（uv，左上为原点；源纹理按从上到下存放）
void main() {
  // sRGB8 纹理取样时 GPU 已经换算成线性值；工作纹理是从下到上存放的，这里顺便翻转
  vec2 uv = vec2(u_rect.x + v_uv.x * u_rect.z, u_rect.y + (1.0 - v_uv.y) * u_rect.w);
  vec3 c = texture(u_src, uv).rgb;
  c *= exp2(u_exposure);
  c *= u_gains;
  outColor = vec4(c, 1.0);
}`

/** 复制 / 缩小（2×2 盒式下采样） */
export const FRAG_COPY = COMMON + `
uniform sampler2D u_src;
void main() { outColor = vec4(texture(u_src, v_uv).rgb, 1.0); }`

/** 可分离高斯模糊的一个方向 */
export const FRAG_BLUR = COMMON + `
uniform sampler2D u_src;
uniform vec2 u_dir;      // 一个像素的 uv 步长（只有一个方向非零）
uniform float u_sigma;
uniform int u_radius;
void main() {
  vec3 acc = texture(u_src, v_uv).rgb;
  float wsum = 1.0;
  float k = -0.5 / (u_sigma * u_sigma);
  // 每次取两个相邻像素的线性插值，步数减半
  for (int i = 1; i <= 64; i += 2) {
    if (i > u_radius) break;
    float w1 = exp(float(i * i) * k);
    float w2 = exp(float((i + 1) * (i + 1)) * k);
    float w = w1 + w2;
    float o = float(i) + w2 / w;
    acc += (texture(u_src, v_uv + u_dir * o).rgb + texture(u_src, v_uv - u_dir * o).rgb) * w;
    wsum += 2.0 * w;
  }
  outColor = vec4(acc / wsum, 1.0);
}`

/** 局部对比（Core Image 的 CIUnsharpMask；负值时向模糊图溶解） */
export const FRAG_LOCAL_CONTRAST = COMMON + `
uniform sampler2D u_src;
uniform sampler2D u_blur;
uniform float u_amount;  // 正：intensity；负：溶解比例
uniform int u_mode;      // 0 = 锐化（unsharp）；1 = 柔化（dissolve）；2 = 只作用在亮度上（锐化）
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  vec3 b = sampleBicubic(u_blur, v_uv).rgb;
  vec3 o;
  if (u_mode == 0) o = c + (c - b) * u_amount;
  else if (u_mode == 1) o = mix(c, b, u_amount);
  else { float d = lumaLin(c) - lumaLin(b); o = c + vec3(d * u_amount); }
  outColor = vec4(max(o, vec3(-0.5)), 1.0);
}`

/** 高光与阴影（对应 CIHighlightShadowAdjust：按周围的平均亮度决定提亮 / 压暗多少） */
export const FRAG_HIGHLIGHT_SHADOW = COMMON + `
uniform sampler2D u_src;
uniform sampler2D u_blur;
uniform float u_shadow;     // -1...1
uniform float u_highlight;  // 0...1，1 表示不变
void main() {
  vec3 lin = texture(u_src, v_uv).rgb;
  vec3 g = toGamma(max(lin, vec3(0.0)));
  float y = luma(g);
  float yb = clamp01(luma(toGamma(max(sampleBicubic(u_blur, v_uv).rgb, vec3(0.0)))));
  float ny = y;
  if (u_shadow != 0.0) {
    float ws = pow(1.0 - smoothstep2(0.0, 0.7, yb), 1.5);
    float lifted = u_shadow > 0.0 ? pow(max(ny, 0.0), 1.0 / (1.0 + u_shadow * 1.6)) : pow(max(ny, 0.0), 1.0 + (-u_shadow) * 1.2);
    ny = mix(ny, lifted, ws);
  }
  float k = 1.0 - u_highlight;
  if (k > 0.0) {
    float wh = smoothstep2(0.4, 1.0, yb);
    ny = ny - k * wh * 0.38 * ny * ny;
  }
  vec3 o = y > 1e-4 ? g * (ny / y) : g + vec3(ny - y);
  outColor = vec4(toLinear(max(o, vec3(0.0))), 1.0);
}`

/** 降噪：小半径的保边平滑（对应 CINoiseReduction） */
export const FRAG_DENOISE = COMMON + `
uniform sampler2D u_src;
uniform float u_level;
void main() {
  vec2 px = 1.0 / vec2(textureSize(u_src, 0));
  vec3 c0 = texture(u_src, v_uv).rgb;
  float y0 = luma(toGamma(max(c0, vec3(0.0))));
  float t = u_level * 1.6 + 0.002;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec3 c = texture(u_src, v_uv + vec2(float(i), float(j)) * px).rgb;
      float dy = luma(toGamma(max(c, vec3(0.0)))) - y0;
      float w = exp(-float(i * i + j * j) / 4.5) * exp(-(dy * dy) / (2.0 * t * t));
      acc += c * w;
      wsum += w;
    }
  }
  outColor = vec4(acc / wsum, 1.0);
}`

/** 颜色控制（CIColorControls 的饱和度、对比度）、伽马、自然饱和度、曝光 —— 空间类图层里用到 */
export const FRAG_COLOR_CONTROLS = COMMON + `
uniform sampler2D u_src;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_vibrance;
uniform float u_exposure;
uniform float u_power;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  c *= exp2(u_exposure);
  if (u_power != 1.0) c = pow(max(c, vec3(0.0)), vec3(u_power));
  if (u_vibrance != 0.0) {
    vec3 g = toGamma(max(c, vec3(0.0)));
    g = vibranceFn(clamp01(g), u_vibrance);
    c = toLinear(max(g, vec3(0.0)));
  }
  float l = lumaLin(c);
  c = mix(vec3(l), c, u_saturation);
  c = (c - 0.5) * u_contrast + 0.5;
  outColor = vec4(c, 1.0);
}`

/** 溶解与混合（空间类图层的混合模式与不透明度） */
export const FRAG_DISSOLVE = COMMON + `
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform float u_t;
uniform int u_blend;
void main() {
  vec3 a = texture(u_a, v_uv).rgb;
  vec3 b = texture(u_b, v_uv).rgb;
  if (u_blend != 0) {
    vec3 ag = clamp01(toGamma(a));
    vec3 bg = clamp01(toGamma(b));
    b = toLinear(clamp01(applyBlend(ag, bg, u_blend)));
  }
  outColor = vec4(mix(a, b, u_t), 1.0);
}`

/** 暗角 + 颗粒（线性空间） */
export const FRAG_FINISH = COMMON + `
uniform sampler2D u_src;
uniform vec2 u_texSize;     // 当前纹理的像素尺寸
uniform vec2 u_origin;      // 当前纹理左上角在整张图中的位置（像素）
uniform vec2 u_refSize;     // 整张图的像素尺寸
uniform float u_vignette;   // -1...1
uniform float u_grain;      // 0...1
uniform float u_grainScale; // 颗粒单元的像素大小
uniform float u_seed;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i + u_seed), b = hash(i + vec2(1.0, 0.0) + u_seed);
  float c = hash(i + vec2(0.0, 1.0) + u_seed), d = hash(i + vec2(1.0, 1.0) + u_seed);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float softLight(float b, float s) {
  if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b);
  float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(max(b, 0.0));
  return b + (2.0 * s - 1.0) * (d - b);
}
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  // 图像坐标：左上为原点
  vec2 p = u_origin + vec2(v_uv.x, 1.0 - v_uv.y) * u_texSize;
  if (u_vignette != 0.0) {
    vec2 ctr = u_refSize * 0.5;
    float half_ = length(u_refSize) * 0.5;
    float r0 = half_ * 0.42, r1 = half_ * 1.05;
    float t = clamp01((length(p - ctr) - r0) / (r1 - r0));
    float a = abs(u_vignette);
    if (u_vignette > 0.0) {
      float edge = toLinear1(1.0 - 0.85 * a);
      c *= mix(1.0, edge, t);
    } else {
      float edge = toLinear1(0.6 * a);
      float g = mix(0.0, edge, t);
      c = 1.0 - (1.0 - c) * (1.0 - g);
    }
  }
  if (u_grain > 0.0) {
    float n = valueNoise(p / u_grainScale);
    // 模糊后的随机噪声方差变小，乘一点系数让强度和 Core Image 接近
    n = 0.5 + (n - 0.5) * 1.6;
    float k = u_grain * 0.45;
    float s = clamp01(n * k + 0.5 - 0.5 * k);
    c = vec3(softLight(c.r, s), softLight(c.g, s), softLight(c.b, s));
  }
  outColor = vec4(c, 1.0);
}`

/** 输出：线性 → sRGB 编码，可以裁一块、缩放（缩小时做 2×2 超采样） */
export const FRAG_OUTPUT = COMMON + `
uniform sampler2D u_src;
uniform vec4 u_crop;      // 源纹理中要输出的区域（uv，x y w h，左下为原点）
uniform vec2 u_step;      // 输出一个像素在源 uv 中的大小
uniform int u_ss;
void main() {
  vec2 uv = u_crop.xy + v_uv * u_crop.zw;
  vec3 c;
  if (u_ss == 1) {
    c = (texture(u_src, uv + u_step * vec2(-0.25, -0.25)).rgb + texture(u_src, uv + u_step * vec2(0.25, -0.25)).rgb +
         texture(u_src, uv + u_step * vec2(-0.25, 0.25)).rgb + texture(u_src, uv + u_step * vec2(0.25, 0.25)).rgb) * 0.25;
  } else {
    c = texture(u_src, uv).rgb;
  }
  outColor = vec4(clamp01(toGamma(c)), 1.0);
}`

/**
 * 逐像素调整（基础面板的色调部分 + 所有非空间类图层），每个图层一次绘制。
 * 输入、输出都是线性值；内部换算成伽马编码值计算（和 Mac 版 LUT 的取值空间一致）。
 */
export const FRAG_LAYER = COMMON + `
uniform sampler2D u_src;
uniform int u_kind;
uniform float u_opacity;
uniform int u_blend;
uniform float u_p[64];
uniform vec3 u_c[12];
uniform sampler2D u_table;   // R32F 1024×5：曲线 RGB/R/G/B + 均化
uniform sampler3D u_lut;
uniform int u_flags;

float tableAt(int row, float x) {
  float f = clamp01(x) * 1023.0;
  int i = int(f);
  if (i >= 1023) return texelFetch(u_table, ivec2(1023, row), 0).r;
  float a = texelFetch(u_table, ivec2(i, row), 0).r;
  float b = texelFetch(u_table, ivec2(i + 1, row), 0).r;
  return a + (b - a) * (f - float(i));
}

// ---------- 基础面板中的逐像素部分（BasicTone） ----------
// u_p: 0 contrast 1 highlights 2 whites 3 blacks 4 dehaze 5 vibrance 6 saturation 7 shadowTint 8 hasMatrix 9..17 matrix
vec3 basicTone(vec3 c) {
  float contrast = u_p[0], highlights = u_p[1], whites = u_p[2], blacks = u_p[3];
  float dehaze = u_p[4], vibrance = u_p[5], saturation = u_p[6], shadowTint = u_p[7];
  if (u_p[8] > 0.5) {
    c = vec3(u_p[9] * c.r + u_p[10] * c.g + u_p[11] * c.b,
             u_p[12] * c.r + u_p[13] * c.g + u_p[14] * c.b,
             u_p[15] * c.r + u_p[16] * c.g + u_p[17] * c.b);
  }
  if (shadowTint != 0.0) {
    float l = luma(c);
    float w = (1.0 - l) * (1.0 - l);
    float d = shadowTint * 0.08 * w;
    c.r += d * 0.5; c.b += d * 0.5; c.g -= d;
  }
  if (whites != 0.0 || blacks != 0.0 || highlights != 0.0) {
    float l = luma(c);
    float nl = l;
    if (whites != 0.0) nl += whites * 0.35 * l * l * l;
    if (blacks != 0.0) { float k = 1.0 - l; nl += blacks * 0.3 * k * k * k; }
    if (highlights > 0.0) {
      float bump = smoothstep2(0.35, 0.75, l) * (1.0 - smoothstep2(0.85, 1.0, l) * 0.5);
      nl += highlights * 0.22 * bump;
    }
    c += vec3(nl - l);
  }
  if (contrast != 0.0) c = vec3(contrastCurve(c.r, contrast), contrastCurve(c.g, contrast), contrastCurve(c.b, contrast));
  if (dehaze < 0.0) {
    float t = -dehaze * 0.5;
    c = mix(c, vec3(0.78, 0.80, 0.84), t);
  }
  c = vibranceFn(c, vibrance);
  c = saturateFn(c, saturation);
  return clamp01(c);
}

// ---------- 曲线 ----------
vec3 curves(vec3 c) {
  if ((u_flags & 1) != 0) c = vec3(tableAt(0, c.r), tableAt(0, c.g), tableAt(0, c.b));
  if ((u_flags & 2) != 0) c.r = tableAt(1, c.r);
  if ((u_flags & 4) != 0) c.g = tableAt(2, c.g);
  if ((u_flags & 8) != 0) c.b = tableAt(3, c.b);
  return c;
}

// ---------- 色阶 ----------
float levelsCh(float v, int o) {
  float inB = u_p[o] / 255.0;
  float inW = max(u_p[o + 1] / 255.0, inB + 0.004);
  float x = clamp01((v - inB) / (inW - inB));
  x = pow(x, 1.0 / max(u_p[o + 2], 0.01));
  return u_p[o + 3] / 255.0 + x * (u_p[o + 4] - u_p[o + 3]) / 255.0;
}
vec3 levels(vec3 c) {
  // u_p: master 0..4, red 5..9, green 10..14, blue 15..19；flags 位表示该通道不是默认值
  float r = c.r, g = c.g, b = c.b;
  if ((u_flags & 2) != 0) r = levelsCh(r, 5);
  if ((u_flags & 4) != 0) g = levelsCh(g, 10);
  if ((u_flags & 8) != 0) b = levelsCh(b, 15);
  if ((u_flags & 1) != 0) { r = levelsCh(r, 0); g = levelsCh(g, 0); b = levelsCh(b, 0); }
  return vec3(r, g, b);
}

// ---------- 亮度/对比度 ----------
vec3 brightnessContrast(vec3 c) {
  float br = u_p[0], ct = u_p[1];
  if (br != 0.0) {
    float e = pow(2.0, -br / 150.0 * 0.9);
    c = pow(clamp01(c), vec3(e));
  }
  if (ct != 0.0) {
    float a = ct / 100.0;
    c = vec3(contrastCurve(c.r, a), contrastCurve(c.g, a), contrastCurve(c.b, a));
  }
  return c;
}

// ---------- 曝光度 ----------
vec3 exposureL(vec3 c) {
  float k = pow(2.0, u_p[0]);
  float gInv = 1.0 / max(u_p[2], 0.01);
  vec3 lin = max(vec3(0.0), toLinear(c) * k + u_p[1]);
  return clamp01(toGamma(pow(lin, vec3(gInv))));
}

vec3 applyLightness(vec3 c, float L) {
  if (L == 0.0) return c;
  if (L > 0.0) return c + (1.0 - c) * L;
  return c * (1.0 + L);
}

// ---------- 色相/饱和度 ----------
vec3 hueSat(vec3 c) {
  // 0 hue 1 sat 2 lightness 3 colorize 4 colorizeHue 5 colorizeSat
  if (u_p[3] > 0.5) {
    float l = luma(c);
    vec3 col = hslToRgb(u_p[4], u_p[5] / 100.0, l);
    return applyLightness(col, u_p[2] / 100.0);
  }
  if (u_p[0] != 0.0) {
    vec3 hsl = rgbToHsl(c);
    c = hslToRgb(hsl.x + u_p[0], hsl.y, hsl.z);
  }
  if (u_p[1] != 0.0) {
    float s = u_p[1] / 100.0;
    float f = s > 0.0 ? 1.0 + s * 1.4 : 1.0 + s;
    float l = luma(c);
    c = vec3(l) + (c - vec3(l)) * f;
  }
  return applyLightness(clamp01(c), u_p[2] / 100.0);
}

// ---------- HSL ----------
const float CENTERS[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 280.0, 320.0);
vec3 hslMix(vec3 c) {
  vec3 hsl = rgbToHsl(c);
  if (hsl.y < 1e-4) return c;
  float dh = 0.0, ds = 0.0, dl = 0.0;
  for (int i = 0; i < 8; i++) {
    float ctr = CENTERS[i];
    float d = angleDiff(hsl.x, ctr);
    float span = d >= 0.0 ? abs(angleDiff(CENTERS[(i + 1) % 8], ctr)) : abs(angleDiff(ctr, CENTERS[(i + 7) % 8]));
    float w = 1.0 - abs(d) / span;
    if (w <= 0.0) continue;
    dh += w * u_p[i] / 100.0 * 30.0;
    ds += w * u_p[8 + i] / 100.0;
    dl += w * u_p[16 + i] / 100.0;
  }
  float s = clamp01(hsl.y * (1.0 + ds));
  float l = clamp01(hsl.z + dl * 0.35 * hsl.y);
  return hslToRgb(hsl.x + dh, s, l);
}

// ---------- 色彩平衡 ----------
vec3 colorBalance(vec3 c) {
  // 0..2 shadows 3..5 midtones 6..8 highlights 9 preserve
  float l = rgbToHsl(c).z;
  float a = 0.25, bb = 0.333, scale = 0.7;
  float sw = clamp01((l - bb) / -a + 0.5) * scale;
  float mw = clamp01((l - bb) / a + 0.5) * clamp01((l + bb - 1.0) / -a + 0.5) * scale;
  float hw = clamp01((l + bb - 1.0) / a + 0.5) * scale;
  vec3 o = c + vec3(u_p[0] * sw + u_p[3] * mw + u_p[6] * hw,
                    u_p[1] * sw + u_p[4] * mw + u_p[7] * hw,
                    u_p[2] * sw + u_p[5] * mw + u_p[8] * hw) / 100.0;
  o = clamp01(o);
  if (u_p[9] > 0.5) {
    vec3 h = rgbToHsl(o);
    return hslToRgb(h.x, h.y, l);
  }
  return o;
}

// ---------- 可选颜色 ----------
vec3 selectiveColor(vec3 c) {
  // u_p[g*4 + k] (g 0..8, k 0..3)，u_p[36] relative
  float r = c.r, g = c.g, b = c.b;
  float maxV = max(r, max(g, b)), minV = min(r, min(g, b));
  float midV = r + g + b - maxV - minV;
  float w[9];
  for (int i = 0; i < 9; i++) w[i] = 0.0;
  if (maxV == r) w[0] = maxV - midV;
  if (minV == b) w[1] = midV - minV;
  if (maxV == g) w[2] = maxV - midV;
  if (minV == r) w[3] = midV - minV;
  if (maxV == b) w[4] = maxV - midV;
  if (minV == g) w[5] = midV - minV;
  w[6] = max(0.0, (minV - 0.5) * 2.0);
  w[7] = max(0.0, 1.0 - (abs(maxV - 0.5) + abs(minV - 0.5)));
  w[8] = max(0.0, (0.5 - maxV) * 2.0);
  bool rel = u_p[36] > 0.5;
  vec3 o = c;
  for (int gi = 0; gi < 9; gi++) {
    if (w[gi] <= 0.0) continue;
    float a0 = u_p[gi * 4], a1 = u_p[gi * 4 + 1], a2 = u_p[gi * 4 + 2], a3 = u_p[gi * 4 + 3];
    if (a0 == 0.0 && a1 == 0.0 && a2 == 0.0 && a3 == 0.0) continue;
    float k = a3 / 100.0;
    o.r += -(a0 / 100.0 + k) * (rel ? (1.0 - r) : 1.0) * w[gi];
    o.g += -(a1 / 100.0 + k) * (rel ? (1.0 - g) : 1.0) * w[gi];
    o.b += -(a2 / 100.0 + k) * (rel ? (1.0 - b) : 1.0) * w[gi];
  }
  return clamp01(o);
}

// ---------- 通道混合器 ----------
float mixRow(vec3 c, int o) { return (u_p[o] * c.r + u_p[o + 1] * c.g + u_p[o + 2] * c.b) / 100.0 + u_p[o + 3] / 100.0; }
vec3 channelMixer(vec3 c) {
  // 0..3 red 4..7 green 8..11 blue 12..15 gray 16 mono
  if (u_p[16] > 0.5) return vec3(clamp01(mixRow(c, 12)));
  return clamp01(vec3(mixRow(c, 0), mixRow(c, 4), mixRow(c, 8)));
}

// ---------- 黑白 ----------
vec3 blackWhite(vec3 c) {
  // 0..5 weights 6 tint 7 tintHue 8 tintSat
  float r = c.r, g = c.g, b = c.b;
  float maxV = max(r, max(g, b)), minV = min(r, min(g, b));
  float midV = r + g + b - maxV - minV;
  float primary, secondary;
  if (maxV == r) { primary = u_p[0]; secondary = (minV == b) ? u_p[1] : u_p[5]; }
  else if (maxV == g) { primary = u_p[2]; secondary = (minV == b) ? u_p[1] : u_p[3]; }
  else { primary = u_p[4]; secondary = (minV == r) ? u_p[3] : u_p[5]; }
  float gray = clamp01(minV + (midV - minV) * secondary / 100.0 + (maxV - midV) * primary / 100.0);
  if (u_p[6] > 0.5) return hslToRgb(u_p[7], u_p[8] / 100.0, gray);
  return vec3(gray);
}

// ---------- 照片滤镜 ----------
vec3 photoFilter(vec3 c) {
  // u_c[0] color; 0 density 1 preserve
  float d = u_p[0] / 100.0;
  vec3 f = mix(vec3(1.0), u_c[0], d);
  vec3 o = c * f;
  if (u_p[1] > 0.5) {
    float l0 = luma(c), l1 = luma(o);
    if (l1 > 1e-5) o *= l0 / l1;
  }
  return clamp01(o);
}

// ---------- 渐变映射 ----------
vec3 gradientMap(vec3 c) {
  // u_p[0] count, u_p[1] reverse, u_p[2+i] positions（已排序）, u_c[i] colors
  int n = int(u_p[0]);
  if (n < 1) return c;
  float t = luma(c);
  if (u_p[1] > 0.5) t = 1.0 - t;
  if (t <= u_p[2]) return u_c[0];
  if (t >= u_p[2 + n - 1]) return u_c[n - 1];
  for (int i = 0; i < 11; i++) {
    if (i >= n - 1) break;
    float a = u_p[2 + i], b = u_p[3 + i];
    if (t >= a && t <= b) {
      float k = (t - a) / max(b - a, 1e-6);
      return mix(u_c[i], u_c[i + 1], k);
    }
  }
  return c;
}

// ---------- 颜色分级 ----------
vec3 addWheel(vec3 c, int o, float weight) {
  // u_p[o] hue, [o+1] sat, [o+2] lum
  if (weight <= 0.0) return c;
  if (u_p[o + 1] > 0.0) {
    vec3 hc = hslToRgb(u_p[o], 1.0, 0.5);
    float hl = luma(hc);
    float k = u_p[o + 1] / 100.0 * 0.35 * weight;
    c += (hc - vec3(hl)) * k;
  }
  if (u_p[o + 2] != 0.0) c += vec3(u_p[o + 2] / 100.0 * 0.25 * weight);
  return c;
}
vec3 colorGrading(vec3 c) {
  // 0..2 shadows 3..5 mid 6..8 high 9..11 global 12 blending 13 balance
  float l = luma(c);
  float pivot = 0.5 - u_p[13] / 100.0 * 0.25;
  float width = 0.12 + u_p[12] / 100.0 * 0.4;
  float hw = smoothstep2(pivot - width, pivot + width, l);
  float sw = 1.0 - hw;
  float mw = exp(-pow((l - pivot) / (0.16 + u_p[12] / 100.0 * 0.22), 2.0));
  float side = 1.0 - mw * 0.6;
  c = addWheel(c, 0, sw * side);
  c = addWheel(c, 3, mw);
  c = addWheel(c, 6, hw * side);
  c = addWheel(c, 9, 0.6);
  return clamp01(c);
}

// ---------- 色调分离 / 阈值 / LUT ----------
vec3 posterize(vec3 c) {
  float n = max(2.0, floor(u_p[0] + 0.5));
  return floor(c * (n - 1.0) + 0.5) / (n - 1.0);
}
vec3 threshold(vec3 c) {
  return vec3(luma(c) * 255.0 >= u_p[0] ? 1.0 : 0.0);
}
vec3 lut(vec3 c) {
  // 0 intensity 1 size 2..4 domainMin 5..7 domainMax 8 hasLut
  if (u_p[8] < 0.5) return c;
  float n = u_p[1];
  vec3 dMin = vec3(u_p[2], u_p[3], u_p[4]);
  vec3 dMax = vec3(u_p[5], u_p[6], u_p[7]);
  vec3 f = clamp01((c - dMin) / max(dMax - dMin, vec3(1e-6)));
  vec3 uvw = (f * (n - 1.0) + 0.5) / n;
  vec3 o = texture(u_lut, uvw).rgb;
  return mix(c, o, u_p[0] / 100.0);
}

// ---------- 匹配颜色 ----------
vec3 matchColor(vec3 c) {
  // 0..2 ref mean 3..5 ref std 6..8 src mean 9..11 src std 12 lum 13 intensity 14 fade 15 neutralize 16 has
  if (u_p[16] < 0.5) return c;
  float y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  vec3 ycc = vec3(y, (c.b - y) * 0.564, (c.r - y) * 0.713);
  vec3 n;
  for (int i = 0; i < 3; i++) n[i] = (ycc[i] - u_p[6 + i]) / max(u_p[9 + i], 1e-4) * u_p[3 + i] + u_p[i];
  n.x *= u_p[12] / 100.0;
  if (u_p[15] > 0.5) { n.y -= u_p[1]; n.z -= u_p[2]; }
  n.y *= u_p[13] / 100.0;
  n.z *= u_p[13] / 100.0;
  n.x = clamp01(n.x);
  float r = n.x + n.z / 0.713;
  float b = n.x + n.y / 0.564;
  float g = (n.x - 0.299 * r - 0.114 * b) / 0.587;
  vec3 o = mix(vec3(r, g, b), c, u_p[14] / 100.0);
  return clamp01(o);
}

// ---------- 替换颜色 ----------
vec3 replaceColor(vec3 c) {
  // u_c[0] target; 0 fuzz 1 hue 2 sat 3 lightness
  vec3 t = u_c[0];
  float d = sqrt(pow(c.r - t.r, 2.0) * 0.9 + pow(c.g - t.g, 2.0) * 1.2 + pow(c.b - t.b, 2.0) * 0.9);
  float radius = max(0.01, u_p[0] / 200.0 * 0.85);
  float w = clamp01(1.0 - d / radius);
  w = w * w * (3.0 - 2.0 * w);
  if (w <= 0.0) return c;
  vec3 h = rgbToHsl(c);
  float s = clamp01(h.y * (1.0 + u_p[2] / 100.0 * w));
  vec3 o = hslToRgb(h.x + u_p[1] * w, s, h.z);
  o = applyLightness(o, u_p[3] / 100.0 * w);
  return clamp01(o);
}

// ---------- 色调均化 ----------
vec3 equalize(vec3 c) {
  if (u_p[0] < 0.5) return c;
  float l = clamp01(luma(c));
  float f = l * 255.0;
  int i = min(254, int(f));
  float a = texelFetch(u_table, ivec2(i, 4), 0).r;
  float b = texelFetch(u_table, ivec2(i + 1, 4), 0).r;
  float nl = mix(a, b, f - float(i));
  return clamp01(c + vec3(nl - l));
}

vec3 process(vec3 c) {
  switch (u_kind) {
    case 100: return basicTone(c);
    case 1: return curves(c);
    case 2: return levels(c);
    case 3: return brightnessContrast(c);
    case 4: return exposureL(c);
    case 5: return clamp01(saturateFn(vibranceFn(c, u_p[0] / 100.0), u_p[1] / 100.0));
    case 6: return hueSat(c);
    case 7: return hslMix(c);
    case 8: return colorBalance(c);
    case 9: return selectiveColor(c);
    case 10: return channelMixer(c);
    case 11: return blackWhite(c);
    case 12: return photoFilter(c);
    case 13: return gradientMap(c);
    case 14: return colorGrading(c);
    case 15: return posterize(c);
    case 16: return threshold(c);
    case 17: return vec3(1.0) - c;
    case 18: return lut(c);
    case 19: { float l = (max(c.r, max(c.g, c.b)) + min(c.r, min(c.g, c.b))) / 2.0; return vec3(l); }
    case 20: return matchColor(c);
    case 21: return replaceColor(c);
    case 22: return equalize(c);
  }
  return c;
}

void main() {
  vec3 lin = texture(u_src, v_uv).rgb;
  vec3 c = clamp01(toGamma(lin));
  vec3 o = process(c);
  if (u_blend != 0) o = applyBlend(c, o, u_blend);
  if (u_opacity < 0.999) o = mix(c, o, u_opacity);
  outColor = vec4(toLinear(clamp01(o)), 1.0);
}`
