import { describe, expect, it } from 'vitest'

import {
  buildChangeArgs,
  buildGenMessages,
  cleanGeneratedMessage,
  parseChArgs,
  parsePorcelainZ,
  planChanges,
  runCh
} from '../ch.js'
import { run } from '../index.js'

const MESSAGE_ERR_RE = /опис/

/**
 * Колектор виводу для інжекту у `log`.
 * @returns {{ lines: string[], log: (message: string) => void }} буфер і log-функція
 */
function collector() {
  const lines = []
  return { lines, log: message => lines.push(message) }
}

/**
 * Інжект `io.run`: фіксує передані каноном аргументи + cwd і повертає заданий exit-код.
 * @param {number} [code] exit-код, який має «повернути» канон
 * @returns {{ calls: Array<{ args: string[], cwd?: string }>, run: (args: string[], cwd?: string) => Promise<number> }}
 */
function runnerSpy(code = 0) {
  const calls = []
  return {
    calls,
    run: (args, cwd) => {
      calls.push({ args, cwd })
      return Promise.resolve(code)
    }
  }
}

/**
 * Інжект git-контексту.
 * @param {string[]} changed змінені файли
 * @param {string[]} workspaces воркспейси
 * @param {string} [repoRoot] корінь репо
 * @returns {() => { repoRoot: string, workspaces: string[], changed: string[] }} context-фабрика
 */
function ctx(changed, workspaces, repoRoot = '/repo') {
  return () => ({ repoRoot, workspaces, changed })
}

describe('parseChArgs', () => {
  it('збирає bump/section/message, без ws', () => {
    expect(parseChArgs(['--bump', 'minor', '--section', 'Added', '--message', 'x'])).toEqual({
      bump: 'minor',
      section: 'Added',
      message: 'x'
    })
  })

  it('без --message → message undefined', () => {
    expect(parseChArgs(['--bump', 'patch'])).toEqual({ bump: 'patch', section: undefined, message: undefined })
  })
})

describe('buildChangeArgs', () => {
  it('дефолти + корінь: без bump/section, ws «.» → без --ws', () => {
    expect(buildChangeArgs({}, 'опис', '.')).toEqual([
      'change',
      '--bump',
      'minor',
      '--section',
      'Changed',
      '--message',
      'опис'
    ])
  })

  it('флаги перекривають дефолти, trim-ить опис, додає --ws для не-кореня', () => {
    expect(buildChangeArgs({ bump: 'patch', section: 'Fixed' }, '  фікс  ', 'npm')).toEqual([
      'change',
      '--bump',
      'patch',
      '--section',
      'Fixed',
      '--message',
      'фікс',
      '--ws',
      'npm'
    ])
  })

  it('порожній опис → помилка', () => {
    expect(() => buildChangeArgs({}, '   ', '.')).toThrow(MESSAGE_ERR_RE)
  })
})

describe('parsePorcelainZ', () => {
  it('staged/unstaged/untracked → шляхи', () => {
    const raw = 'M  npm/ch.js\0?? docs/new.md\0 M readme.MD\0'
    expect(parsePorcelainZ(raw)).toEqual(['npm/ch.js', 'docs/new.md', 'readme.MD'])
  })

  it('rename: бере ціль, пропускає джерело', () => {
    const raw = 'R  npm/new.js\0npm/old.js\0'
    expect(parsePorcelainZ(raw)).toEqual(['npm/new.js'])
  })

  it('порожній вивід → []', () => {
    expect(parsePorcelainZ('')).toEqual([])
  })
})

describe('planChanges', () => {
  it('монорепо: файли під воркспейсом → group; кореневі/docs → orphans', () => {
    expect(planChanges(['npm/ch.js', 'docs/x.md', 'package.json'], ['npm'])).toEqual({
      groups: [{ ws: 'npm', files: ['npm/ch.js'] }],
      orphans: ['docs/x.md', 'package.json']
    })
  })

  it('вкладені воркспейси → найдовший виграє', () => {
    expect(planChanges(['packages/a/x.js'], ['packages/a', 'packages'])).toEqual({
      groups: [{ ws: 'packages/a', files: ['packages/a/x.js'] }],
      orphans: []
    })
  })

  it('однопакетне репо (без workspaces) → усе в корінь `.`', () => {
    expect(planChanges(['src/a.js', 'docs/x.md'], [])).toEqual({
      groups: [{ ws: '.', files: ['src/a.js', 'docs/x.md'] }],
      orphans: []
    })
  })

  it('лише кореневі зміни в монорепо → groups порожні, усе в orphans', () => {
    expect(planChanges(['docs/adr/x.md', '.changes/y.md'], ['npm'])).toEqual({
      groups: [],
      orphans: ['docs/adr/x.md', '.changes/y.md']
    })
  })

  it('без змін → порожньо', () => {
    expect(planChanges([], ['npm'])).toEqual({ groups: [], orphans: [] })
  })
})

describe('cleanGeneratedMessage', () => {
  it('бере перший непорожній рядок без fence/лапок/буліту/крапки', () => {
    expect(cleanGeneratedMessage('```\n- "виправив парсинг дати".\n```')).toBe('виправив парсинг дати')
  })

  it('порожній вихід → порожній рядок', () => {
    expect(cleanGeneratedMessage('\n\n```\n```')).toBe('')
  })
})

describe('buildGenMessages', () => {
  it('system згадує воркспейс, user — контекст', () => {
    const msgs = buildGenMessages('npm', 'Diff: ...')
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('npm')
    expect(msgs[1]).toEqual({ role: 'user', content: 'Diff: ...' })
  })
})

describe('runCh — з --message', () => {
  it('порожній --message → 1, канон не викликається', async () => {
    const spy = runnerSpy()
    const code = await runCh(['--message', '   '], { log: collector().log, run: spy.run, context: ctx([], []) })
    expect(code).toBe(1)
    expect(spy.calls).toEqual([])
  })

  it('зміни в одному воркспейсі → один виклик з --ws npm і cwd=repoRoot', async () => {
    const spy = runnerSpy(0)
    const code = await runCh(['--message', 'опис'], {
      log: collector().log,
      run: spy.run,
      context: ctx(['npm/ch.js'], ['npm'])
    })
    expect(code).toBe(0)
    expect(spy.calls).toEqual([
      { args: ['change', '--bump', 'minor', '--section', 'Changed', '--message', 'опис', '--ws', 'npm'], cwd: '/repo' }
    ])
  })

  it('зміни у двох воркспейсах → окремий виклик у кожен (той самий --message)', async () => {
    const spy = runnerSpy(0)
    const code = await runCh(['--message', 'опис'], {
      log: collector().log,
      run: spy.run,
      context: ctx(['npm/ch.js', 'pkg/b/x.js'], ['npm', 'pkg/b'])
    })
    expect(code).toBe(0)
    expect(spy.calls.length).toBe(2)
    expect(spy.calls[0].args.at(-1)).toBe('npm')
    expect(spy.calls[1].args.at(-1)).toBe('pkg/b')
  })

  it('без змін → exit 0, канон не викликається', async () => {
    const io = collector()
    const spy = runnerSpy(0)
    const code = await runCh(['--message', 'опис'], { log: io.log, run: spy.run, context: ctx([], ['npm']) })
    expect(code).toBe(0)
    expect(spy.calls).toEqual([])
    expect(io.lines.join('\n')).toContain('Немає змін у воркспейсах')
  })

  it('лише кореневі/docs зміни в монорепо → пропуск (orphans), канон не викликається', async () => {
    const io = collector()
    const spy = runnerSpy(0)
    const code = await runCh(['--message', 'опис'], {
      log: io.log,
      run: spy.run,
      context: ctx(['docs/adr/x.md', '.changes/y.md'], ['npm'])
    })
    expect(code).toBe(0)
    expect(spy.calls).toEqual([])
    expect(io.lines.join('\n')).toContain('Поза воркспейсами')
    expect(io.lines.join('\n')).toContain('Немає змін у воркспейсах')
  })

  it('однопакетне репо (без workspaces) → пише в корінь `.` без --ws', async () => {
    const spy = runnerSpy(0)
    const code = await runCh(['--message', 'опис'], {
      log: collector().log,
      run: spy.run,
      context: ctx(['src/a.js'], [])
    })
    expect(code).toBe(0)
    expect(spy.calls.length).toBe(1)
    expect(spy.calls[0].args).not.toContain('--ws')
  })
})

describe('runCh — без --message (генерація omlx)', () => {
  it('генерує окремий опис на КОЖЕН воркспейс і передає його каноном', async () => {
    const spy = runnerSpy(0)
    const genCalls = []
    const code = await runCh([], {
      log: collector().log,
      run: spy.run,
      context: ctx(['npm/ch.js', 'pkg/b/x.js'], ['npm', 'pkg/b']),
      generate: (ws, files, repoRoot) => {
        genCalls.push({ ws, files, repoRoot })
        return Promise.resolve(`опис-${ws}`)
      }
    })
    expect(code).toBe(0)
    expect(genCalls).toEqual([
      { ws: 'npm', files: ['npm/ch.js'], repoRoot: '/repo' },
      { ws: 'pkg/b', files: ['pkg/b/x.js'], repoRoot: '/repo' }
    ])
    expect(spy.calls[0].args).toEqual([
      'change',
      '--bump',
      'minor',
      '--section',
      'Changed',
      '--message',
      'опис-npm',
      '--ws',
      'npm'
    ])
    expect(spy.calls[1].args).toEqual([
      'change',
      '--bump',
      'minor',
      '--section',
      'Changed',
      '--message',
      'опис-pkg/b',
      '--ws',
      'pkg/b'
    ])
  })

  it('помилка генерації для воркспейса → пропуск + exit 1, інші пишуться', async () => {
    const io = collector()
    const spy = runnerSpy(0)
    const code = await runCh([], {
      log: io.log,
      run: spy.run,
      context: ctx(['npm/ch.js', 'pkg/b/x.js'], ['npm', 'pkg/b']),
      generate: ws => (ws === 'npm' ? Promise.reject(new Error('omlx down')) : Promise.resolve('ok'))
    })
    expect(code).toBe(1)
    expect(spy.calls.length).toBe(1)
    expect(spy.calls[0].args.at(-1)).toBe('pkg/b')
    expect(io.lines.join('\n')).toContain('omlx')
  })

  it('порожній опис від omlx → пропуск + exit 1', async () => {
    const spy = runnerSpy(0)
    const code = await runCh([], {
      log: collector().log,
      run: spy.run,
      context: ctx(['npm/ch.js'], ['npm']),
      generate: () => Promise.resolve('   ')
    })
    expect(code).toBe(1)
    expect(spy.calls).toEqual([])
  })
})

describe('run → ch', () => {
  it('делегує ch у runCh через спільний io', async () => {
    const spy = runnerSpy(0)
    const code = await run(['ch', '--message', 'фікс'], {
      log: collector().log,
      run: spy.run,
      context: ctx(['npm/ch.js'], ['npm'])
    })
    expect(code).toBe(0)
    expect(spy.calls).toEqual([
      { args: ['change', '--bump', 'minor', '--section', 'Changed', '--message', 'фікс', '--ws', 'npm'], cwd: '/repo' }
    ])
  })
})
