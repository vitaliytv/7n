import { spawn } from 'node:child_process'
import { once } from 'node:events'

// Спільне ядро delta-мерджу для getw і pull. Обидві команди переносять у поточне робоче дерево
// як unstaged ЛИШЕ дельту merge-base(ours, src)..src (а не весь зріз src через `git checkout`), щоб
// не затирати файли, які поточна сторона змінювала самостійно. Різниця лише в джерелі (`src`):
// getw бере локальну worktree-гілку, pull — origin/<branch>. Конфлікти резолвимо багаторівнево:
//   Tier 0 — чистий `git apply` (без --index);
//   Tier 1 — пофайловий 3-way `git merge-file --diff3` (без індексу → без "does not match index");
//   Tier 2 — структурний AST-авторезолвер `mergiraf solve` (off через N7MERGE_NO_MERGIRAF=1, авто-
//            встановлення через brew/cargo);
//   Tier 3 — LLM-агент (`claude -p`, фолбек `cursor-agent -p`) ЛИШЕ на залишок з маркерами.
// Перед перенесенням ядро робить pre-flight знімок незакомічених змін через `git stash create`
// (commit-знімок без чіпання робочого дерева) і кладе його у stash-список — точка відкату, якщо
// мердж чи Tier-3-агент щось зіпсує.
// Розподіл ролей: СКРИПТ детерміновано готує конфлікти, авторезолвить, виносить вердикт (чи лишились
// маркери) і регенерує bun.lock; агент робить лише творчу частину — прибирає маркери (нічого не
// видаляє, git не запускає) і друкує per-file підсумок у stdout. Env-кнопки (нейтральний префікс
// N7MERGE_, із backward-фолбеком на
// історичні GETW_): N7MERGE_MODEL (фолбек GETW_MERGE_MODEL), N7MERGE_CURSOR_MODEL
// (фолбек GETW_MERGE_CURSOR_MODEL), N7MERGE_NO_MERGIRAF (фолбек GETW_NO_MERGIRAF).
//
// Фрагмент експортуємо як рядок (а не виконуваний модуль), бо самі команди — це zsh-скрипти, що
// потребують інтерактивного TTY (fzf/агент); кожна вставляє цей блок у свій ZSH_SCRIPT і викликає
// `_n7merge_delta <ours_ref> <src_ref>`.
export const MERGE_ZSH_LIB = `
# Викликає LLM-агента, щоб ПРИБРАТИ конфліктні маркери у вже наявних файлах. Агент нічого не
# видаляє і не запускає git — лише редагує перелічені файли й друкує per-file підсумок (що хотіла
# кожна сторона і як примирено) у stdout; вердикт (чи лишились маркери) виносить скрипт окремо.
# $1 — newline-список файлів, $2 — ours-ref (мітка), $3 — src-ref (мітка).
_n7merge_resolve_with_agent() {
    local files="$1"
    local ours="$2"
    local src="$3"
    local prompt="Під час 3-way merge '$src' у '$ours' у цих файлах лишилися конфліктні маркери (<<<<<<<, =======, >>>>>>>):
$files

Для КОЖНОГО файлу розв'яжи всі конфлікти, поєднавши наміри обох сторін так, щоб результат був коректним і робочим, і прибери ВСІ конфліктні маркери (рядки <<<<<<<, =======, >>>>>>> разом з мітками гілок). Редагуй ЛИШЕ перелічені файли. НЕ створюй і НЕ видаляй файлів, НЕ запускай git-команд. Якщо файл — lock (напр. bun.lock) і надійно змержити неможливо, лиши версію '$src' без маркерів (його за потреби перегенерують окремо).

Наприкінці надрукуй (у відповіді, НЕ у файли) короткий підсумок по КОЖНОМУ файлу: 1-2 рядки — що хотіла кожна сторона у конфлікті і як саме ти це примирив."

    if command -v claude > /dev/null 2>&1; then
        echo "🤖 Інтелектуальний мерж через claude -p..."
        claude -p "$prompt" --permission-mode acceptEdits --allowedTools "Edit,Write,MultiEdit,Read" --model "\${N7MERGE_MODEL:-\${GETW_MERGE_MODEL:-sonnet}}"
        return $?
    fi

    if command -v cursor-agent > /dev/null 2>&1; then
        echo "🤖 Інтелектуальний мерж через cursor-agent -p..."
        cursor-agent -p --force --output-format text --model "\${N7MERGE_CURSOR_MODEL:-\${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}}" "$prompt"
        return $?
    fi

    echo "❌ Немає ні claude, ні cursor-agent у PATH — інтелектуальний мерж неможливий."
    return 1
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

# Ядро: переносить дельту merge-base(ours, src)..src у поточне робоче дерево як unstaged.
# $1 — ours_ref (поточна сторона: гілка або HEAD), $2 — src_ref (джерело: worktree-гілка або
# origin/<branch>). Багаторівнево: git apply → git merge-file --diff3 → mergiraf → LLM-агент.
# Повертає 0, якщо дельту перенесено без невирішених маркерів; 1 — якщо лишились конфлікти/помилка.
_n7merge_delta() {
    local ours="$1"
    local src="$2"

    # Pre-flight знімок незакомічених змін: git stash create робить commit-знімок (staged+unstaged
    # tracked) НЕ чіпаючи робоче дерево й нічого не очищаючи — це чистий бекап на випадок, якщо мердж
    # чи Tier-3-агент щось зіпсує. На чистому дереві create нічого не друкує — тоді крок пропускаємо.
    local backup_sha
    backup_sha=$(git stash create "n7merge: backup before delta ($ours <- $src)" 2> /dev/null)
    if [[ -n "$backup_sha" ]]; then
        git stash store -m "n7merge: backup before delta ($ours <- $src)" "$backup_sha" 2> /dev/null
        echo "🛟 Бекап незакомічених змін збережено: git stash apply $backup_sha (відновити) · git stash drop (прибрати)"
    fi

    local merge_base=$(git merge-base "$ours" "$src")
    if [[ -z "$merge_base" ]]; then
        echo "❌ Не вдалося визначити спільного предка (merge-base) $ours і $src."
        return 1
    fi

    local patch_file
    patch_file=$(mktemp)
    git diff --binary "$merge_base" "$src" > "$patch_file"

    if [[ ! -s "$patch_file" ]]; then
        rm -f "$patch_file"
        echo "ℹ️ Дельта порожня — переносити нічого."
        return 0
    fi
    if git apply --whitespace=nowarn "$patch_file"; then
        rm -f "$patch_file"
        echo "✅ Зміни накочано чисто (Unstaged)."
        return 0
    fi
    rm -f "$patch_file"
    echo "⚠️ Чисте накочування не вдалося — пофайловий 3-way merge (git merge-file)..."
    _n7merge_ensure_mergiraf

    local conflict_files=""
    local regen_bun=0
    local rel base_tmp ours_tmp theirs_tmp mf_rc bn
    # --no-renames: rename = delete(old)+add(new), обидва кейси покрито в циклі.
    local changed_files=$(git diff --no-renames --name-only "$merge_base" "$src")

    while IFS= read -r rel; do
        [[ -z "$rel" ]] && continue

        # Видалено у src: прибираємо локально лише якщо поточна сторона файл не міняла.
        if ! git cat-file -e "$src:$rel" 2> /dev/null; then
            if [[ -f "$rel" ]] && git show "$merge_base:$rel" 2> /dev/null | cmp -s - "$rel"; then
                rm -f "$rel"
            elif [[ -f "$rel" ]]; then
                echo "⚠️ $rel видалено у '$src', але змінено локально — лишаю локальну версію."
            fi
            continue
        fi

        bn=$(basename "$rel")
        # bun.lock лише в корені репо — не мержимо; bun install лише якщо lock відрізняється від src.
        if [[ "$rel" = "bun.lock" ]]; then
            if _n7merge_bun_lock_differs "$ours" "$src"; then
                regen_bun=1
                echo "🔒 bun.lock: відрізняється від '$src' — перегенерую через bun install після мержу."
            else
                echo "ℹ️ bun.lock: збігається з '$src' — bun install не потрібен."
            fi
            continue
        fi
        # Інші lock-файли: пофайловий merge-file дає лише шум — беремо версію src.
        if [[ "$bn" = "package-lock.json" || "$bn" = "pnpm-lock.yaml" || "$bn" = "yarn.lock" ]]; then
            mkdir -p "$(dirname "$rel")"
            git show "$src:$rel" > "$rel" 2> /dev/null
            echo "🔒 $rel: взято версію '$src' — перегенеруй відповідним пакетним менеджером."
            continue
        fi

        base_tmp=$(mktemp); ours_tmp=$(mktemp); theirs_tmp=$(mktemp)
        git show "$merge_base:$rel" > "$base_tmp" 2> /dev/null || : > "$base_tmp"
        git show "$src:$rel" > "$theirs_tmp" 2> /dev/null || : > "$theirs_tmp"
        if [[ -f "$rel" ]]; then cp "$rel" "$ours_tmp"; else : > "$ours_tmp"; fi

        # --diff3 лишає base-секцію (|||||||) — її потребує mergiraf solve для реконструкції.
        # Коди: 0 — чисто, 1..254 — конфлікти (маркери), 255 — помилка (напр. бінарний).
        git merge-file --diff3 -p -L "поточна ($ours)" -L "база" -L "джерело ($src)" \\
            "$ours_tmp" "$base_tmp" "$theirs_tmp" > "$ours_tmp.merged" 2> /dev/null
        mf_rc=$?

        mkdir -p "$(dirname "$rel")"
        if [[ "$mf_rc" -eq 255 ]]; then
            cp "$theirs_tmp" "$rel"
            echo "⚠️ $rel: 3-way неможливий (ймовірно бінарний) — взято версію '$src'."
        else
            mv "$ours_tmp.merged" "$rel"
            if [[ "$mf_rc" -ne 0 ]]; then
                # Tier 2: структурний авторезолвер. Якщо повністю розв'язав — у конфлікти не додаємо.
                if _n7merge_mergiraf_solve "$rel"; then
                    echo "   🧩 mergiraf розв'язав: $rel"
                else
                    conflict_files="$conflict_files$rel
"
                fi
            fi
        fi
        rm -f "$base_tmp" "$ours_tmp" "$ours_tmp.merged" "$theirs_tmp"
    done <<< "$changed_files"

    local rc=0
    if [[ -z "$conflict_files" ]]; then
        echo "✅ 3-way merge без конфліктів (Unstaged)."
    else
        echo "🤖 Конфлікти (з маркерами) доводить агент:"
        printf '%s' "$conflict_files" | sed 's/^/   • /'

        if ! _n7merge_resolve_with_agent "$conflict_files" "$ours" "$src"; then
            echo "❌ Інтелектуальний мерж не виконано."
            rc=1
        else
            local leftover=$(_n7merge_files_with_markers "$conflict_files")
            if [[ -n "$leftover" ]]; then
                echo "❌ Лишилися конфліктні маркери:"
                printf '%s\\n' "$leftover" | sed 's/^/   • /'
                rc=1
            else
                echo "✅ Конфлікти розв'язано агентом, зміни як Unstaged."
                echo "   ⚠️ Перевір результат: git diff."
            fi
        fi
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
  const shell = spawnFn('zsh', ['-c', script, 'npx @7n/n', ...argv], { stdio: 'inherit' })
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
