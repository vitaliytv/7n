import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { PULL_ZSH_SCRIPT, pull } from '../pull.js'

afterEach(() => vi.restoreAllMocks())

describe('PULL_ZSH_SCRIPT', () => {
  it('reverse-delta вбудовує спільне ядро з ОБЕРНЕНИМИ ролями (ours=origin, src=знімок)', () => {
    expect(PULL_ZSH_SCRIPT).toContain('_n7merge_delta "origin/$branch" "$backup_ref"')
    // Старий напрямок (origin-дельта на HEAD) більше не використовується.
    expect(PULL_ZSH_SCRIPT).not.toContain('_n7merge_delta "HEAD" "origin/$branch"')
  })

  it('оновлює remote через git fetch перед мерджем', () => {
    expect(PULL_ZSH_SCRIPT).toContain('git fetch origin "$branch"')
  })

  it('коротить, коли HEAD уже збігається з origin/<branch>', () => {
    expect(PULL_ZSH_SCRIPT).toContain('[[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch")" ]]')
    expect(PULL_ZSH_SCRIPT).toContain('Вже актуально')
  })

  it('пробує справжній fast-forward лише коли HEAD — предок origin/<branch>', () => {
    expect(PULL_ZSH_SCRIPT).toContain('git merge-base --is-ancestor HEAD "origin/$branch"')
    expect(PULL_ZSH_SCRIPT).toContain('git merge --ff-only "origin/$branch"')
  })

  it('FF іде ПЕРЕД reverse-delta (фолбек тільки коли FF неможливий)', () => {
    expect(PULL_ZSH_SCRIPT.indexOf('git merge --ff-only "origin/$branch"')).toBeLessThan(
      PULL_ZSH_SCRIPT.indexOf('_n7merge_delta "origin/$branch" "$backup_ref"')
    )
  })

  it('reverse-delta переводить HEAD на origin після знімка локального стану', () => {
    // Знімок (stash create) має передувати reset --hard, інакше локальні зміни втрачаються.
    expect(PULL_ZSH_SCRIPT).toContain('git stash create "n7pull: backup before reverse-delta')
    expect(PULL_ZSH_SCRIPT).toContain('git reset --hard "origin/$branch"')
    expect(PULL_ZSH_SCRIPT.indexOf('git stash create')).toBeLessThan(
      PULL_ZSH_SCRIPT.indexOf('git reset --hard "origin/$branch"')
    )
  })

  it('reset --hard страхується trap-відкатом до локального стану на перерив', () => {
    expect(PULL_ZSH_SCRIPT).toContain('trap ')
    expect(PULL_ZSH_SCRIPT).toContain('git reset --hard "$old_head"')
    expect(PULL_ZSH_SCRIPT).toContain('INT TERM')
  })
})

describe('pull', () => {
  it('передає назву гілки у zsh як $1 і повертає exit code', async () => {
    const emitter = new EventEmitter()
    const spawnFn = vi.fn(() => {
      setImmediate(() => emitter.emit('exit', 0))
      return emitter
    })
    const code = await pull('feature-x', spawnFn)
    expect(code).toBe(0)
    expect(spawnFn).toHaveBeenCalledWith('zsh', ['-c', PULL_ZSH_SCRIPT, 'npx @7n/n', 'feature-x'], { stdio: 'inherit' })
  })

  it('без гілки передає порожній рядок (zsh визначить поточну)', async () => {
    const emitter = new EventEmitter()
    const spawnFn = vi.fn(() => {
      setImmediate(() => emitter.emit('exit', 2))
      return emitter
    })
    const code = await pull(undefined, spawnFn)
    expect(code).toBe(2)
    expect(spawnFn.mock.calls[0][1].at(-1)).toBe('')
  })
})
