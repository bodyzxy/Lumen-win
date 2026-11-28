import { useEffect, useState } from 'react'
import { spring } from '../anim'
import { L } from '../i18n'
import { doc, ExportFormat, exportFormats, useDoc } from '../model/doc'
import { GlassButton, InkSegment, MicroLabel, ScrubRow } from './kit'
import { fx, Presence } from './motion'

/** 导出面板（Mac 上是从工具栏落下的 sheet） */
export function ExportSheet() {
  const show = useDoc((d) => d.showExportSheet)
  return (
    <>
      <Presence show={show} enter={fx.opacity} spring={spring(0.35, 1)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.08)', zIndex: 50 }}>
        <div style={{ position: 'absolute', inset: 0 }} onClick={() => doc.set('showExportSheet', false)} />
      </Presence>
      <Presence
        show={show}
        enter={[
          { transform: 'translate(-50%, -24px)', opacity: 0 },
          { transform: 'translate(-50%, 0)', opacity: 1 },
        ]}
        spring={spring(0.4, 0.86)}
        exitSpring={spring(0.3, 1)}
        style={{ position: 'absolute', left: '50%', top: 8, zIndex: 51, transform: 'translate(-50%, 0)' }}
      >
        <ExportCard />
      </Presence>
    </>
  )
}

function ExportCard() {
  const filmCount = useDoc((d) => d.filmstrip.length)
  const [format, setFormat] = useState<ExportFormat>('JPEG')
  const [quality, setQuality] = useState(92)
  const [sizeOption, setSizeOption] = useState(0)
  const [batchAll, setBatchAll] = useState(false)
  const [includeExifFrame, setIncludeExifFrame] = useState(false)
  const sizes: [string, number | null][] = [[L('原尺寸', 'Original'), null], ['3840', 3840], ['2048', 2048], ['1080', 1080]]

  const runExport = () => {
    if (batchAll && filmCount > 1) doc.exportAll(format, quality / 100, sizes[sizeOption][1], includeExifFrame)
    else doc.export(format, quality / 100, sizes[sizeOption][1], includeExifFrame)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') doc.set('showExportSheet', false)
      if (e.key === 'Enter') runExport()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const hint: Record<ExportFormat, string> = {
    JPEG: L('最通用，分享、发给别人都用它', 'The most compatible — for sharing and sending'),
    WEBP: L('画质和 JPEG 相同，体积更小，浏览器和新版系统都能看', 'Same quality as JPEG, smaller files, opens in browsers and modern apps'),
    PNG: L('无损，文件较大，适合带文字的图', 'Lossless with larger files — good for images with text'),
    TIFF: L('16 位无损，适合之后继续修图或印刷', '16-bit lossless — for further retouching or print'),
  }
  const lossy = format === 'JPEG' || format === 'WEBP'

  return (
    <div
      style={{
        width: 400, background: 'var(--surface)', borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 0 0 0.5px rgba(0,0,0,0.14), 0 18px 60px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ padding: '22px 22px 18px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{L('导出', 'Export')}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{L('按原图分辨率重新计算全部调整', 'All adjustments are recalculated at full resolution')}</div>
      </div>
      <div className="hairline-h" />
      <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex' }}>
          <MicroLabel text="Format" />
        </div>
        <InkSegment items={exportFormats.map((f) => [f, f === 'WEBP' ? 'WebP' : f] as [ExportFormat, string])} selection={format} onSelect={setFormat} />
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{hint[format]}</div>
      </div>
      <Presence show={lossy} enter={fx.focusPullIn} exit={fx.focusPullOut} spring={spring(0.4, 0.86)} initial={false}>
        <div style={{ padding: '0 4px' }}>
          <ScrubRow title={L('画质', 'Quality')} value={quality} onChange={setQuality} range={[50, 100]} defaultValue={92} help="export.quality" />
        </div>
      </Presence>
      <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex' }}>
          <MicroLabel text="Long edge" trailing="PX" />
        </div>
        <InkSegment items={sizes.map((s, i) => [i, s[0]] as [number, string])} selection={sizeOption} onSelect={setSizeOption} />
      </div>
      {filmCount > 1 && (
        <div style={{ padding: '0 22px 16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex' }}>
            <MicroLabel text="Scope" />
          </div>
          <InkSegment
            items={[
              [false, L('当前照片', 'Current Photo')] as [boolean, string],
              [true, L(`全部 ${filmCount} 张照片`, `All ${filmCount} Photos`)] as [boolean, string],
            ]}
            selection={batchAll}
            onSelect={setBatchAll}
          />
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 22px 14px 22px', cursor: 'pointer', fontSize: 11.5, color: 'var(--text2)' }}>
        <input type="checkbox" checked={includeExifFrame} onChange={(e) => setIncludeExifFrame(e.target.checked)} />
        <span>{L('EXIF 白边水印（相机型号 · 光圈 · 快门 · ISO）', 'EXIF Gallery Frame (Camera · Aperture · Shutter · ISO)')}</span>
      </label>
      <div className="hairline-h" />
      <div style={{ display: 'flex', alignItems: 'center', padding: 18 }}>
        <GlassButton onClick={() => doc.set('showExportSheet', false)}>{L('取消', 'Cancel')}</GlassButton>
        <span style={{ flex: 1 }} />
        <GlassButton prominent onClick={runExport}>
          {batchAll && filmCount > 1
            ? L('选择文件夹并批量导出', 'Choose Folder & Batch Export')
            : L('选择位置并导出', 'Choose Location & Export')}
        </GlassButton>
      </div>
    </div>
  )
}

