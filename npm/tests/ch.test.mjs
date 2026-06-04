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
  it('формат <now>-<rand>.md', () => {
    expect(changeFileName(1000, 'deadbe')).toBe('1000-deadbe.md')
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
    const writes = []
    const io = collector()
    const code = await runCh(['--bump', 'minor', '--section', 'Added', '--message', 'опис', '--ws', 'npm'], {
      log: io.log,
      now: () => 1000,
      rand: () => 'deadbe',
      cwd: '/repo',
      writeFile: (path, content) => {
        writes.push({ path, content })
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes).toEqual([
      {
        path: '/repo/npm/.changes/1000-deadbe.md',
        content: `---\nbump: minor\nsection: Added\ncreated: ${formatCreated(1000)}\n---\nопис\n`
      }
    ])
    expect(io.lines).toEqual(['✅ npm/.changes/1000-deadbe.md'])
  })

  it("інтерактив через ін'єкцію prompt пише файл", async () => {
    const writes = []
    const code = await runCh([], {
      log: collector().log,
      prompt: scriptedPrompt(['1', '2', 'інтерактивний опис']),
      now: () => 42,
      rand: () => 'beef00',
      cwd: '/r',
      writeFile: (path, content) => {
        writes.push({ path, content })
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes[0].path).toBe('/r/.changes/42-beef00.md')
    expect(writes[0].content).toBe(`---\nbump: patch\nsection: Changed\ncreated: ${formatCreated(42)}\n---\nінтерактивний опис\n`)
  })
})

describe('run → ch', () => {
  it('делегує ch у runCh через спільний io', async () => {
    const writes = []
    const code = await run(['ch', '--bump', 'patch', '--section', 'Fixed', '--message', 'фікс'], {
      log: collector().log,
      now: () => 7,
      rand: () => 'aa',
      cwd: '/x',
      writeFile: (path, content) => {
        writes.push({ path, content })
        return Promise.resolve()
      }
    })
    expect(code).toBe(0)
    expect(writes[0].path).toBe('/x/.changes/7-aa.md')
  })
})
