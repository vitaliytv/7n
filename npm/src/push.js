import { spawn } from 'node:child_process'

import { DEFAULT_LIMITS, renderZshNoiseArray } from './diff-context.js'
import { MERGE_ZSH_LIB, runZsh } from './merge.js'

// zsh-функція push: бере ВСІ локальні коміти (origin/<branch>..HEAD) + усі зміни робочого дерева
// (staged/unstaged/untracked через `git add -A`), сквошить їх в ОДИН коміт на вершині
// origin/<branch>, формує commit-меседж (українською, Gitmoji + Monorepo) і пушить
// одним комітом. Якщо origin/<branch> має коміти, яких немає локально (дивергенція), — НЕ зупиняємось,
// а спершу автоматично підтягуємо їхню дельту через спільне ядро `_n7merge_delta` (merge.js, та сама
// механіка, що й pull), і лише тоді сквошимо — інакше squash затер би віддалені правки.
// Squash робимо через `git reset --soft <base>`: parent майбутнього коміту = base, тож push до
// наявної origin/<branch> завжди fast-forward. Підтвердження НЕ питаємо (за вимогою) — у stdout
// друкуємо subject коміту і список файлів. Коміт — з `--no-verify` (hooks тут не потрібні).
// Меседж: ЯКЩО є застейджені change-файли (.changes/*.md) — збираємо його ДЕТЕРМІНОВАНО, БЕЗ LLM
// (`_n7push_build_message_from_changes`): frontmatter section → emoji/type, scope зі шляхів, summary із
// тіла найвагомішого (за bump) change-файлу, тіло — по булету на файл. ЛИШЕ якщо change-файлів немає —
// меседж генерує LLM-агент (`pi` → `claude` → `cursor-agent`) з diff: перелік файлів (scope), де docs/-файли
// ЗАВЖДИ згортаються в підсумок-кількість («загально змінено N файлів у docs/»), а решта перелічена поіменно;
// БЕЗ вмісту шумних шляхів (docs/** включно з ADR, CHANGELOG, .changes, *.lock, *.d.ts, snapshots, build)
// і обрізаний за рядками; .n-cursor/** та *.jsonl (трейси LLM) виключено так само. N7COMMIT_FORCE_LLM=1 примушує LLM навіть за наявних change-файлів (тоді вони —
// контекст). Diff ріжеться РІВНОМІРНО по файлах (per-file байт-бюджет N7COMMIT_MAX_FILE_BYTES), тож жоден один
// великий файл не з'їдає всю стелю. Шум: N7COMMIT_NO_DEFAULT_EXCLUDE, N7COMMIT_EXCLUDE, N7COMMIT_MAX_DIFF_LINES,
// N7COMMIT_MAX_FILE_BYTES, N7COMMIT_MAX_DIFF_BYTES. ADR у stdout — кількістю.
const ZSH_SCRIPT = `
${MERGE_ZSH_LIB}

# ── Налагодження (увімкнено за замовчуванням; вимкнути N7COMMIT_DEBUG=0) ──────
# Друкує позначені часом діагностичні рядки у stderr (щоб НЕ потрапити в commit-
# меседж, який збирається у stdout/файл). Увімкнено за замовчуванням — вимкнути
# можна лише явним N7COMMIT_DEBUG=0. Мета: бачити, на якому етапі push «висить»
# і скільки реально триває кожен виклик LLM-агента.
# Час відлічуємо від старту push (_n7t0, EPOCHREALTIME — монотонний float-час zsh).
zmodload zsh/datetime 2> /dev/null
typeset -g _n7t0=\${EPOCHREALTIME:-0}

_n7dbg() {
    [[ "\${N7COMMIT_DEBUG:-1}" != "0" ]] || return 0
    printf '🔎 [%7.2fs] %s\\n' "$(( EPOCHREALTIME - _n7t0 ))" "$*" >&2
}

# Підсумок виклику LLM-агента (за замовчуванням; вимкнути N7COMMIT_DEBUG=0): rc, тривалість, розмір
# і перші рядки stdout/stderr — щоб відрізнити «модель довго думає» від «агент
# завис на stdin/мережі/авторизації». $1 — мітка, $2 — старт (EPOCHREALTIME),
# $3 — rc, $4 — stdout-файл, $5 — stderr-файл.
_n7dbg_agent_done() {
    [[ "\${N7COMMIT_DEBUG:-1}" != "0" ]] || return 0
    local label="$1" start="$2" rc="$3" out="$4" err="$5"
    local obytes=0 olines=0 ebytes=0
    [[ -f "$out" ]] && { obytes=$(wc -c < "$out" | tr -d ' '); olines=$(wc -l < "$out" | tr -d ' '); }
    [[ -f "$err" ]] && ebytes=$(wc -c < "$err" | tr -d ' ')
    printf '🔎 [%7.2fs] %s: фініш rc=%s за %.2fs · stdout %sb/%sрядк · stderr %sb\\n' \\
        "$(( EPOCHREALTIME - _n7t0 ))" "$label" "$rc" "$(( EPOCHREALTIME - start ))" "$obytes" "$olines" "$ebytes" >&2
    if [[ -s "$out" ]]; then
        echo "🔎 │ $label stdout (перші 5 рядків):" >&2
        head -n 5 "$out" | sed 's/^/🔎 │   /' >&2
    fi
    if [[ -s "$err" ]]; then
        echo "🔎 │ $label stderr (перші 5 рядків):" >&2
        head -n 5 "$err" | sed 's/^/🔎 │   /' >&2
    fi
}

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

    local err rc t0
    local tried_agent=0 last_rc=1
    _n7dbg "ген-меседж: старт · prompt=\${#prompt} символів · ctx=$ctx ($(wc -l < "$ctx" | tr -d ' ')рядк/$(wc -c < "$ctx" | tr -d ' ')б)"

    # Prompt передаємо агентам через STDIN, а НЕ позиційним аргументом: великий diff (мегабайти) у argv
    # перевищує ARG_MAX ОС (на macOS 1 MiB) → execve повертає E2BIG ("argument list too long") і бінарник
    # навіть не стартує (rc=127, ~0.3s — це не падіння LLM, а неможливість його запустити). stdin цього
    # ліміту не має. Пишемо prompt у файл і редиректимо < "$pf" — без SIGPIPE-гонок і без подвійної копії.
    local pf=$(mktemp)
    print -r -- "$prompt" > "$pf"

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
        _n7dbg "pi -p: запускаю · args=[\${pi_args[*]}] · model=\${pi_model:-<дефолт>}"
        t0=$EPOCHREALTIME
        pi "\${pi_args[@]}" < "$pf" > "$out" 2> "$err"
        rc=$?
        _n7dbg_agent_done "pi -p" "$t0" "$rc" "$out" "$err"
        if [[ "$rc" -eq 0 ]]; then
            [[ -s "$err" ]] && cat "$err" >&2
            rm -f "$err" "$pf"
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
        local claude_model="\${N7COMMIT_MODEL:-\${N7MERGE_MODEL:-\${GETW_MERGE_MODEL:-sonnet}}}"
        _n7dbg "claude -p: запускаю · model=$claude_model"
        t0=$EPOCHREALTIME
        claude -p --model "$claude_model" < "$pf" > "$out" 2> "$err"
        rc=$?
        _n7dbg_agent_done "claude -p" "$t0" "$rc" "$out" "$err"
        if [[ "$rc" -eq 0 ]]; then
            [[ -s "$err" ]] && cat "$err" >&2
            rm -f "$err" "$pf"
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
        local cursor_model="\${N7COMMIT_CURSOR_MODEL:-\${N7MERGE_CURSOR_MODEL:-\${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}}}"
        _n7dbg "cursor-agent -p: запускаю · model=$cursor_model"
        t0=$EPOCHREALTIME
        cursor-agent -p --force --output-format text --model "$cursor_model" < "$pf" > "$out" 2> "$err"
        rc=$?
        _n7dbg_agent_done "cursor-agent -p" "$t0" "$rc" "$out" "$err"
        if [[ "$rc" -eq 0 ]]; then
            [[ -s "$err" ]] && cat "$err" >&2
            rm -f "$err" "$pf"
            return 0
        fi
        _n7agent_report_failure "cursor-agent -p" "$rc" "$out" "$err"
        rm -f "$err"
        last_rc="$rc"
    fi

    if [[ "$tried_agent" -eq 1 ]]; then
        echo "❌ Усі доступні LLM-агенти не спрацювали або fallback-и недоступні." >&2
        rm -f "$pf"
        return "$last_rc"
    fi

    echo "❌ Немає pi, claude або cursor-agent у PATH — згенерувати меседж неможливо." >&2
    rm -f "$pf"
    return 1
}

# Детерміновано (БЕЗ LLM) збирає commit-меседж зі застейджених change-файлів (.changes/*.md).
# Frontmatter section → emoji/type (Added→✨feat, Fixed→🐛fix, Changed→♻️refactor, Removed→🔥chore);
# scope — workspace (сегмент шляху до /.changes/) з найбільшою кількістю change-файлів; summary —
# тіло найвагомішого change-файлу (bump major>minor>patch; ties → Added>Fixed>Changed>Removed). Тіло
# меседжу — по одному булету на change-файл (його опис; переноси рядків згорнуто в пробіл). $1 — файл-
# вивід для меседжу, $2 — список change-шляхів (по одному в рядку). 0 — успіх (меседж у $1); 1 —
# жодного придатного change-файлу (тоді викликач робить LLM-фолбек).
_n7push_build_message_from_changes() {
    local out="$1" list="$2"
    typeset -A EMOJI TYPE BRANK SRANK
    EMOJI=(Added "✨" Changed "♻️" Fixed "🐛" Removed "🔥")
    TYPE=(Added feat Changed refactor Fixed fix Removed chore)
    BRANK=(major 3 minor 2 patch 1)
    SRANK=(Added 4 Fixed 3 Changed 2 Removed 1)

    local cf content fm section bump body oneline cf_ws score
    local head_score=-1 head_section="" head_summary=""
    local -a bullets
    typeset -A ws_count

    while IFS= read -r cf; do
        [[ -z "$cf" ]] && continue
        content=$(git show ":$cf" 2> /dev/null || cat "$cf" 2> /dev/null)
        [[ -z "$content" ]] && continue
        # Frontmatter — рядки між першим і другим "---"; тіло — усе після другого "---" (без провідних порожніх).
        fm=$(print -r -- "$content" | awk 'NR==1 && /^---/ {f=1; next} f && /^---/ {exit} f {print}')
        section=$(print -r -- "$fm" | awk -F':[[:space:]]*' '/^section:/ {print $2; exit}')
        bump=$(print -r -- "$fm" | awk -F':[[:space:]]*' '/^bump:/ {print $2; exit}')
        body=$(print -r -- "$content" | awk 'c>=2 {print} /^---[[:space:]]*$/ {c++}' | sed '/./,$!d')
        oneline=$(print -r -- "$body" | tr '\n' ' ' | sed 's/  */ /g; s/^ //; s/ *$//')
        [[ -z "$section" ]] && section="Changed"
        [[ -z "$oneline" ]] && oneline="$cf"
        bullets+=("- $oneline")
        cf_ws="\${cf%%/.changes/*}"
        [[ "$cf_ws" == "$cf" ]] && cf_ws="."
        ws_count[$cf_ws]=$(( \${ws_count[$cf_ws]:-0} + 1 ))
        score=$(( \${BRANK[$bump]:-0} * 10 + \${SRANK[$section]:-0} ))
        if (( score > head_score )); then
            head_score=$score; head_section="$section"; head_summary="$oneline"
        fi
    done <<< "$list"

    (( \${#bullets} == 0 )) && return 1
    [[ -z "$head_section" ]] && head_section="Changed"
    [[ -z "$head_summary" ]] && head_summary="\${bullets[1]#- }"

    # scope — workspace із найбільшою кількістю change-файлів (ties → перший за обходом).
    local scope="" best=-1 k
    for k in "\${(@k)ws_count}"; do
        if (( ws_count[$k] > best )); then best=\${ws_count[$k]}; scope="$k"; fi
    done

    local emoji="\${EMOJI[$head_section]:-📝}" type="\${TYPE[$head_section]:-chore}" subj
    if [[ -n "$scope" && "$scope" != "." ]]; then
        subj="$emoji $type($scope): $head_summary"
    else
        subj="$emoji $type: $head_summary"
    fi
    # Subject ≤ 72 символи (з урахуванням emoji як одного символа в UTF-8 локалі).
    (( \${#subj} > 72 )) && subj="\${subj[1,71]}…"

    {
        print -r -- "$subj"
        print -r --
        local b
        for b in "\${bullets[@]}"; do print -r -- "$b"; done
    } > "$out"
    return 0
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

    _n7t0=$EPOCHREALTIME
    echo "⬇️  Оновлюємо origin/$branch (git fetch)..."
    _n7dbg "git fetch origin $branch: старт"
    git fetch origin "$branch" 2> /dev/null
    _n7dbg "git fetch: готово"

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
    _n7dbg "git add -A: готово · base=$base"

    if git diff --cached --quiet "$base" --; then
        echo "✅ Немає змін відносно $base — пушити нічого. 👋"
        return 0
    fi

    # Сквошимо локальні коміти й застейджені зміни в один: parent = base.
    git reset --soft "$base"

    local msg ctx=""
    msg=$(mktemp)

    local changes_list
    changes_list=$(git diff --cached --name-only "$base" -- | grep -F '.changes/')

    # ПРІОРИТЕТ — change-файли (.changes/*.md): вони вже описують НАМІР зміни прозою (+ секцію
    # Added/Changed/Fixed/Removed). Якщо вони є — збираємо commit-меседж ДЕТЕРМІНОВАНО, БЕЗ LLM
    # (миттєво й відтворювано): section→emoji/type, scope зі шляхів, summary із тіла найвагомішого
    # change-файлу, тіло — по булету на файл. LLM лишається ФОЛБЕКОМ: коли change-файлів немає (суть
    # визначаємо з diff) або примусово через N7COMMIT_FORCE_LLM=1 (тоді change-файли йдуть у контекст).
    local built=0
    _n7dbg "меседж: change-файлів $(print -r -- "$changes_list" | grep -c .) · FORCE_LLM=\${N7COMMIT_FORCE_LLM:-0}"
    if [[ -n "$changes_list" && "\${N7COMMIT_FORCE_LLM:-0}" != "1" ]]; then
        echo "🧩 Збираю commit-меседж зі change-файлів (.changes/) — без LLM..." >&2
        if _n7push_build_message_from_changes "$msg" "$changes_list"; then
            built=1
        else
            echo "⚠️  Жодного придатного change-файлу — фолбек на LLM." >&2
        fi
    fi

    if [[ "$built" -eq 0 ]]; then
        # Шумні шляхи: їхній ВМІСТ не потрібен агенту, щоб визначити суть коміту (самі файли лишаються
        # в коміті — виключаємо лише з diff-контексту генерації меседжу; їхні ІМЕНА агент усе одно бачить
        # у name-status нижче). Дефолти вимикаються N7COMMIT_NO_DEFAULT_EXCLUDE=1; додаткові pathspec-глоби
        # (пробіл-розділені) — через env N7COMMIT_EXCLUDE. Перелік — зі спільного diff-context.js (єдине
        # джерело правди для push і ch, щоб набори не розходились).
        local -a noise
        noise=()
        if [[ "\${N7COMMIT_NO_DEFAULT_EXCLUDE:-0}" != "1" ]]; then
            noise=(
${renderZshNoiseArray()}
            )
        fi
        local extra
        for extra in \${(z)N7COMMIT_EXCLUDE:-}; do
            noise+=( ":(exclude)$extra" )
        done

        # Контекст для агента. Усі diff-и — ЯВНО проти "$base" (origin/<branch> або fork-point), як і
        # guard вище: після git add -A + git reset --soft "$base" це повна дельта origin..повний-локальний-
        # стан (застейджене + незастейджене/untracked + локальні коміти). Якщо change-файли все ж є (режим
        # N7COMMIT_FORCE_LLM=1) — даємо їх як ПЕРШОДЖЕРЕЛО; інакше — diff без вмісту шумних шляхів.
        local maxl=\${N7COMMIT_MAX_DIFF_LINES:-${DEFAULT_LIMITS.maxLines}}
        local maxcol=\${N7COMMIT_MAX_LINE:-${DEFAULT_LIMITS.maxLineLen}}
        local maxbytes=\${N7COMMIT_MAX_DIFF_BYTES:-${DEFAULT_LIMITS.maxBytes}}
        local maxfilebytes=\${N7COMMIT_MAX_FILE_BYTES:-${DEFAULT_LIMITS.maxFileBytes}}
        ctx=$(mktemp)
        {
            # Перелік файлів (scope). docs/-файли ЗАВЖДИ згортаємо в підсумок-кількість (навіть один):
            # вони — наратив, не суть коду й не несуть сенсу для меседжу, лише роздувають контекст і
            # збивають фокус. "docs/" розпізнаємо як сегмент шляху (на початку, після таба чи "/").
            local names_full docs_n
            names_full=$(git diff --cached --name-status "$base" --)
            docs_n=$(print -r -- "$names_full" | grep -cE '(^|[[:space:]/])docs/')
            echo "# Змінені файли (scope; docs/ згорнуто до кількості):"
            print -r -- "$names_full" | grep -vE '(^|[[:space:]/])docs/'
            (( docs_n > 0 )) && echo "# (+ загально змінено $docs_n файл(ів) у docs/ директоріях)"
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
                # РІВНОМІРНЕ обрізання ПО ФАЙЛАХ: глобальний head -c брав перші N байт у алфавітному порядку
                # шляхів, тож ОДИН великий файл із раннім ім'ям (напр. .n-cursor/llm-trace.jsonl — 5+ MB) з'їдав
                # усю байтову стелю й витісняв решту файлів із контексту. Тепер кожен файл дістає ВЛАСНИЙ
                # байт-бюджет (N7COMMIT_MAX_FILE_BYTES), а глобальна стеля (N7COMMIT_MAX_DIFF_BYTES) лишається
                # твердим backstop. На кожен файл — те саме тришарове обрізання: рядки (N7COMMIT_MAX_DIFF_LINES)
                # → довжина рядка (N7COMMIT_MAX_LINE) → байти (per-file ∧ залишок глобальної стелі).
                local -a changed
                changed=( "\${(@f)$(git diff --cached --name-only "$base" -- . "\${noise[@]}")}" )
                local f used remain cap before after trunc_n=0 omit_n=0 proc=0
                local acc=$(mktemp)
                for f in "\${changed[@]}"; do
                    [[ -z "$f" ]] && continue
                    used=$(wc -c < "$acc" | tr -d ' ')
                    # Глобальна стеля вичерпана — решту файлів лишаємо як кількість (а не ріжемо до нуля байтів).
                    if (( used >= maxbytes )); then omit_n=$(( \${#changed} - proc )); break; fi
                    proc=$(( proc + 1 ))
                    remain=$(( maxbytes - used ))
                    (( cap = maxfilebytes < remain ? maxfilebytes : remain ))
                    before=$used
                    git diff --cached "$base" -- "$f" | head -n "$maxl" | cut -c "1-$maxcol" | head -c "$cap" >> "$acc"
                    print -r -- "" >> "$acc"
                    after=$(wc -c < "$acc" | tr -d ' ')
                    # Вміст файлу вперся у власний cap → позначаємо обрізання (−1 байт на доданий вище \\n).
                    if (( after - before - 1 >= cap )); then
                        print -r -- "# … (вміст $f обрізано до ~$cap б)" >> "$acc"
                        trunc_n=$(( trunc_n + 1 ))
                    fi
                done
                cat "$acc"
                if (( trunc_n > 0 )); then
                    echo ""
                    echo "# … вміст $trunc_n файл(ів) обрізано (per-file ~$maxfilebytes б, env N7COMMIT_MAX_FILE_BYTES; рядки $maxl/N7COMMIT_MAX_DIFF_LINES, довжина $maxcol симв./N7COMMIT_MAX_LINE)."
                fi
                if (( omit_n > 0 )); then
                    echo ""
                    echo "# … $omit_n файл(ів) пропущено — вичерпано глобальну стелю ~$maxbytes б (env N7COMMIT_MAX_DIFF_BYTES)."
                fi
                rm -f "$acc"
            fi
        } > "$ctx"
        _n7dbg "diff-контекст зібрано ($(wc -l < "$ctx" | tr -d ' ')рядк/$(wc -c < "$ctx" | tr -d ' ')б, ліміти $maxl рядк/$maxbytes б глоб./$maxfilebytes б на файл/$maxcol симв) → виклик LLM"

        if ! _n7push_gen_message "$msg" "$ctx"; then
            echo "❌ Не вдалося згенерувати commit-меседж — коміт і push не виконано."
            echo "ℹ️ Зміни вже можуть бути staged після git add -A."
            rm -f "$ctx" "$msg"
            return 1
        fi
    fi

    # Прибираємо порожні рядки на краях, щоб git не лаявся на порожній subject.
    local subject=$(grep -m1 -v '^[[:space:]]*$' "$msg")
    if [[ -z "$subject" ]]; then
        echo "❌ Порожній commit-меседж — нічого не закомічено."
        rm -f \${ctx:+"$ctx"} "$msg"
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
        rm -f \${ctx:+"$ctx"} "$msg"
        return 1
    fi
    rm -f \${ctx:+"$ctx"} "$msg"

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
 * (`git add -A` — staged/unstaged/untracked) в ОДИН коміт на вершині `origin/<branch>`, формує
 * commit-меседж (українською, Gitmoji + Monorepo) і
 * пушить його одним комітом. За
 * дивергенції (origin має коміти, яких немає локально) спершу автоматично підтягує їхню дельту тим
 * самим ядром, що й pull (`_n7merge_delta`, merge.js), тож віддалені правки не затираються; squash
 * робиться через `git reset --soft <base>`, тож push до наявної гілки — fast-forward. Підтвердження не
 * питає: у stdout друкує subject коміту і список файлів (ADR-файли — згорнуті в кількість). Коміт — з
 * `--no-verify`. ЯКЩО є застейджені change-файли (`.changes/*.md`) — меседж збирається ДЕТЕРМІНОВАНО,
 * БЕЗ LLM (`_n7push_build_message_from_changes`): frontmatter `section` → emoji/type, scope зі шляхів,
 * summary із тіла найвагомішого (за `bump`) change-файлу, тіло — по булету на файл. ЛИШЕ за відсутності
 * change-файлів меседж генерує LLM-агент (`pi` → `claude` → `cursor-agent`) з diff (повний перелік файлів +
 * diff БЕЗ вмісту шумних шляхів: docs/** включно з ADR, CHANGELOG, .changes, *.lock, *.d.ts, snapshots,
 * build, .n-cursor/** та *.jsonl (трейси LLM), обрізаний). Diff ріжеться РІВНОМІРНО по файлах — кожен дістає
 * власний байт-бюджет (`N7COMMIT_MAX_FILE_BYTES`, дефолт 16 KiB), тож жоден один великий файл не монополізує
 * глобальну стелю `N7COMMIT_MAX_DIFF_BYTES`. `N7COMMIT_FORCE_LLM=1` примушує LLM навіть за наявних change-файлів (вони стають
 * контекстом). Шум конфігурується env `N7COMMIT_NO_DEFAULT_EXCLUDE`, `N7COMMIT_EXCLUDE`,
 * `N7COMMIT_MAX_DIFF_LINES`, `N7COMMIT_MAX_FILE_BYTES`, `N7COMMIT_MAX_DIFF_BYTES`. Модель LLM-агента (лише для фолбеку) — env
 * `N7COMMIT_MODEL` (фолбек `N7MERGE_MODEL` → `GETW_MERGE_MODEL` → `sonnet`) і `N7COMMIT_CURSOR_MODEL`
 * `N7COMMIT_PI_MODEL` (фолбек `N7MERGE_PI_MODEL`), для Claude — `N7COMMIT_MODEL`
 * (фолбек `N7MERGE_MODEL` → `GETW_MERGE_MODEL`), для Cursor — `N7COMMIT_CURSOR_MODEL`
 * (фолбек `N7MERGE_CURSOR_MODEL` → `GETW_MERGE_CURSOR_MODEL`). За замовчуванням друкує в stderr
 * позначений часом таймлайн етапів (fetch/add/збір контексту) і тривалість+exit code+розмір/перші рядки
 * відповіді кожного LLM-агента — діагностика «чому push висить» (вивід у stderr, у меседж не потрапляє);
 * вимкнути можна явним `N7COMMIT_DEBUG=0`.
 * Потребує zsh і git; pi/claude/cursor-agent — лише для LLM-фолбеку (коли немає change-файлів або
 * N7COMMIT_FORCE_LLM=1).
 * @param {string} [branch] - назва гілки (дефолт — поточна)
 * @param {typeof spawn} [spawnFn] - інжект `spawn` для тестів
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function push(branch, spawnFn = spawn) {
  return runZsh(ZSH_SCRIPT, spawnFn, [branch ?? ''])
}

export { ZSH_SCRIPT as PUSH_ZSH_SCRIPT }
