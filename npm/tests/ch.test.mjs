import { describe, expect, it } from 'vitest'

import { changeFileName, collectChange, formatCreated, parseChArgs, runCh, serializeChange } from '../ch.js'
import { run } from '../index.js'

const BUMP_ERR_RE = /bump/

/**
 * Скриптований prompt: повертає відповіді по черзі, далі — порожній рядок.
 * @param {string[]} answers черга відповідей
 * @returns {() => Promise<string>} prompt-функція
 */
function scriptedPrompt(answers) {
  const queue = [...answers]
  return () => Promise.resolve(queue.shift() ?? '')
}

/**
 * Колектор виводу для інжекту у `log`.
 * @returns {{ lines: string[], log: (message: string) => void }} буфер і log-функція
 */
function collector() {
  const lines = []
  return { lines, log: message => lines.push(message) }
}

describe('serializeChange', () => {
  it('пише frontmatter bump+section+created і trimmed-опис', () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    expect(serializeChange({ bump: 'minor', section: 'Added', message: '  опис  ' }, now)).toBe(
      '---\nbump: minor\nsection: Added\ncreated: 03.06 14:30\n---\nопис\n'
    )
  })
})

describe('formatCreated', () => {
  it('формат день.місяць година:хвилини з дозаповненням нулями', () => {
    expect(formatCreated(new Date(2026, 0, 5, 9, 7).getTime())).toBe('05.01 09:07')
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

describe('collectChange', () => {
  it('повний інтерактив: номери меню + опис', async () => {
    const prompt = scriptedPrompt(['2', '1', 'мій опис'])
    const entry = await collectChange({ ws: '.' }, { prompt, log: collector().log })
    expect(entry).toEqual({ bump: 'minor', section: 'Added', message: 'мій опис', ws: '.' })
  })

  it('частковий: задані bump/section з флагів, питається лише опис', async () => {
    const prompt = scriptedPrompt(['опис'])
    const entry = await collectChange({ bump: 'patch', section: 'Fixed', ws: 'npm' }, { prompt, log: collector().log })
    expect(entry).toEqual({ bump: 'patch', section: 'Fixed', message: 'опис', ws: 'npm' })
  })

  it('невалідний bump із флага → помилка', async () => {
    await expect(
      collectChange({ bump: 'huge', ws: '.' }, { prompt: scriptedPrompt([]), log: collector().log })
    ).rejects.toThrow(BUMP_ERR_RE)
  })

  it('повторний запит при невалідному виборі, потім назва', async () => {
    const io = collector()
    const prompt = scriptedPrompt(['9', 'major', '1', 'x'])
    const entry = await collectChange({ ws: '.' }, { prompt, log: io.log })
    expect(entry.bump).toBe('major')
    expect(io.lines.join('\n')).toContain('Невалідний вибір')
  })

  it('повторний запит при порожньому описі', async () => {
    const prompt = scriptedPrompt(['', 'нарешті'])
    const entry = await collectChange({ bump: 'patch', section: 'Added', ws: '.' }, { prompt, log: collector().log })
    expect(entry.message).toBe('нарешті')
  })
})

describe('runCh', () => {
  it('без TTY і без повного набору флагів → 1 + usage', async () => {
    const io = collector()
    const code = await runCh(['--bump', 'minor'], { log: io.log, isTTY: false })
    expect(code).toBe(1)
    expect(io.lines.join('\n')).toContain('stdin не інтерактивний')
  })

  it('повний набір флагів → пише файл у <ws>/.changes і повертає 0', async () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    const writes = []
    const io = collector()
    const code = await runCh(['--bump', 'minor', '--section', 'Added', '--message', 'опис', '--ws', 'npm'], {
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
        content: `---\nbump: minor\nsection: Added\ncreated: ${formatCreated(now)}\n---\nопис\n`
      }
    ])
    expect(io.lines).toEqual(['✅ npm/.changes/260603-1430.md'])
  })

  it('колізія за ту саму хвилину → числовий суфікс через create-only', async () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    const existing = new Set(['/repo/.changes/260603-1430.md', '/repo/.changes/260603-1430-2.md'])
    const writes = []
    const io = collector()
    const code = await runCh(['--bump', 'patch', '--section', 'Fixed', '--message', 'фікс'], {
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

  it("інтерактив через ін'єкцію prompt пише файл", async () => {
    const now = new Date(2026, 0, 5, 9, 7).getTime()
    const writes = []
    const code = await runCh([], {
      log: collector().log,
      prompt: scriptedPrompt(['1', '2', 'інтерактивний опис']),
      now: () => now,
      cwd: '/r',
      writeFile: (path, content) => {
        writes.push({ path, content })
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes[0].path).toBe('/r/.changes/260105-0907.md')
    expect(writes[0].content).toBe(
      `---\nbump: patch\nsection: Changed\ncreated: ${formatCreated(now)}\n---\nінтерактивний опис\n`
    )
  })
})

describe('run → ch', () => {
  it('делегує ch у runCh через спільний io', async () => {
    const now = new Date(2026, 5, 3, 14, 30).getTime()
    const writes = []
    const code = await run(['ch', '--bump', 'patch', '--section', 'Fixed', '--message', 'фікс'], {
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
