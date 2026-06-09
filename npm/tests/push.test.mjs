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

  it('пробує агентів у порядку pi → claude → cursor-agent', () => {
    expect(PUSH_ZSH_SCRIPT.indexOf('command -v pi')).toBeLessThan(PUSH_ZSH_SCRIPT.indexOf('command -v claude'))
    expect(PUSH_ZSH_SCRIPT.indexOf('command -v claude')).toBeLessThan(
      PUSH_ZSH_SCRIPT.indexOf('command -v cursor-agent')
    )
    expect(PUSH_ZSH_SCRIPT).toContain('--no-tools')
  })

  it('показує exit code агента і йде до наступного fallback', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('_n7agent_report_failure "pi -p" "$rc" "$out" "$err"')
    expect(PUSH_ZSH_SCRIPT).toContain('_n7agent_report_failure "claude -p" "$rc" "$out" "$err"')
    expect(PUSH_ZSH_SCRIPT).toContain('❌ $agent не вдався (exit code: $rc).')
    expect(PUSH_ZSH_SCRIPT).toContain('Усі доступні LLM-агенти не спрацювали')
  })

  it('уточнює, що після падіння генерації зміни вже можуть бути staged', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('коміт і push не виконано')
    expect(PUSH_ZSH_SCRIPT).toContain('Зміни вже можуть бути staged після git add -A')
  })

  it('друкує subject і список файлів у stdout (без інтерактивного підтвердження)', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('📝 Commit: $subject')
    expect(PUSH_ZSH_SCRIPT).toContain('git diff --cached --name-status "$base" --')
    expect(PUSH_ZSH_SCRIPT).not.toContain('[y/N]')
  })

  it('модель агента — нейтральний N7COMMIT_* із фолбеком на N7MERGE_*/GETW_*', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('${N7COMMIT_PI_MODEL:-${N7MERGE_PI_MODEL:-}}')
    expect(PUSH_ZSH_SCRIPT).toContain('${N7COMMIT_MODEL:-${N7MERGE_MODEL:-${GETW_MERGE_MODEL:-sonnet}}}')
    expect(PUSH_ZSH_SCRIPT).toContain(
      '${N7COMMIT_CURSOR_MODEL:-${N7MERGE_CURSOR_MODEL:-${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}}}'
    )
  })

  it('наявну origin-гілку пушить fast-forward, нову — з -u', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('git push origin "$branch"')
    expect(PUSH_ZSH_SCRIPT).toContain('git push -u origin "$branch"')
  })

  it('виключає вміст шумних шляхів із diff-контексту (docs/CHANGELOG/.changes/lock/d.ts)', () => {
    expect(PUSH_ZSH_SCRIPT).toContain(':(exclude)docs/**')
    expect(PUSH_ZSH_SCRIPT).toContain(':(exclude)**/docs/**')
    expect(PUSH_ZSH_SCRIPT).toContain(':(exclude)**/CHANGELOG.md')
    expect(PUSH_ZSH_SCRIPT).toContain(':(exclude)**/.changes/**')
    expect(PUSH_ZSH_SCRIPT).toContain(':(exclude)*.lock')
    expect(PUSH_ZSH_SCRIPT).toContain(':(exclude)**/*.d.ts')
    expect(PUSH_ZSH_SCRIPT).toContain('git diff --cached "$base" -- . "${noise[@]}"')
  })

  it('повний перелік файлів (scope) дає агенту попри виключення вмісту', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('git diff --cached --name-status "$base" --')
  })

  it('change-файли — пріоритетне джерело меседжу, diff лише за їх відсутності', () => {
    expect(PUSH_ZSH_SCRIPT).toContain("grep -F '.changes/'")
    expect(PUSH_ZSH_SCRIPT).toContain('if [[ -n "$changes_list" ]]; then')
    expect(PUSH_ZSH_SCRIPT).toContain('git show ":$cf"')
    // diff-фолбек (із виключенням шуму) — у гілці else, тобто коли change-файлів немає.
    expect(PUSH_ZSH_SCRIPT).toContain('git diff --cached "$base" -- . "${noise[@]}"')
  })

  it('за наявних change-файлів меседж збирається ДЕТЕРМІНОВАНО, БЕЗ LLM', () => {
    // Гілка: є change-файли і не форсимо LLM → деттермінований білдер замість _n7push_gen_message.
    expect(PUSH_ZSH_SCRIPT).toContain('_n7push_build_message_from_changes')
    expect(PUSH_ZSH_SCRIPT).toContain('if [[ -n "$changes_list" && "${N7COMMIT_FORCE_LLM:-0}" != "1" ]]; then')
    expect(PUSH_ZSH_SCRIPT).toContain('без LLM')
    // LLM-генерація лишається лише у фолбек-гілці built==0.
    expect(PUSH_ZSH_SCRIPT).toContain('if [[ "$built" -eq 0 ]]; then')
  })

  it('білдер: section→emoji/type, scope зі шляхів, summary за найвищим bump, тіло — булети', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('EMOJI=(Added "✨" Changed "♻️" Fixed "🐛" Removed "🔥")')
    expect(PUSH_ZSH_SCRIPT).toContain('TYPE=(Added feat Changed refactor Fixed fix Removed chore)')
    expect(PUSH_ZSH_SCRIPT).toContain('BRANK=(major 3 minor 2 patch 1)')
    expect(PUSH_ZSH_SCRIPT).toContain('cf_ws="${cf%%/.changes/*}"')
    // Subject обрізається до 72 символів.
    expect(PUSH_ZSH_SCRIPT).toContain('subj="${subj[1,71]}…"')
  })

  it('N7COMMIT_FORCE_LLM=1 примушує LLM навіть за наявних change-файлів', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('${N7COMMIT_FORCE_LLM:-0}')
  })

  it('change_list і diff-и беруться ЯВНО проти "$base" (origin), а не неявно проти HEAD', () => {
    // Після git add -A + git reset --soft "$base" це повна дельта origin..повний-локальний-стан:
    // застейджене + незастейджене/untracked + локальні коміти (різниця vs origin) в одному наборі.
    expect(PUSH_ZSH_SCRIPT).toContain('git diff --cached --name-only "$base" -- | grep -F \'.changes/\'')
    expect(PUSH_ZSH_SCRIPT).not.toMatch(/git diff --cached --name-only \| grep/)
  })

  it('у stdout ADR-файли згортаються в кількість, а не перелічуються поштучно', () => {
    expect(PUSH_ZSH_SCRIPT).toContain("grep -v 'docs/adr/'")
    expect(PUSH_ZSH_SCRIPT).toContain("grep -c 'docs/adr/'")
    expect(PUSH_ZSH_SCRIPT).toContain('📄 docs/adr/: $adr_n файл(ів)')
  })

  it('шум конфігурується через env (вимкнення дефолтів, додаткові шляхи, ліміт рядків)', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('${N7COMMIT_NO_DEFAULT_EXCLUDE:-0}')
    expect(PUSH_ZSH_SCRIPT).toContain('${(z)N7COMMIT_EXCLUDE:-}')
    expect(PUSH_ZSH_SCRIPT).toContain('${N7COMMIT_MAX_DIFF_LINES:-1500}')
  })

  it('таймлайн увімкнено за замовчуванням, вимикається лише явним N7COMMIT_DEBUG=0', () => {
    // Дефолт :-1 → активно без env; гейт пропускає вивід, лише коли значення явно "0".
    expect(PUSH_ZSH_SCRIPT).toContain('[[ "${N7COMMIT_DEBUG:-1}" != "0" ]] || return 0')
    expect(PUSH_ZSH_SCRIPT).not.toContain('${N7COMMIT_DEBUG:-0}')
    expect(PUSH_ZSH_SCRIPT).toContain('zmodload zsh/datetime')
    expect(PUSH_ZSH_SCRIPT).toContain('_n7dbg()')
    expect(PUSH_ZSH_SCRIPT).toContain('_n7dbg_agent_done()')
  })

  it('таймлайн міряє тривалість кожного агента від EPOCHREALTIME', () => {
    // Старт фіксуємо перед викликом, тривалість рахуємо в _n7dbg_agent_done — для pi/claude/cursor.
    expect(PUSH_ZSH_SCRIPT).toContain('t0=$EPOCHREALTIME')
    expect(PUSH_ZSH_SCRIPT).toContain('_n7dbg_agent_done "pi -p" "$t0" "$rc" "$out" "$err"')
    expect(PUSH_ZSH_SCRIPT).toContain('_n7dbg_agent_done "claude -p" "$t0" "$rc" "$out" "$err"')
    expect(PUSH_ZSH_SCRIPT).toContain('_n7dbg_agent_done "cursor-agent -p" "$t0" "$rc" "$out" "$err"')
  })

  it('таймлайн розмічає й детерміновані етапи (fetch/add/контекст)', () => {
    expect(PUSH_ZSH_SCRIPT).toContain('_n7dbg "git fetch')
    expect(PUSH_ZSH_SCRIPT).toContain('_n7dbg "git add -A: готово')
    expect(PUSH_ZSH_SCRIPT).toContain('→ виклик LLM')
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
