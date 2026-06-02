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
  it('greet друкує привітання і повертає 0', () => {
    const io = collector()
    expect(run(['greet', 'Vitalii'], io)).toBe(0)
    expect(io.lines).toEqual(['Привіт, Vitalii!'])
  })

  it('--version друкує версію і повертає 0', () => {
    const io = collector()
    expect(run(['--version'], io)).toBe(0)
    expect(io.lines[0]).toBe(version())
  })

  it('без аргументів показує довідку і повертає 0', () => {
    const io = collector()
    expect(run([], io)).toBe(0)
    expect(io.lines[0]).toContain('Використання:')
  })

  it('невідома команда повертає 1', () => {
    const io = collector()
    expect(run(['boom'], io)).toBe(1)
    expect(io.lines[0]).toContain('Невідома команда: boom')
  })
})
