import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { PUSH_ZSH_SCRIPT, push } from '../push.js'

afterEach(() => vi.restoreAllMocks())

describe('PUSH_ZSH_SCRIPT', () => {
  it('вбудовує спільне ядро мерджу для автопідтягування дивергенції', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('_n7merge_delta "HEAD" "origin/$branch"')
    expect(PUSH_ZSH_SCRIPT).toContain('git merge-base --is-ancestor "origin/$branch" HEAD')
  })

  it('сквошить через reset --soft на базу, зібравши всі зміни (git add -A)', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('git add -A')
    expect(PUSH_ZSH_SCRIPT).toContain('git reset --soft "$base"')
  })

  it('коротить вихід коли немає змін відносно бази', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('git diff --cached --quiet "$base" --')
  })

  it('генерує меседж агентом і комітить без hooks', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('_n7push_gen_message')
    expect(PUSH_ZSH_SCRIPT).toContain('git commit --no-verify -F "$msg"')
  })

  it('друкує subject і список файлів у stdout (без інтерактивного підтвердження)', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('📝 Commit: $subject')
    expect(PUSH_ZSH_SCRIPT).toContain('git diff --cached --name-status')
    expect(PUSH_ZSH_SCRIPT).not.toContain('[y/N]')
  })

  it('модель агента — нейтральний N7COMMIT_* із фолбеком на N7MERGE_*/GETW_*', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('${N7COMMIT_MODEL:-${N7MERGE_MODEL:-${GETW_MERGE_MODEL:-sonnet}}}')
    expect(PUSH_ZSH_SCRIPT).toContain(
      '${N7COMMIT_CURSOR_MODEL:-${N7MERGE_CURSOR_MODEL:-${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}}}'
    )
  })

  it('наявну origin-гілку пушить fast-forward, нову — з -u', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('git push origin "$branch"')
    expect(PUSH_ZSH_SCRIPT).toContain('git push -u origin "$branch"')
  })
})

describe('push', () => {
  it('передає назву гілки у zsh як $1 і повертає exit code', async () => {
    const emitter = new EventEmitter()
    const spawnFn = vi.fn(() => {
      setImmediate(() => emitter.emit('exit', 0))
      return emitter
    })
    const code = await push('feature-x', spawnFn)
    expect(code).toBe(0)
    expect(spawnFn).toHaveBeenCalledWith('zsh', ['-c', PUSH_ZSH_SCRIPT, 'npx @7n/n', 'feature-x'], { stdio: 'inherit' })
  })

  it('без гілки передає порожній рядок (zsh визначить поточну)', async () => {
    const emitter = new EventEmitter()
    const spawnFn = vi.fn(() => {
      setImmediate(() => emitter.emit('exit', 3))
      return emitter
    })
    const code = await push(undefined, spawnFn)
    expect(code).toBe(3)
    expect(spawnFn.mock.calls[0][1].at(-1)).toBe('')
  })
})
