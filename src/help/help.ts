import { Lang } from '../i18n'
import en from './en.json'
import zh from './zh.json'

/** 每个参数的“小问号”说明：它是什么、调大会怎样、调小会怎样、一句小建议。（和 Mac 版文案相同） */
export interface HelpEntry {
  title: string
  what: string
  up?: string
  down?: string
  tip?: string
}

const ZH = zh as Record<string, HelpEntry>
const EN = en as Record<string, HelpEntry>

export function helpEntry(key: string): HelpEntry {
  if (Lang.current === 'en') return EN[key] ?? ZH[key] ?? { title: 'Info', what: 'No description yet.' }
  return ZH[key] ?? { title: '说明', what: '这个参数暂时还没有说明。' }
}
