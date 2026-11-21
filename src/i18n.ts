// 界面语言：中文 / English。所有文字都通过 L(中文, 英文) 取值；
// 切换语言时整个界面会重新生成（见 App 里的 key），所以不需要逐个组件去订阅。

export type AppLanguage = 'zh' | 'en'

const KEY = 'lumen.language'

function initial(): AppLanguage {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {}
  const preferred = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase()
  return preferred.startsWith('zh') ? 'zh' : 'en'
}

let current: AppLanguage = initial()
const listeners = new Set<() => void>()

export const Lang = {
  get current() {
    return current
  },
  set(lang: AppLanguage) {
    if (lang === current) return
    current = lang
    try {
      localStorage.setItem(KEY, lang)
    } catch {}
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    listeners.forEach((l) => l())
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  displayName(l: AppLanguage) {
    return l === 'zh' ? '中文' : 'English'
  },
  all: ['zh', 'en'] as AppLanguage[],
}

document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en'

/** 按当前语言返回文字 */
export function L(zh: string, en: string): string {
  return current === 'en' ? en : zh
}
