import { describe, expect, it } from 'vitest'

import { buildChangeArgs, parseChArgs, runCh } from '../ch.js'
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
 * Інжект `io.run`: фіксує передані каноном аргументи й повертає заданий exit-код.
 * @param {number} [code] exit-код, який має «повернути» канон
 * @returns {{ calls: string[][], run: (args: string[]) => Promise<number> }} лічильник викликів + runner
 */
function runnerSpy(code = 0) {
  const calls = []
  return {
    calls,
    run: args => {
      calls.push(args)
      return Promise.resolve(code)
    }
  }
}

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

describe('buildChangeArgs', () => {
  it('дефолти: без bump/section → change --bump minor --section Changed', () => {
    expect(buildChangeArgs({ message: 'опис', ws: '.' })).toEqual([
      'change',
      '--bump',
      'minor',
      '--section',
      'Changed',
      '--message',
      'опис'
    ])
  })

  it('флаги перекривають дефолти, trim-ить опис, додає --ws крім «.»', () => {
    expect(buildChangeArgs({ bump: 'patch', section: 'Fixed', message: '  фікс  ', ws: 'npm' })).toEqual([
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

  it('ws «.» не додає --ws', () => {
    expect(buildChangeArgs({ message: 'x', ws: '.' })).not.toContain('--ws')
  })

  it('порожній опис → помилка', () => {
    expect(() => buildChangeArgs({ message: '   ', ws: '.' })).toThrow(MESSAGE_ERR_RE)
  })
})

describe('runCh', () => {
  it('без --message → 1 + usage, канон не викликається', async () => {
    const io = collector()
    const spy = runnerSpy()
    const code = await runCh(['--bump', 'minor'], { log: io.log, run: spy.run })
    expect(code).toBe(1)
    expect(io.lines.join('\n')).toContain('Бракує --message')
    expect(spy.calls).toEqual([])
  })

  it('лише --message → делегує канону з дефолтами minor/Changed', async () => {
    const spy = runnerSpy(0)
    const code = await runCh(['--message', 'опис'], { log: collector().log, run: spy.run })
    expect(code).toBe(0)
    expect(spy.calls).toEqual([['change', '--bump', 'minor', '--section', 'Changed', '--message', 'опис']])
  })

  it('повний набір флагів → делегує як є', async () => {
    const spy = runnerSpy(0)
    const code = await runCh(['--bump', 'patch', '--section', 'Added', '--message', 'опис', '--ws', 'npm'], {
      log: collector().log,
      run: spy.run
    })
    expect(code).toBe(0)
    expect(spy.calls).toEqual([
      ['change', '--bump', 'patch', '--section', 'Added', '--message', 'опис', '--ws', 'npm']
    ])
  })

  it('пробрасує exit-код канону', async () => {
    const spy = runnerSpy(1)
    const code = await runCh(['--message', 'опис'], { log: collector().log, run: spy.run })
    expect(code).toBe(1)
  })
})

describe('run → ch', () => {
  it('делегує ch у runCh через спільний io', async () => {
    const spy = runnerSpy(0)
    const code = await run(['ch', '--message', 'фікс'], { log: collector().log, run: spy.run })
    expect(code).toBe(0)
    expect(spy.calls).toEqual([['change', '--bump', 'minor', '--section', 'Changed', '--message', 'фікс']])
  })
})
