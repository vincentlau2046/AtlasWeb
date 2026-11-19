// T6-A Task 5: 边局部化腿（util-code-language / util-workspace-path verbatim 副本行为锁）。
import { describe, expect, test } from 'bun:test'

describe('localized edge: util-code-language', () => {
  test('languageForPath canonical mapping', async () => {
    const { languageForPath } = await import('../src/vendor/code-language.ts')
    expect(languageForPath('a/b/main.ts')).toBe('typescript')
    expect(languageForPath('x/app.ps1')).toBe('powershell')
    expect(languageForPath('notes.MD')).toBe('markdown')
    expect(languageForPath('.env')).toBe('dotenv')
    expect(languageForPath('.gitignore')).toBeUndefined()
    expect(languageForPath('C:\\dir\\main.PS1')).toBe('powershell')
    expect(languageForPath('no-extension')).toBeUndefined()
  })

  test('CODE_HIGHLIGHT_EXTENSIONS table coverage and exclusions', async () => {
    const { CODE_HIGHLIGHT_EXTENSIONS } = await import('../src/vendor/code-language.ts')
    const exts = CODE_HIGHLIGHT_EXTENSIONS as readonly string[]
    for (const present of ['ts', 'tsx', 'js', 'sh', 'json', 'py', 'go', 'rs', 'md', 'css', 'diff']) {
      expect(exts).toContain(present)
    }
    for (const absent of ['pem', 'crt', 'key', 'lock']) {
      expect(exts).not.toContain(absent)
    }
  })
})

describe('localized edge: util-workspace-path', () => {
  test('pathPartsOf splits POSIX and Windows spellings', async () => {
    const { pathPartsOf } = await import('../src/vendor/workspace-path.ts')
    expect(pathPartsOf('/home/vince/notes.txt')).toEqual({ directory: '/home/vince/', name: 'notes.txt' })
    expect(pathPartsOf('C:\\a\\b\\')).toEqual({ directory: 'C:\\a\\', name: 'b' })
    expect(pathPartsOf('plainname')).toEqual({ directory: '', name: 'plainname' })
    expect(pathPartsOf('/')).toEqual({ directory: '', name: '/' })
  })
})

describe('localized edge: util-file-drag (type-only surface)', () => {
  test('file-drag-actions module graph resolves', async () => {
    const mod = await import('../src/file-drag-actions.ts')
    expect(mod != null).toBe(true)
  })
})
