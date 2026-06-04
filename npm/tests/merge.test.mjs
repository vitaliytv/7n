import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MERGE_ZSH_LIB, runZsh } from '../merge.js'

afterEach(() => vi.restoreAllMocks())

describe('MERGE_ZSH_LIB', () => {
  it('визначає спільне ядро мерджу й усі tier-хелпери', () => {
    expect(MERGE_ZSH_LIB).toContain('_n7merge_delta()')
    expect(MERGE_ZSH_LIB).toContain('_n7merge_resolve_with_agent()')
    expect(MERGE_ZSH_LIB).toContain('_n7merge_ensure_mergiraf()')
    expect(MERGE_ZSH_LIB).toContain('_n7merge_bun_lock_differs()')
    expect(MERGE_ZSH_LIB).toContain('_n7merge_block_ours()')
    expect(MERGE_ZSH_LIB).toContain('_n7merge_block_theirs()')
  })

  it('друкує лаконічний підсумок по тірах замість пофайлового шуму', () => {
    expect(MERGE_ZSH_LIB).toContain('Tier 1 (git):')
    expect(MERGE_ZSH_LIB).toContain('Tier 2 (mergiraf):')
    expect(MERGE_ZSH_LIB).toContain('Tier 3 (LLM):')
    // git "error: patch failed" — це не помилка, а сигнал перейти на 3-way: stderr глушимо.
    expect(MERGE_ZSH_LIB).toContain('git apply --whitespace=nowarn "$patch_file" 2> /dev/null')
    // Пофайлового "🧩 mergiraf розв'язав: …" більше немає — лише лічильник tier2.
    expect(MERGE_ZSH_LIB).not.toContain("mergiraf розв'язав")
  })

  it('Tier 3 показує блоки приймача/джерела, результат і коментар LLM', () => {
    expect(MERGE_ZSH_LIB).toContain('Приймач (поточна')
    expect(MERGE_ZSH_LIB).toContain('Джерело (')
    expect(MERGE_ZSH_LIB).toContain('Результат:')
    expect(MERGE_ZSH_LIB).toContain('Коментар LLM')
    // Підсумок агента йде у файл (4-й арг), а не одразу в stdout, щоб лягти у розділ Tier 3.
    expect(MERGE_ZSH_LIB).toContain('_n7merge_resolve_with_agent "$conflict_files" "$ours" "$src" "$agent_summary"')
  })

  it('env-кнопки нейтральні (N7MERGE_*) із backward-фолбеком на GETW_*', () => {
    expect(MERGE_ZSH_LIB).toContain('${N7MERGE_PI_MODEL:-}')
    expect(MERGE_ZSH_LIB).toContain('${N7MERGE_MODEL:-${GETW_MERGE_MODEL:-sonnet}}')
    expect(MERGE_ZSH_LIB).toContain('${N7MERGE_CURSOR_MODEL:-${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}}')
    expect(MERGE_ZSH_LIB).toContain('${N7MERGE_NO_MERGIRAF:-${GETW_NO_MERGIRAF:-0}}')
  })

  it('робить pre-flight знімок незакомічених змін через git stash create (бекап-відкат)', () => {
    expect(MERGE_ZSH_LIB).toContain('git stash create')
    expect(MERGE_ZSH_LIB).toContain('git stash store')
    expect(MERGE_ZSH_LIB).toContain('git stash apply')
  })

  it('промпт Tier-3-агента просить per-file підсумок у stdout', () => {
    expect(MERGE_ZSH_LIB).toContain('надрукуй')
    expect(MERGE_ZSH_LIB).toMatch(/підсумок по КОЖНОМУ файлу/)
  })

  it('пробує агентів у порядку pi → claude → cursor-agent', () => {
    expect(MERGE_ZSH_LIB.indexOf('command -v pi')).toBeLessThan(MERGE_ZSH_LIB.indexOf('command -v claude'))
    expect(MERGE_ZSH_LIB.indexOf('command -v claude')).toBeLessThan(MERGE_ZSH_LIB.indexOf('command -v cursor-agent'))
    expect(MERGE_ZSH_LIB).toContain('--tools read,edit,write')
  })

  it('показує exit code агента і йде до наступного fallback', () => {
    expect(MERGE_ZSH_LIB).toContain('_n7agent_report_failure "pi -p" "$rc" "$agent_out" "$agent_err"')
    expect(MERGE_ZSH_LIB).toContain('_n7agent_report_failure "claude -p" "$rc" "$agent_out" "$agent_err"')
    expect(MERGE_ZSH_LIB).toContain('❌ $agent не вдався (exit code: $rc).')
    expect(MERGE_ZSH_LIB).toContain('Усі доступні LLM-агенти не спрацювали')
  })

  it('переносить дельту merge-base..src через apply→merge-file (не git checkout зрізу)', () => {
    expect(MERGE_ZSH_LIB).toContain('git merge-base "$ours" "$src"')
    expect(MERGE_ZSH_LIB).toContain('git diff --binary "$merge_base" "$src"')
    expect(MERGE_ZSH_LIB).toContain('git apply --whitespace=nowarn')
    expect(MERGE_ZSH_LIB).toContain('git merge-file --diff3')
    expect(MERGE_ZSH_LIB).not.toContain('git checkout "$src" -- .')
  })
})

describe('runZsh', () => {
  it('передає скрипт, $0 та argv у zsh і повертає exit code', async () => {
    const emitter = new EventEmitter()
    const spawnFn = vi.fn(() => {
      setImmediate(() => emitter.emit('exit', 7))
      return emitter
    })
    const code = await runZsh('echo hi', spawnFn, ['feature'])
    expect(code).toBe(7)
    expect(spawnFn).toHaveBeenCalledWith('zsh', ['-c', 'echo hi', 'npx @7n/n', 'feature'], { stdio: 'inherit' })
  })

  it('exit без коду → 0', async () => {
    const emitter = new EventEmitter()
    const spawnFn = () => {
      setImmediate(() => emitter.emit('exit'))
      return emitter
    }
    expect(await runZsh('x', spawnFn)).toBe(0)
  })

  it('помилка запуску zsh → 1 і повідомлення у stderr', async () => {
    const emitter = new EventEmitter()
    const spawnFn = () => {
      setImmediate(() => emitter.emit('error', new Error('zsh missing')))
      return emitter
    }
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expect(await runZsh('x', spawnFn)).toBe(1)
    expect(errSpy).toHaveBeenCalled()
  })
})
