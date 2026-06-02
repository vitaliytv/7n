import { describe, expect, it } from 'vitest'

import { greet, run, version } from '../index.js'

const SEMVER = /^\d+\.\d+\.\d+/

/**
 * Збирач рядків виводу для інжекту у `run`.
 * @returns {{ lines: string[], log: (message: string) => void }} колектор із буфером і log-функцією
 */
function collector() {
  const lines = []
  return { lines, log: message => lines.push(message) }
}

describe('greet', () => {
  it('вітає типове ім\'я', () => {
    expect(greet()).toBe('Привіт, світ!')
  })

  it('вітає передане ім\'я', () => {
    expect(greet('7n')).toBe('Привіт, 7n!')
  })
})

describe('version', () => {
  it('повертає semver-рядок із package.json', () => {
    expect(version()).toMatch(SEMVER)
  })
})

describe('run', () => {
  it('greet друкує привітання і повертає 0', async () => {
    const io = collector()
    expect(await run(['greet', 'Vitalii'], io)).toBe(0)
    expect(io.lines).toEqual(['Привіт, Vitalii!'])
  })

  it('--version друкує версію і повертає 0', async () => {
    const io = collector()
    expect(await run(['--version'], io)).toBe(0)
    expect(io.lines[0]).toBe(version())
  })

  it('без аргументів показує довідку і повертає 0', async () => {
    const io = collector()
    expect(await run([], io)).toBe(0)
    expect(io.lines[0]).toContain('Використання:')
  })

  it('getw делегує у переданий runner і повертає його exit code', async () => {
    let called = false
    const code = await run(['getw'], {
      getw: () => {
        called = true
        return Promise.resolve(0)
      }
    })
    expect(called).toBe(true)
    expect(code).toBe(0)
  })

  it('невідома команда повертає 1', async () => {
    const io = collector()
    expect(await run(['boom'], io)).toBe(1)
    expect(io.lines[0]).toContain('Невідома команда: boom')
  })
})
