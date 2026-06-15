import { describe, expect, it } from 'vitest'

import {
  affectedWorkspaces,
  buildChangeArgs,
  buildGenMessages,
  cleanGeneratedMessage,
  groupByWorkspace,
  parseChArgs,
  parsePorcelainZ,
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

describe('groupByWorkspace / affectedWorkspaces', () => {
  it('групує файли за найдовшим префіксом, решта → корінь', () => {
    expect(groupByWorkspace(['npm/ch.js', 'docs/x.md', 'package.json'], ['npm'])).toEqual([
      { ws: '.', files: ['docs/x.md', 'package.json'] },
      { ws: 'npm', files: ['npm/ch.js'] }
    ])
  })

  it('вкладені воркспейси → найдовший виграє', () => {
    expect(groupByWorkspace(['packages/a/x.js'], ['packages/a', 'packages'])).toEqual([
      { ws: 'packages/a', files: ['packages/a/x.js'] }
    ])
  })

  it('affectedWorkspaces — лише назви', () => {
    expect(affectedWorkspaces(['npm/a.js', 'docs/x.md'], ['npm'])).toEqual(['.', 'npm'])
  })

  it('без змін → []', () => {
    expect(groupByWorkspace([], ['npm'])).toEqual([])
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
      context: ctx(['npm/ch.js', 'docs/x.md'], ['npm'])
    })
    expect(code).toBe(0)
    expect(spy.calls.length).toBe(2)
    expect(spy.calls[0].args).not.toContain('--ws')
    expect(spy.calls[1].args.at(-1)).toBe('npm')
  })

  it('без змін → fallback у корінь, нотатка', async () => {
    const io = collector()
    const spy = runnerSpy(0)
    const code = await runCh(['--message', 'опис'], { log: io.log, run: spy.run, context: ctx([], ['npm']) })
    expect(code).toBe(0)
    expect(spy.calls.length).toBe(1)
    expect(spy.calls[0].args).not.toContain('--ws')
    expect(io.lines.join('\n')).toContain('Змінених файлів не знайдено')
  })
})

describe('runCh — без --message (генерація omlx)', () => {
  it('генерує окремий опис на КОЖЕН воркспейс і передає його каноном', async () => {
    const spy = runnerSpy(0)
    const genCalls = []
    const code = await runCh([], {
      log: collector().log,
      run: spy.run,
      context: ctx(['npm/ch.js', 'docs/x.md'], ['npm']),
      generate: (ws, files, repoRoot) => {
        genCalls.push({ ws, files, repoRoot })
        return Promise.resolve(`опис-${ws}`)
      }
    })
    expect(code).toBe(0)
    expect(genCalls).toEqual([
      { ws: '.', files: ['docs/x.md'], repoRoot: '/repo' },
      { ws: 'npm', files: ['npm/ch.js'], repoRoot: '/repo' }
    ])
    expect(spy.calls[0].args).toEqual(['change', '--bump', 'minor', '--section', 'Changed', '--message', 'опис-.'])
    expect(spy.calls[1].args).toEqual([
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
  })

  it('помилка генерації для воркспейса → пропуск + exit 1, інші пишуться', async () => {
    const io = collector()
    const spy = runnerSpy(0)
    const code = await runCh([], {
      log: io.log,
      run: spy.run,
      context: ctx(['npm/ch.js', 'docs/x.md'], ['npm']),
      generate: ws => (ws === '.' ? Promise.reject(new Error('omlx down')) : Promise.resolve('ok'))
    })
    expect(code).toBe(1)
    expect(spy.calls.length).toBe(1)
    expect(spy.calls[0].args.at(-1)).toBe('npm')
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
