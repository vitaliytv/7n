import { describe, expect, it } from 'vitest'

import {
  clampBytes,
  DEFAULT_LIMITS,
  excludePathspecs,
  NOISE_GLOBS,
  renderZshNoiseArray,
  truncateContext
} from '../diff-context.js'

describe('NOISE_GLOBS / excludePathspecs', () => {
  it('містить шумні шляхи, що вже кусали push (.n-cursor, *.jsonl) і класичні (docs/.changes/lock)', () => {
    for (const g of ['.n-cursor/**', '**/.n-cursor/**', '**/*.jsonl', 'docs/**', '**/.changes/**', '*.lock', '**/*.d.ts']) {
      expect(NOISE_GLOBS).toContain(g)
    }
  })

  it('обгортає кожен glob у git-pathspec :(exclude)', () => {
    expect(excludePathspecs(['docs/**', '**/*.jsonl'])).toEqual([':(exclude)docs/**', ':(exclude)**/*.jsonl'])
    // дефолт — увесь NOISE_GLOBS
    expect(excludePathspecs()).toHaveLength(NOISE_GLOBS.length)
    expect(excludePathspecs()).toContain(':(exclude).n-cursor/**')
  })
})

describe('renderZshNoiseArray', () => {
  it('рендерить по одному pathspec у рядку з відступом — придатне для zsh-масиву', () => {
    const out = renderZshNoiseArray('  ')
    const rows = out.split('\n')
    expect(rows).toHaveLength(NOISE_GLOBS.length)
    expect(rows[0]).toBe("  ':(exclude)docs/**'")
    expect(out).toContain("  ':(exclude)**/*.jsonl'")
  })
})

describe('clampBytes', () => {
  it('лишає текст недоторканим, якщо він у межах', () => {
    expect(clampBytes('abc', 10)).toBe('abc')
  })

  it('ріже до байтової стелі', () => {
    expect(clampBytes('abcdef', 3)).toBe('abc')
  })

  it('не лишає обрубаного multibyte-символа в кінці', () => {
    // «їжак»: кожна кирилична літера — 2 байти; стеля 3 байти ріже посеред 2-го символа.
    const out = clampBytes('їжак', 3)
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(3)
    expect(out).not.toContain('�')
    expect(out).toBe('ї')
  })
})

describe('truncateContext', () => {
  it('повертає вхід без позначок, якщо все в межах', () => {
    const text = 'рядок1\nрядок2'
    expect(truncateContext(text)).toBe(text)
  })

  it('ріже за кількістю рядків і додає позначку', () => {
    const text = Array.from({ length: 10 }, (_, i) => `r${i}`).join('\n')
    const out = truncateContext(text, { maxLines: 3 })
    expect(out.split('\n').slice(0, 3)).toEqual(['r0', 'r1', 'r2'])
    expect(out).toContain('обрізано: 7 рядків понад ліміт 3')
  })

  it('ріже кожен рядок за довжиною — один мегарядок не проходить цілим', () => {
    const out = truncateContext(`${'x'.repeat(5000)}\nok`, { maxLineLen: 10 })
    expect(out.split('\n')[0]).toBe('x'.repeat(10))
  })

  it('тверда байтова стеля обрізає навіть багато коротких рядків', () => {
    const text = Array.from({ length: 1000 }, () => 'abcd').join('\n')
    const out = truncateContext(text, { maxBytes: 100 })
    expect(Buffer.byteLength(out.split('\n… ')[0], 'utf8')).toBeLessThanOrEqual(100)
    expect(out).toContain('обрізано за байтами до ~100')
  })

  it('дефолтні ліміти беруться з DEFAULT_LIMITS', () => {
    expect(DEFAULT_LIMITS).toMatchObject({ maxLines: 1500, maxLineLen: 500, maxBytes: 262144, maxFileBytes: 16384 })
  })
})
