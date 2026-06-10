import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

// Шлях до Tier-3 omlx-резолвера; передаємо в zsh як N7MERGE_RESOLVER (Tier 3 шелл-аутить `node $…`).
const RESOLVER_PATH = fileURLToPath(new URL('omlx-resolve.js', import.meta.url))

// Спільне ядро delta-мерджу для getw і pull. Обидві команди переносять у поточне робоче дерево
// як unstaged ЛИШЕ дельту merge-base(ours, src)..src (а не весь зріз src через `git checkout`), щоб
// не затирати файли, які поточна сторона змінювала самостійно. Різниця лише в джерелі (`src`):
// getw бере локальну worktree-гілку, pull — origin/<branch>. Конфлікти резолвимо багаторівнево:
//   Tier 0 — чистий `git apply` (без --index);
//   Tier 1 — пофайловий 3-way `git merge-file --diff3` (без індексу → без "does not match index");
//   Tier 2 — структурний AST-авторезолвер `mergiraf solve` (off через N7MERGE_NO_MERGIRAF=1, авто-
//            встановлення через brew/cargo);
//   Tier 3 — LLM-агент (`pi -p` → `claude -p` → `cursor-agent -p`) ЛИШЕ на залишок з маркерами.
// Перед перенесенням ядро робить pre-flight знімок незакомічених змін через `git stash create`
// (commit-знімок без чіпання робочого дерева) і кладе його у stash-список — точка відкату, якщо
// мердж чи Tier-3-агент щось зіпсує.
// Розподіл ролей: СКРИПТ детерміновано готує конфлікти, авторезолвить, виносить вердикт (чи лишились
// маркери) і регенерує bun.lock; агент робить лише творчу частину — прибирає маркери (нічого не
// видаляє, git не запускає) і друкує per-file підсумок у stdout. Env-кнопки (нейтральний префікс
// N7MERGE_, із backward-фолбеком на
// історичні GETW_): N7MERGE_PI_MODEL, N7MERGE_MODEL (фолбек GETW_MERGE_MODEL),
// N7MERGE_CURSOR_MODEL (фолбек GETW_MERGE_CURSOR_MODEL), N7MERGE_NO_MERGIRAF
// (фолбек GETW_NO_MERGIRAF).
//
// Фрагмент експортуємо як рядок (а не виконуваний модуль), бо самі команди — це zsh-скрипти, що
// потребують інтерактивного TTY (fzf/агент); кожна вставляє цей блок у свій ZSH_SCRIPT і викликає
// `_n7merge_delta <ours_ref> <src_ref>`.
export const MERGE_ZSH_LIB = `
# Друкує стислу діагностику non-zero exit від LLM CLI без prompt/diff-контексту.
# $1 — назва агента, $2 — exit code, $3 — stdout-файл, $4 — stderr-файл.
_n7agent_report_failure() {
    local agent="$1" rc="$2" out_file="$3" err_file="$4"
    local limit="\${N7AGENT_ERROR_LINES:-40}"

    echo "❌ $agent не вдався (exit code: $rc)." >&2
    if [[ -s "$err_file" ]]; then
        echo "   stderr ($agent, перші $limit рядків):" >&2
        head -n "$limit" "$err_file" | sed 's/^/   │ /' >&2
    fi
    if [[ -s "$out_file" ]]; then
        echo "   stdout ($agent, перші $limit рядків):" >&2
        head -n "$limit" "$out_file" | sed 's/^/   │ /' >&2
    fi
}

# Tier 3: інтелектуальний резолв конфліктних маркерів через ЛОКАЛЬНИЙ omlx (gemma-4 на MLX), без
# cloud-агентів. Делегуємо нашому JS-резолверу ($N7MERGE_RESOLVER = omlx-resolve.js): generate-validate
# цикл ПО-ХУНКОВО з агресивною валідацією (маркери/галюцинації/покриття обох сторін/довжина) і
# таргетованим ретраєм. JS читає ours/base/theirs прямо з diff3-маркерів у файлах, редагує файли
# in-place і друкує per-file підсумок у stdout (його віддаємо у summary_out для розділу Tier 3).
# Нерозвʼязані хунки лишаються з маркерами — вердикт (чи лишились) виносить ядро окремо.
# $1 — newline-список файлів, $4 — summary_out ($2/$3 ours/src більше не потрібні: контекст у маркерах).
_n7merge_resolve_with_agent() {
    local files="$1"
    local summary_out="$4"

    if ! command -v node > /dev/null 2>&1; then
        echo "❌ Немає node у PATH — omlx-резолвер недоступний." >&2
        return 1
    fi
    if [[ -z "$N7MERGE_RESOLVER" || ! -f "$N7MERGE_RESOLVER" ]]; then
        echo "❌ omlx-резолвер не знайдено (N7MERGE_RESOLVER=$N7MERGE_RESOLVER)." >&2
        return 1
    fi

    echo "🤖 Інтелектуальний резолв через локальний omlx..."
    local out rc
    out=$(mktemp)
    # \${(@f)files} — кожен рядок списку окремим argv (зберігає пробіли в іменах, без word-splitting).
    node "$N7MERGE_RESOLVER" "\${(@f)files}" > "$out" 2>&1
    rc=$?
    if [[ "$rc" -eq 0 ]]; then
        # Підсумок резолвера віддаємо ядру (через summary_out), щоб показати у розділі Tier 3.
        if [[ -n "$summary_out" ]]; then cp "$out" "$summary_out"; else cat "$out"; fi
        rm -f "$out"
        return 0
    fi
    # omlx недоступний або лишилися нерозвʼязані хунки — показуємо причину, маркери лишаються в файлах.
    cat "$out" >&2
    rm -f "$out"
    return "$rc"
}

# З newline-списку файлів ($1) друкує ті, що ще містять конфліктні маркери. Це детермінований
# вердикт скрипта: поки список непорожній — мерж не завершено.
_n7merge_files_with_markers() {
    local f
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        [[ -f "$f" ]] && grep -qE '^(<<<<<<<|>>>>>>>)' "$f" && echo "$f"
    done <<< "$1"
}

# Чи відрізняється кореневий bun.lock між поточною стороною (робоче дерево або $1-ref) і src ($2).
# bun.lock у проєкті лише в корені репо. Повертає 0, якщо відрізняються; 1 — якщо однакові.
_n7merge_bun_lock_differs() {
    local ours="$1"
    local src="$2"
    local ours_tmp theirs_tmp
    ours_tmp=$(mktemp)
    theirs_tmp=$(mktemp)
    if [[ -f bun.lock ]]; then
        cp bun.lock "$ours_tmp"
    elif git show "$ours:bun.lock" > "$ours_tmp" 2> /dev/null; then
        :
    else
        : > "$ours_tmp"
    fi
    if git show "$src:bun.lock" > "$theirs_tmp" 2> /dev/null; then
        :
    else
        : > "$theirs_tmp"
    fi
    if cmp -s "$ours_tmp" "$theirs_tmp"; then
        rm -f "$ours_tmp" "$theirs_tmp"
        return 1
    fi
    rm -f "$ours_tmp" "$theirs_tmp"
    return 0
}

# Tier-2 авторезолвер (опційний): структурний AST-merge через mergiraf. Працює in-place на файлі,
# що вже містить diff3-маркери (потрібна base-секція ||||||| — тому merge-file викликаємо з --diff3).
# Невідомі типи / нерозв'язне — лишає маркери, тоді спрацьовує Tier-3 (агент). Вимикається env
# N7MERGE_NO_MERGIRAF=1 (фолбек GETW_NO_MERGIRAF). Повертає 0, якщо файл повністю розв'язано.
_n7merge_mergiraf_solve() {
    local file="$1"
    [[ "\${N7MERGE_NO_MERGIRAF:-\${GETW_NO_MERGIRAF:-0}}" = "1" ]] && return 1
    command -v mergiraf > /dev/null 2>&1 || return 1
    mergiraf solve "$file" > /dev/null 2>&1
    ! grep -qE '^(<<<<<<<|>>>>>>>)' "$file"
}

# Гарантує наявність mergiraf (Tier 2). Якщо немає — ставить через brew (як fzf), з cargo як
# фолбеком. Вимикається N7MERGE_NO_MERGIRAF=1 (фолбек GETW_NO_MERGIRAF). 0 = mergiraf доступний.
_n7merge_ensure_mergiraf() {
    [[ "\${N7MERGE_NO_MERGIRAF:-\${GETW_NO_MERGIRAF:-0}}" = "1" ]] && return 1
    command -v mergiraf > /dev/null 2>&1 && return 0
    echo "🧩 mergiraf (структурний авторезолвер) не встановлено — ставлю..."
    if command -v brew > /dev/null 2>&1; then
        brew install mergiraf && command -v mergiraf > /dev/null 2>&1 && return 0
    fi
    if command -v cargo > /dev/null 2>&1; then
        echo "   brew не впорався — пробую cargo (компіляція, може зайняти кілька хвилин)..."
        cargo install --locked mergiraf && command -v mergiraf > /dev/null 2>&1 && return 0
    fi
    echo "   ⚠️ Не вдалося поставити mergiraf — Tier 2 пропущено (резолвитиме агент)."
    return 1
}

# Друкує OURS-секцію (приймач) diff3-маркованого файлу: рядки між <<<<<<< і ||||||| (усі регіони).
_n7merge_block_ours() {
    awk '
        /^<<<<<<< /{f=1; next}
        /^[|]{7}/{f=0; next}
        /^=======$/{f=0; next}
        /^>>>>>>> /{f=0; next}
        f
    ' "$1"
}

# Друкує THEIRS-секцію (джерело) diff3-маркованого файлу: рядки між ======= і >>>>>>> (усі регіони).
_n7merge_block_theirs() {
    awk '
        /^=======$/{f=1; next}
        /^>>>>>>> /{f=0; next}
        f
    ' "$1"
}

# Яскраво повідомляє про modify-beats-delete: одна сторона ВИДАЛИЛА файл, інша його ЗМІНИЛА — ми
# детерміновано лишаємо змінену версію (файл «воскресає»). Спільний банер для обох напрямків, щоб
# одразу було видно врятований файл. $1 — файл, $2 — хто видалив, $3 — чию (змінену) версію лишаємо.
_n7merge_rescued() {
    echo "╭─ 💀→✅ ВРЯТОВАНО ВІД ВИДАЛЕННЯ"
    echo "│  📄 $1"
    echo "│  «$2» видалив цей файл, але «$3» його змінив."
    echo "╰─ лишаю версію «$3» (modify-beats-delete) — переглянь у git diff."
}

# Ядро: переносить дельту merge-base(ours, src)..src у поточне робоче дерево як unstaged.
# $1 — ours_ref (поточна сторона: гілка або HEAD), $2 — src_ref (джерело: worktree-гілка або
# origin/<branch>). $3/$4 — опційні ЛЮДСЬКІ підписи боків ЛИШЕ для виводу (дефолт — самі ref); git-
# операції завжди йдуть на справжні ref $1/$2. Потрібні, коли src — sha-знімок (напр. reverse-delta
# у pull: src=бекап-коміт), щоб у банерах/блоках писати «локальна робота», а не голий sha.
# Багаторівнево: git apply → git merge-file --diff3 → mergiraf → LLM-агент. Замість пофайлового шуму
# (git "error: patch failed", per-file mergiraf-рядки) друкує лаконічний підсумок по тірах; деталі
# (блоки конфлікту + результат + коментар LLM) — лише для Tier 3.
# Повертає 0, якщо дельту перенесено без невирішених маркерів; 1 — якщо лишились конфлікти/помилка.
_n7merge_delta() {
    local ours="$1"
    local src="$2"
    local ours_label="\${3:-$1}"
    local src_label="\${4:-$2}"

    # Pre-flight знімок незакомічених змін: git stash create робить commit-знімок (staged+unstaged
    # tracked) НЕ чіпаючи робоче дерево й нічого не очищаючи — це чистий бекап на випадок, якщо мердж
    # чи Tier-3-агент щось зіпсує. На чистому дереві create нічого не друкує — тоді крок пропускаємо.
    local backup_sha
    backup_sha=$(git stash create "n7merge: backup before delta ($ours_label <- $src_label)" 2> /dev/null)
    if [[ -n "$backup_sha" ]]; then
        git stash store -m "n7merge: backup before delta ($ours_label <- $src_label)" "$backup_sha" 2> /dev/null
        echo "🛟 Бекап незакомічених змін збережено: git stash apply $backup_sha (відновити) · git stash drop (прибрати)"
    fi

    local merge_base=$(git merge-base "$ours" "$src")
    if [[ -z "$merge_base" ]]; then
        echo "❌ Не вдалося визначити спільного предка (merge-base) $ours_label і $src_label."
        return 1
    fi

    # --no-renames: rename = delete(old)+add(new), обидва кейси покрито в циклі.
    local changed_files=$(git diff --no-renames --name-only "$merge_base" "$src")
    local total_files=$(printf '%s' "$changed_files" | grep -c .)

    local patch_file
    patch_file=$(mktemp)
    git diff --binary "$merge_base" "$src" > "$patch_file"

    if [[ ! -s "$patch_file" ]]; then
        rm -f "$patch_file"
        echo "ℹ️ Дельта порожня — переносити нічого."
        return 0
    fi
    # Tier 1 (git): чистий apply. stderr глушимо — "error: patch failed" не помилка, а лише сигнал
    # перейти на пофайловий 3-way; що саме сталося, видно з підсумку по тірах нижче.
    if git apply --whitespace=nowarn "$patch_file" 2> /dev/null; then
        rm -f "$patch_file"
        echo "📊 Підсумок мерджу (Unstaged):"
        echo "   Tier 1 (git):      $total_files файл(ів)"
        echo "   Tier 2 (mergiraf): 0 файл(ів)"
        echo "   Tier 3 (LLM):      0 файл(ів)"
        return 0
    fi
    rm -f "$patch_file"
    _n7merge_ensure_mergiraf

    local tier1=0 tier2=0
    local conflict_files=""
    local regen_bun=0
    local rel base_tmp ours_tmp theirs_tmp mf_rc bn pre
    # Паралельні масиви Tier 3: rel-шлях і пре-знімок (diff3-маркований) для рендеру блоків опісля.
    local -a t3_files t3_pre

    while IFS= read -r rel; do
        [[ -z "$rel" ]] && continue

        # Видалено у src: прибираємо локально лише якщо поточна сторона файл не міняла.
        if ! git cat-file -e "$src:$rel" 2> /dev/null; then
            if [[ -f "$rel" ]] && git show "$merge_base:$rel" 2> /dev/null | cmp -s - "$rel"; then
                rm -f "$rel"
                tier1=$((tier1 + 1))
            elif [[ -f "$rel" ]]; then
                _n7merge_rescued "$rel" "$src_label" "$ours_label"
                tier1=$((tier1 + 1))
            fi
            continue
        fi

        bn=$(basename "$rel")
        # bun.lock лише в корені репо — не мержимо; bun install лише якщо lock відрізняється від src.
        if [[ "$rel" = "bun.lock" ]]; then
            if _n7merge_bun_lock_differs "$ours" "$src"; then
                regen_bun=1
            fi
            tier1=$((tier1 + 1))
            continue
        fi
        # Інші lock-файли: пофайловий merge-file дає лише шум — беремо версію src.
        if [[ "$bn" = "package-lock.json" || "$bn" = "pnpm-lock.yaml" || "$bn" = "yarn.lock" ]]; then
            mkdir -p "$(dirname "$rel")"
            git show "$src:$rel" > "$rel" 2> /dev/null
            echo "🔒 $rel: взято версію '$src_label' — перегенеруй відповідним пакетним менеджером."
            tier1=$((tier1 + 1))
            continue
        fi

        base_tmp=$(mktemp); ours_tmp=$(mktemp); theirs_tmp=$(mktemp)
        git show "$merge_base:$rel" > "$base_tmp" 2> /dev/null || : > "$base_tmp"
        git show "$src:$rel" > "$theirs_tmp" 2> /dev/null || : > "$theirs_tmp"
        if [[ -f "$rel" ]]; then cp "$rel" "$ours_tmp"; else : > "$ours_tmp"; fi

        # Delete/modify (детерміновано, БЕЗ 3-way і БЕЗ LLM): файл видалено на стороні ours (немає у
        # робочому дереві), але він існував у базі й змінений у src (інакше не потрапив би у
        # changed_files) — лишаємо версію src. Це ДЗЕРКАЛО обробки «видалено у src, але змінено в ours»
        # вище: modify-beats-delete — сторона з модифікацією перемагає видалення. Без цього git
        # merge-file дав би delete/modify-конфлікт з порожнім ours → маркери → LLM. Типовий кейс:
        # origin-реліз видалив (консумував) change-файл, а локально його редагували — reverse-delta
        # детерміновано зберігає локальну (src) версію.
        if [[ ! -f "$rel" ]] && git cat-file -e "$merge_base:$rel" 2> /dev/null; then
            mkdir -p "$(dirname "$rel")"
            cp "$theirs_tmp" "$rel"
            _n7merge_rescued "$rel" "$ours_label" "$src_label"
            tier1=$((tier1 + 1))
            rm -f "$base_tmp" "$ours_tmp" "$theirs_tmp"
            continue
        fi

        # --diff3 лишає base-секцію (|||||||) — її потребує mergiraf solve для реконструкції.
        # Коди: 0 — чисто, 1..254 — конфлікти (маркери), 255 — помилка (напр. бінарний).
        git merge-file --diff3 -p -L "поточна ($ours_label)" -L "база" -L "джерело ($src_label)" \\
            "$ours_tmp" "$base_tmp" "$theirs_tmp" > "$ours_tmp.merged" 2> /dev/null
        mf_rc=$?

        mkdir -p "$(dirname "$rel")"
        if [[ "$mf_rc" -eq 255 ]]; then
            cp "$theirs_tmp" "$rel"
            echo "⚠️ $rel: 3-way неможливий (ймовірно бінарний) — взято версію '$src_label'."
            tier1=$((tier1 + 1))
        else
            mv "$ours_tmp.merged" "$rel"
            if [[ "$mf_rc" -eq 0 ]]; then
                tier1=$((tier1 + 1))
            elif _n7merge_mergiraf_solve "$rel"; then
                # Tier 2: структурний авторезолвер повністю розв'язав файл.
                tier2=$((tier2 + 1))
            else
                # Tier 3: лишилися маркери — пре-знімок (для блоків) і у чергу до агента.
                pre=$(mktemp)
                cp "$rel" "$pre"
                t3_files+=("$rel")
                t3_pre+=("$pre")
                conflict_files="$conflict_files$rel
"
            fi
        fi
        rm -f "$base_tmp" "$ours_tmp" "$ours_tmp.merged" "$theirs_tmp"
    done <<< "$changed_files"

    # Tier 3: агент прибирає маркери; його per-file підсумок збираємо у файл (показуємо нижче).
    local rc=0 leftover="" agent_summary=""
    if [[ -n "$conflict_files" ]]; then
        agent_summary=$(mktemp)
        if ! _n7merge_resolve_with_agent "$conflict_files" "$ours" "$src" "$agent_summary"; then
            rc=1
        else
            leftover=$(_n7merge_files_with_markers "$conflict_files")
            [[ -n "$leftover" ]] && rc=1
        fi
    fi

    echo "📊 Підсумок мерджу (Unstaged):"
    echo "   Tier 1 (git):      $tier1 файл(ів)"
    echo "   Tier 2 (mergiraf): $tier2 файл(ів)"
    echo "   Tier 3 (LLM):      \${#t3_files[@]} файл(ів)"

    # Tier 3 деталізація — по кожному файлу: блок приймача, блок джерела, результат і коментар LLM.
    local i rel3
    for ((i = 1; i <= \${#t3_files[@]}; i++)); do
        rel3="\${t3_files[$i]}"
        pre="\${t3_pre[$i]}"
        echo ""
        echo "📄 $rel3"
        echo "   ── Приймач (поточна $ours_label):"
        _n7merge_block_ours "$pre" | sed 's/^/      /'
        echo "   ── Джерело ($src_label):"
        _n7merge_block_theirs "$pre" | sed 's/^/      /'
        echo "   ── Результат:"
        [[ -f "$rel3" ]] && diff "$pre" "$rel3" 2> /dev/null | sed -n 's/^> /      /p'
        rm -f "$pre"
    done

    if [[ -n "$agent_summary" && -s "$agent_summary" ]]; then
        echo ""
        echo "🤖 Коментар LLM (thinking):"
        sed 's/^/   /' "$agent_summary"
    fi
    [[ -n "$agent_summary" ]] && rm -f "$agent_summary"

    if [[ -n "$leftover" ]]; then
        echo "❌ Лишилися конфліктні маркери:"
        printf '%s\\n' "$leftover" | sed 's/^/   • /'
    elif [[ "$rc" -eq 1 ]]; then
        echo "❌ Інтелектуальний мерж не виконано."
    fi

    # bun.lock: bun install лише якщо regen_bun (lock відрізнявся від src), мерж успішний і досі різний.
    if [[ "$rc" -eq 0 && "$regen_bun" -eq 1 ]] && _n7merge_bun_lock_differs "$ours" "$src"; then
        echo "🔒 Перегенеровую bun.lock через bun install..."
        if command -v bun > /dev/null 2>&1; then
            if bun install > /dev/null 2>&1; then
                echo "✅ bun.lock перегенеровано."
            else
                echo "⚠️ bun install завершився з помилкою — перевір bun.lock вручну."
            fi
        else
            echo "⚠️ bun не знайдено — встанови залежності вручну (bun install)."
        fi
    fi

    return $rc
}
`

/**
 * Запускає zsh-скрипт з успадкованим stdio (потрібно для fzf/інтерактивного TTY і LLM-агента) і
 * чекає на завершення дочірнього процесу. Позиційні `argv` передаються скрипту як `$1, $2, …`
 * окремими елементами процес-argv (без shell-інтерполяції — тож без ризику ін'єкції).
 * @param {string} script тіло zsh-скрипту
 * @param {typeof spawn} [spawnFn] інжект `spawn` для тестів
 * @param {string[]} [argv] позиційні аргументи скрипту
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function runZsh(script, spawnFn = spawn, argv = []) {
  const shell = spawnFn('zsh', ['-c', script, 'npx @7n/n', ...argv], {
    stdio: 'inherit',
    env: { ...process.env, N7MERGE_RESOLVER: process.env.N7MERGE_RESOLVER || RESOLVER_PATH },
  })
  try {
    // once(emitter, 'exit') резолвиться аргументами події [code, signal] і відхиляється, якщо
    // емітнеться 'error' (напр. zsh не знайдено) — обидва кейси покрито без new Promise.
    const [code] = await once(shell, 'exit')
    return code ?? 0
  } catch (error) {
    process.stderr.write(`❌ Не вдалося запустити zsh: ${error.message}\n`)
    return 1
  }
}
