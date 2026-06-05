import { spawn } from 'node:child_process'

import { MERGE_ZSH_LIB, runZsh } from './merge.js'

// zsh-функція push: бере ВСІ локальні коміти (origin/<branch>..HEAD) + усі зміни робочого дерева
// (staged/unstaged/untracked через `git add -A`), сквошить їх в ОДИН коміт на вершині
// origin/<branch>, генерує commit-меседж LLM-агентом (`pi` → `claude` → `cursor-agent`,
// українською, Gitmoji + Monorepo) і пушить
// одним комітом. Якщо origin/<branch> має коміти, яких немає локально (дивергенція), — НЕ зупиняємось,
// а спершу автоматично підтягуємо їхню дельту через спільне ядро `_n7merge_delta` (merge.js, та сама
// механіка, що й pull), і лише тоді сквошимо — інакше squash затер би віддалені правки.
// Squash робимо через `git reset --soft <base>`: parent майбутнього коміту = base, тож push до
// наявної origin/<branch> завжди fast-forward. Підтвердження НЕ питаємо (за вимогою) — у stdout
// друкуємо subject коміту і список файлів. Коміт — з `--no-verify` (hooks тут не потрібні).
// Контекст для меседжу: ПРІОРИТЕТ — застейджені change-файли (.changes/*.md), бо вони вже описують
// намір прозою (+ секцію Added/Changed/Fixed); diff аналізуємо ЛИШЕ якщо change-файлів немає. У diff-
// фолбеку згодовуємо ПОВНИЙ перелік файлів (scope), але БЕЗ вмісту шумних шляхів (docs/** включно з
// ADR, CHANGELOG, .changes, *.lock, *.d.ts, snapshots, build) і обрізаний за рядками. Шум конфігурується:
// N7COMMIT_NO_DEFAULT_EXCLUDE, N7COMMIT_EXCLUDE, N7COMMIT_MAX_DIFF_LINES. У stdout ADR згортаються в кількість.
const ZSH_SCRIPT = `
${MERGE_ZSH_LIB}

# Генерує multi-line commit-меседж (українською, Gitmoji + Monorepo / Conventional Commits зі scope)
# LLM-агентом на основі застейдженої дельти. $1 — файл-вивід для меседжу, $2 — файл із git diff.
# Прогрес друкуємо у stderr, щоб у $1 потрапив ЛИШЕ сам меседж. Повертає код агента (0 — успіх).
_n7push_gen_message() {
    local out="$1" ctx="$2"
    local prompt="Згенеруй Git commit-меседж українською у стилі Gitmoji + Monorepo (Conventional Commits зі scope).

Формат:
  <emoji> <type>(<scope>): <короткий підсумок>

  - <пункт тіла: що саме змінено і навіщо>
  - <ще пункт за потреби, 1-5 загалом>

Правила:
- Мова — українська; технічні ідентифікатори, шляхи, команди та API-назви лишай англійською.
- <emoji> — доречний Gitmoji (✨ нова фіча, 🐛 фікс, ♻️ рефактор, 📝 докси, ✅ тести, 🔧 конфіг, ⬆️ оновлення залежностей, 🚀 деплой/реліз тощо).
- <type> — feat|fix|refactor|docs|test|chore|build за змістом змін.
- <scope> — назва workspace/каталогу, де основні зміни (напр. npm). Якщо їх кілька — обери головний.
- Subject (перший рядок) ≤ 72 символи, без крапки в кінці.
- Якщо в контексті є секція «Change-файли» — будуй меседж НАСАМПЕРЕД на їхньому описі (вони вже фіксують суть і секцію); diff там відсутній і не потрібен. Якщо change-файлів немає — визначай суть із diff.
- Виведи ЛИШЕ сам меседж: subject, далі порожній рядок, далі тіло. БЕЗ преамбул, БЕЗ code fence, БЕЗ лапок навколо.

Контекст змін:
$(cat "$ctx")"

    local err rc
    local tried_agent=0 last_rc=1

    if command -v pi > /dev/null 2>&1; then
        tried_agent=1
        err=$(mktemp)
        local -a pi_args
        local pi_model="\${N7COMMIT_PI_MODEL:-\${N7MERGE_PI_MODEL:-}}"
        pi_args=(-p --no-session --no-context-files --no-tools)
        if [[ -n "$pi_model" ]]; then
            pi_args+=(--model "$pi_model")
        fi
        echo "🤖 Генерую commit-меседж через pi -p..." >&2
        pi "\${pi_args[@]}" "$prompt" > "$out" 2> "$err"
        rc=$?
        if [[ "$rc" -eq 0 ]]; then
            [[ -s "$err" ]] && cat "$err" >&2
            rm -f "$err"
            return 0
        fi
        _n7agent_report_failure "pi -p" "$rc" "$out" "$err"
        rm -f "$err"
        last_rc="$rc"
    fi

    if command -v claude > /dev/null 2>&1; then
        tried_agent=1
        err=$(mktemp)
        echo "🤖 Генерую commit-меседж через claude -p..." >&2
        claude -p "$prompt" --model "\${N7COMMIT_MODEL:-\${N7MERGE_MODEL:-\${GETW_MERGE_MODEL:-sonnet}}}" > "$out" 2> "$err"
        rc=$?
        if [[ "$rc" -eq 0 ]]; then
            [[ -s "$err" ]] && cat "$err" >&2
            rm -f "$err"
            return 0
        fi
        _n7agent_report_failure "claude -p" "$rc" "$out" "$err"
        rm -f "$err"
        last_rc="$rc"
    fi

    if command -v cursor-agent > /dev/null 2>&1; then
        tried_agent=1
        err=$(mktemp)
        echo "🤖 Генерую commit-меседж через cursor-agent -p..." >&2
        cursor-agent -p --force --output-format text --model "\${N7COMMIT_CURSOR_MODEL:-\${N7MERGE_CURSOR_MODEL:-\${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}}}" "$prompt" > "$out" 2> "$err"
        rc=$?
        if [[ "$rc" -eq 0 ]]; then
            [[ -s "$err" ]] && cat "$err" >&2
            rm -f "$err"
            return 0
        fi
        _n7agent_report_failure "cursor-agent -p" "$rc" "$out" "$err"
        rm -f "$err"
        last_rc="$rc"
    fi

    if [[ "$tried_agent" -eq 1 ]]; then
        echo "❌ Усі доступні LLM-агенти не спрацювали або fallback-и недоступні." >&2
        return "$last_rc"
    fi

    echo "❌ Немає pi, claude або cursor-agent у PATH — згенерувати меседж неможливо." >&2
    return 1
}

push() {
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        echo "❌ Помилка: Ви не в Git репозиторії."
        return 1
    fi

    local branch="$1"
    if [[ -z "$branch" ]]; then
        branch=$(git branch --show-current)
    fi
    if [[ -z "$branch" ]]; then
        echo "❌ Не вдалося визначити гілку (detached HEAD?). Вкажи явно: npx @7n/n push <branch>"
        return 1
    fi

    echo "⬇️  Оновлюємо origin/$branch (git fetch)..."
    git fetch origin "$branch" 2> /dev/null

    # База для squash + чи це наявна origin-гілка (тоді push — fast-forward без -u).
    local base="" base_is_remote_branch=0
    if git rev-parse --verify --quiet "origin/$branch" > /dev/null; then
        base_is_remote_branch=1
        base="origin/$branch"
        # Дивергенція: origin/<branch> має коміти, яких немає в HEAD → автопідтягуємо їхню дельту.
        if ! git merge-base --is-ancestor "origin/$branch" HEAD; then
            echo "🔀 origin/$branch має нові коміти — підтягую їхню дельту (як pull)..."
            if ! _n7merge_delta "HEAD" "origin/$branch"; then
                echo "❌ Автопідтягування лишило конфлікти — розв'яжи вручну (git diff), потім повтори npx @7n/n push."
                return 1
            fi
        fi
    else
        echo "ℹ️  origin/$branch ще не існує — це буде перший push гілки."
        local default_ref=$(git rev-parse --abbrev-ref origin/HEAD 2> /dev/null)
        if [[ -n "$default_ref" ]] && git rev-parse --verify --quiet "$default_ref" > /dev/null; then
            base=$(git merge-base HEAD "$default_ref")
        fi
        if [[ -z "$base" ]]; then
            base=$(git rev-list --max-parents=0 HEAD | tail -1)
        fi
    fi

    echo "📦 Збираю всі зміни (git add -A)..."
    git add -A

    if git diff --cached --quiet "$base" --; then
        echo "✅ Немає змін відносно $base — пушити нічого. 👋"
        return 0
    fi

    # Сквошимо локальні коміти й застейджені зміни в один: parent = base.
    git reset --soft "$base"

    local ctx msg
    ctx=$(mktemp)
    msg=$(mktemp)

    # Шумні шляхи: їхній ВМІСТ не потрібен агенту, щоб визначити суть коміту (самі файли лишаються
    # в коміті — виключаємо лише з diff-контексту генерації меседжу; їхні ІМЕНА агент усе одно бачить
    # у name-status нижче). Дефолти вимикаються N7COMMIT_NO_DEFAULT_EXCLUDE=1; додаткові pathspec-глоби
    # (пробіл-розділені) — через env N7COMMIT_EXCLUDE.
    local -a noise
    noise=()
    if [[ "\${N7COMMIT_NO_DEFAULT_EXCLUDE:-0}" != "1" ]]; then
        noise=(
            ':(exclude)docs/**'            # вся документація в корені (ADR, гайди) — наратив, не суть коду
            ':(exclude)**/docs/**'         # docs/ у будь-якому під-workspace
            ':(exclude)**/CHANGELOG.md'    # генерується CI з change-файлів
            ':(exclude)**/.changes/**'     # change-файли (bookkeeping)
            ':(exclude)*.lock'             # bun.lock та інші *.lock
            ':(exclude)**/package-lock.json'
            ':(exclude)**/pnpm-lock.yaml'
            ':(exclude)**/yarn.lock'
            ':(exclude)**/*.snap'          # тест-снапшоти
            ':(exclude)**/__snapshots__/**'
            ':(exclude)**/*.min.js'        # мініфіковане
            ':(exclude)**/*.map'           # source maps
            ':(exclude)**/*.d.ts'          # генеровані типи (з JSDoc)
            ':(exclude)dist/**'            # білд-артефакти
            ':(exclude)build/**'
            ':(exclude)coverage/**'
        )
    fi
    local extra
    for extra in \${(z)N7COMMIT_EXCLUDE:-}; do
        noise+=( ":(exclude)$extra" )
    done

    # Контекст для агента. ПРІОРИТЕТ — change-файли (.changes/*.md): вони вже описують
    # НАМІР зміни прозою (+ секцію Added/Changed/Fixed), тож суть з них чистіша за diff. diff аналізуємо
    # ЛИШЕ якщо change-файлів немає. Повний перелік файлів (scope) даємо завжди.
    # Усі diff-и нижче — ЯВНО проти "$base" (origin/<branch> або fork-point), як і guard на рядку вище:
    # після git add -A + git reset --soft "$base" це повна дельта origin..повний-локальний-стан, тобто
    # охоплює застейджене + незастейджене/untracked + локальні коміти (різниця vs origin) в одному наборі.
    local maxl=\${N7COMMIT_MAX_DIFF_LINES:-1500}
    local changes_list
    changes_list=$(git diff --cached --name-only "$base" -- | grep -F '.changes/')
    {
        echo "# Усі змінені файли (повний перелік, scope):"
        git diff --cached --name-status "$base" --
        echo ""
        if [[ -n "$changes_list" ]]; then
            echo "# Change-файли (.changes/) — ПЕРШОДЖЕРЕЛО наміру коміту; будуй меседж насамперед на них"
            echo "# (frontmatter section ≈ type/emoji: Added→feat/✨, Fixed→fix/🐛, Changed→refactor/♻️, Removed→🔥):"
            local cf
            while IFS= read -r cf; do
                [[ -z "$cf" ]] && continue
                echo ""
                echo "## $cf"
                git show ":$cf" 2> /dev/null || cat "$cf" 2> /dev/null
            done <<< "$changes_list"
        else
            echo "# Change-файлів немає — визнач суть із diff (вміст шумних шляхів виключено, обрізано):"
            local full total
            full=$(mktemp)
            git diff --cached "$base" -- . "\${noise[@]}" > "$full"
            head -n "$maxl" "$full"
            total=$(wc -l < "$full")
            if (( total > maxl )); then
                echo ""
                echo "# … diff обрізано: показано $maxl з $total рядків (env N7COMMIT_MAX_DIFF_LINES)."
            fi
            rm -f "$full"
        fi
    } > "$ctx"

    if ! _n7push_gen_message "$msg" "$ctx"; then
        echo "❌ Не вдалося згенерувати commit-меседж — коміт і push не виконано."
        echo "ℹ️ Зміни вже можуть бути staged після git add -A."
        rm -f "$ctx" "$msg"
        return 1
    fi

    # Прибираємо порожні рядки на краях, щоб git не лаявся на порожній subject.
    local subject=$(grep -m1 -v '^[[:space:]]*$' "$msg")
    if [[ -z "$subject" ]]; then
        echo "❌ Агент повернув порожній меседж — нічого не закомічено."
        rm -f "$ctx" "$msg"
        return 1
    fi

    echo ""
    echo "📝 Commit: $subject"
    echo "📂 Файли:"
    # ADR-файли (docs/adr/) не перелічуємо поштучно — друкуємо лише їх кількість, щоб не шуміти.
    local names adr_n
    names=$(git diff --cached --name-status "$base" --)
    echo "$names" | grep -v 'docs/adr/' | sed 's/^/   /'
    adr_n=$(echo "$names" | grep -c 'docs/adr/')
    (( adr_n > 0 )) && echo "   📄 docs/adr/: $adr_n файл(ів)"
    echo ""

    if ! git commit --no-verify -F "$msg" > /dev/null; then
        echo "❌ git commit не вдався."
        rm -f "$ctx" "$msg"
        return 1
    fi
    rm -f "$ctx" "$msg"

    echo "🚀 Пушу origin/$branch одним комітом..."
    if [[ "$base_is_remote_branch" -eq 1 ]]; then
        if ! git push origin "$branch"; then
            echo "❌ git push не вдався (можливо, origin/$branch знову оновився — зроби npx @7n/n push ще раз)."
            return 1
        fi
    else
        if ! git push -u origin "$branch"; then
            echo "❌ git push не вдався."
            return 1
        fi
    fi

    echo "✅ Готово! Локальні зміни запушено одним комітом у origin/$branch. 🚀"
}
push "$1"
`

/**
 * Сквошить усі локальні коміти (`origin/<branch>..HEAD`) разом зі змінами робочого дерева
 * (`git add -A` — staged/unstaged/untracked) в ОДИН коміт на вершині `origin/<branch>`, генерує
 * commit-меседж LLM-агентом (`pi` → `claude` → `cursor-agent`, українською, Gitmoji + Monorepo) і
 * пушить його одним комітом. За
 * дивергенції (origin має коміти, яких немає локально) спершу автоматично підтягує їхню дельту тим
 * самим ядром, що й pull (`_n7merge_delta`, merge.js), тож віддалені правки не затираються; squash
 * робиться через `git reset --soft <base>`, тож push до наявної гілки — fast-forward. Підтвердження не
 * питає: у stdout друкує subject коміту і список файлів (ADR-файли — згорнуті в кількість). Коміт — з
 * `--no-verify`. Меседж будується насамперед на застейджених change-файлах (`.changes/*.md`) — вони
 * описують намір прозою; diff аналізується лише за їх відсутності (тоді — повний перелік файлів +
 * diff БЕЗ вмісту шумних шляхів: docs/** включно з ADR, CHANGELOG, .changes, *.lock, *.d.ts, snapshots,
 * build, обрізаний). Шум конфігурується env `N7COMMIT_NO_DEFAULT_EXCLUDE`, `N7COMMIT_EXCLUDE`,
 * `N7COMMIT_MAX_DIFF_LINES`. Модель агента — env
 * `N7COMMIT_MODEL` (фолбек `N7MERGE_MODEL` → `GETW_MERGE_MODEL` → `sonnet`) і `N7COMMIT_CURSOR_MODEL`
 * `N7COMMIT_PI_MODEL` (фолбек `N7MERGE_PI_MODEL`), для Claude — `N7COMMIT_MODEL`
 * (фолбек `N7MERGE_MODEL` → `GETW_MERGE_MODEL`), для Cursor — `N7COMMIT_CURSOR_MODEL`
 * (фолбек `N7MERGE_CURSOR_MODEL` → `GETW_MERGE_CURSOR_MODEL`). Потребує zsh, git і pi/claude/cursor-agent.
 * @param {string} [branch] - назва гілки (дефолт — поточна)
 * @param {typeof spawn} [spawnFn] - інжект `spawn` для тестів
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function push(branch, spawnFn = spawn) {
  return runZsh(ZSH_SCRIPT, spawnFn, [branch ?? ''])
}

export { ZSH_SCRIPT as PUSH_ZSH_SCRIPT }
