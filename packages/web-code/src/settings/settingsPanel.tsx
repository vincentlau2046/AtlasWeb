// B3（工单 §R-B3-3，F9 无空壳开关）——设置面板：只渲染注入设置面（现产品
// 唯一受支持设置族 = 主题）；host 缺席 → 零渲染 fail-closed。host 以结构接口
// 注入（web-brand ThemeSettingsStore 满足此形），web-code 保持零跨包依赖。
import { useState } from 'react'

/** Structural theme-settings face（ThemeSettingsHost 子集；值域 fail-closed 在上游）。 */
export interface ThemeSettingsLike {
  getSnapshot(): {
    preference: string
    fontSize: number
    codeFontSize: number
    terminalFontSize: number
    textFontFamily: string
    codeFontFamily: string
    terminalFontFamily: string
  }
  set(field: string, value: number | string): void
  subscribe(listener: () => void): () => void
}

export interface SettingsPanelProps {
  themeHost: ThemeSettingsLike | null
  defaultOpen?: boolean
}

const PREFERENCES = ['light', 'dark', 'system'] as const
const SIZE_FIELDS = ['fontSize', 'codeFontSize', 'terminalFontSize'] as const

export function SettingsPanel({ themeHost, defaultOpen = false }: SettingsPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  if (themeHost === null) return null
  if (!open) {
    return (
      <div className='web-code-settings' data-settings-root>
        <button type='button' data-settings-toggle onClick={() => setOpen(true)}>设置</button>
      </div>
    )
  }
  const snapshot = themeHost.getSnapshot()
  return (
    <div className='web-code-settings' data-settings-root>
      <button type='button' data-settings-toggle onClick={() => setOpen(false)}>设置</button>
      <div className='web-code-settings-panel' data-settings-panel data-settings-preference={snapshot.preference}>
        <div className='web-code-settings-row' data-settings-field="preference">
          <span>主题</span>
          {PREFERENCES.map(preference => (
            <button
              type='button'
              key={preference}
              data-settings-option={preference}
              data-settings-selected={snapshot.preference === preference || undefined}
              onClick={() => themeHost.set('preference', preference)}
            >
              {preference}
            </button>
          ))}
        </div>
        {SIZE_FIELDS.map(field => (
          <div className='web-code-settings-row' key={field} data-settings-field={field}>
            <span>{field}</span>
            <input
              type='number'
              value={snapshot[field]}
              min={8}
              max={32}
              onChange={event => {
                const value = Number(event.currentTarget.value)
                if (Number.isFinite(value)) themeHost.set(field, value)
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
