import { describe, expect, it } from 'vitest'

import { changeFileName, parseChArgs, resolveChange, runCh, serializeChange } from '../ch.js'
import { run } from '../index.js'

const BUMP_ERR_RE = /bump/
const SECTION_ERR_RE = /section/
const MESSAGE_ERR_RE = /опис/

/**
 * Колектор виводу для інжекту у `log`.
 * @returns {{ lines: string[], log: (message: string) => void }} буфер і log-функція
 */
function collector() {
  const lines = []
  return { lines, log: message => lines.push(message) }
}

describe('serializeChange', () => {
  it('пише frontmatter рівно bump+section і trimmed-опис', () => {
    expect(serializeChange({ bump: 'minor', section: 'Added', message: '  опис  ' })).toBe(
      '---\nbump: minor\nsection: Added\n---\nопис\n'
    )
  })
})

describe('changeFileName', () => {
  const now = new Date(2026, 5, 3, 14, 30).getTime()

  it('формат YYMMDD-HHMM.md без суфікса для першої послідовності', () => {
    expect(changeFileName(now)).toBe('260603-1430.md')
    expect(changeFileName(now, 1)).toBe('260603-1430.md')
  })

  it('числовий суфікс при колізії', () => {
    expect(changeFileName(now, 2)).toBe('260603-1430-2.md')
    expect(changeFileName(now, 3)).toBe('260603-1430-3.md')
  })
})

describe('parseChArgs', () => {
  it('збирає всі флаги, ws за замовчуванням «.»', () => {
    expect(parseChArgs(['--bump', 'minor', '--section', 'Added', '--message', 'x'])).toEqual({
      bump: 'minor',
      section: 'Added',
      message: 'x',
      ws: '.'
    })
  })

  it('--ws перекриває дефолт', () => {
    expect(parseChArgs(['--ws', 'npm']).ws).toBe('npm')
  })
})

describe('resolveChange', () => {
  it('дефолти: без bump/section → minor/Changed', () => {
    expect(resolveChange({ message: 'опис', ws: '.' })).toEqual({
      bump: 'minor',
      section: 'Changed',
      message: 'опис',
      ws: '.'
    })
  })

  it('флаги перекривають дефолти й trim-ить опис', () => {
    expect(resolveChange({ bump: 'patch', section: 'Fixed', message: '  фікс  ', ws: 'npm' })).toEqual({
      bump: 'patch',
      section: 'Fixed',
      message: 'фікс',
      ws: 'npm'
    })
  })

  it('невалідний bump → помилка', () => {
    expect(() => resolveChange({ bump: 'huge', message: 'x', ws: '.' })).toThrow(BUMP_ERR_RE)
  })

  it('невалідний section → помилка', () => {
    expect(() => resolveChange({ section: 'Nope', message: 'x', ws: '.' })).toThrow(SECTION_ERR_RE)
  })

  it('порожній опис → помилка', () => {
    expect(() => resolveChange({ message: '   ', ws: '.' })).toThrow(MESSAGE_ERR_RE)
  })
})

describe('runCh', () => {
  it('без --message → 1 + usage', async () => {
    const io = collector()
    const code = await runCh(['--bump', 'minor'], { log: io.log })
    expect(code).toBe(1)
    expect(io.lines.join('\n')).toContain('Бракує --message')
  })

  it('лише --message → дефолти minor/Changed, пише файл і повертає 0', async () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    const writes = []
    const io = collector()
    const code = await runCh(['--message', 'опис'], {
      log: io.log,
      now: () => now,
      cwd: '/repo',
      writeFile: (path, content) => {
        writes.push({ path, content })
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes).toEqual([
      {
        path: '/repo/.changes/260603-1430.md',
        content: '---\nbump: minor\nsection: Changed\n---\nопис\n'
      }
    ])
    expect(io.lines).toEqual(['✅ .changes/260603-1430.md'])
  })

  it('повний набір флагів → пише файл у <ws>/.changes і повертає 0', async () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    const writes = []
    const io = collector()
    const code = await runCh(['--bump', 'patch', '--section', 'Added', '--message', 'опис', '--ws', 'npm'], {
      log: io.log,
      now: () => now,
      cwd: '/repo',
      writeFile: (path, content) => {
        writes.push({ path, content })
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes).toEqual([
      {
        path: '/repo/npm/.changes/260603-1430.md',
        content: '---\nbump: patch\nsection: Added\n---\nопис\n'
      }
    ])
    expect(io.lines).toEqual(['✅ npm/.changes/260603-1430.md'])
  })

  it('колізія за ту саму хвилину → числовий суфікс через create-only', async () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    const existing = new Set(['/repo/.changes/260603-1430.md', '/repo/.changes/260603-1430-2.md'])
    const writes = []
    const io = collector()
    const code = await runCh(['--message', 'фікс'], {
      log: io.log,
      now: () => now,
      cwd: '/repo',
      writeFile: path => {
        if (existing.has(path)) {
          const error = new Error('EEXIST')
          error.code = 'EEXIST'
          return Promise.reject(error)
        }
        writes.push(path)
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes).toEqual(['/repo/.changes/260603-1430-3.md'])
    expect(io.lines).toEqual(['✅ .changes/260603-1430-3.md'])
  })
})

describe('run → ch', () => {
  it('делегує ch у runCh через спільний io', async () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    const writes = []
    const code = await run(['ch', '--message', 'фікс'], {
      log: collector().log,
      now: () => now,
      cwd: '/x',
      writeFile: (path, content) => {
        writes.push({ path, content })
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes[0].path).toBe('/x/.changes/260603-1430.md')
  })
})
