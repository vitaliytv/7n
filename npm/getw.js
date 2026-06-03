import { spawn } from 'node:child_process'
import { once } from 'node:events'

// zsh-функція getw: через fzf обираємо git-worktree з-під .worktrees/, комітимо там зміни
// тимчасовим комітом, накочуємо ЛИШЕ дельту цієї гілки (merge-base..target) у поточну гілку
// як unstaged, після чого видаляємо worktree і його гілку. Дельту переносимо через
// `git apply` (а не `git checkout <branch> -- .`), щоб не затерти файли, які змінювала тільки
// поточна гілка. Конфлікти резолвимо багаторівнево, від дешевого до дорогого:
//   Tier 0 — чистий `git apply` (без --index);
//   Tier 1 — пофайловий 3-way `git merge-file --diff3` (без індексу → без "does not match index").
//            кореневий bun.lock НЕ мержимо — `bun install` лише якщо він відрізняється від target;
//            інші lock-файли беруться з target;
//   Tier 2 — структурний AST-авторезолвер `mergiraf solve` (off через GETW_NO_MERGIRAF=1). Якщо
//            mergiraf немає — ставимо через `brew install mergiraf` (фолбек `cargo install`);
//   Tier 3 — LLM-агент (`claude -p`, фолбек `cursor-agent -p`) ЛИШЕ на залишок з маркерами.
// Розподіл ролей чіткий: СКРИПТ детерміновано готує конфлікти, авторезолвить, прибирає й виносить
// вердикт (чи лишились маркери); агент робить лише творчу частину — прибирає маркери, нічого не
// видаляє і не запускає git. Worktree видаляється лише коли маркерів не лишилось; інакше
// зберігаємо його. Запускаємо в zsh зі stdio:'inherit' — fzf потребує інтерактивного TTY, тож
// виконуємо через дочірній процес, а не через Node-API.
const ZSH_SCRIPT = `
# Викликає LLM-агента, щоб ПРИБРАТИ конфліктні маркери у вже наявних файлах. Агент нічого не
# видаляє і не запускає git — лише редагує перелічені файли; вердикт виносить скрипт окремо.
_getw_resolve_with_agent() {
    local files="$1"
    local cur="$2"
    local tgt="$3"
    local prompt="Під час 3-way merge гілки '$tgt' у '$cur' у цих файлах лишилися конфліктні маркери (<<<<<<<, =======, >>>>>>>):
$files

Для КОЖНОГО файлу розв'яжи всі конфлікти, поєднавши наміри обох сторін так, щоб результат був коректним і робочим, і прибери ВСІ конфліктні маркери (рядки <<<<<<<, =======, >>>>>>> разом з мітками гілок). Редагуй ЛИШЕ перелічені файли. НЕ створюй і НЕ видаляй файлів, НЕ запускай git-команд. Якщо файл — lock (напр. bun.lock) і надійно змержити неможливо, лиши версію '$tgt' без маркерів (його за потреби перегенерують окремо)."

    if command -v claude > /dev/null 2>&1; then
        echo "🤖 Інтелектуальний мерж через claude -p..."
        claude -p "$prompt" --permission-mode acceptEdits --allowedTools "Edit,Write,MultiEdit,Read" --model "\${GETW_MERGE_MODEL:-sonnet}"
        return $?
    fi

    if command -v cursor-agent > /dev/null 2>&1; then
        echo "🤖 Інтелектуальний мерж через cursor-agent -p..."
        cursor-agent -p --force --output-format text --model "\${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}" "$prompt"
        return $?
    fi

    echo "❌ Немає ні claude, ні cursor-agent у PATH — інтелектуальний мерж неможливий."
    return 1
}

# З newline-списку файлів ($1) друкує ті, що ще містять конфліктні маркери. Це детермінований
# вердикт скрипта: поки список непорожній — мерж не завершено.
_getw_files_with_markers() {
    local f
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        [[ -f "$f" ]] && grep -qE '^(<<<<<<<|>>>>>>>)' "$f" && echo "$f"
    done <<< "$1"
}

# Чи відрізняється кореневий bun.lock між поточною гілкою (робоче дерево або HEAD) і target.
# bun.lock у проєкті лише в корені репо. Повертає 0, якщо відрізняються; 1 — якщо однакові.
_getw_bun_lock_differs() {
    local cur="$1"
    local tgt="$2"
    local ours_tmp theirs_tmp
    ours_tmp=$(mktemp)
    theirs_tmp=$(mktemp)
    if [[ -f bun.lock ]]; then
        cp bun.lock "$ours_tmp"
    elif git show "$cur:bun.lock" > "$ours_tmp" 2> /dev/null; then
        :
    else
        : > "$ours_tmp"
    fi
    if git show "$tgt:bun.lock" > "$theirs_tmp" 2> /dev/null; then
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
# GETW_NO_MERGIRAF=1. Повертає 0, якщо файл повністю розв'язано (маркерів не лишилось).
_getw_mergiraf_solve() {
    local file="$1"
    [[ "\${GETW_NO_MERGIRAF:-0}" = "1" ]] && return 1
    command -v mergiraf > /dev/null 2>&1 || return 1
    mergiraf solve "$file" > /dev/null 2>&1
    ! grep -qE '^(<<<<<<<|>>>>>>>)' "$file"
}

# Гарантує наявність mergiraf (Tier 2). Якщо немає — ставить через brew (як fzf), з cargo як
# фолбеком. Вимикається GETW_NO_MERGIRAF=1. Повертає 0, якщо mergiraf зрештою доступний.
_getw_ensure_mergiraf() {
    [[ "\${GETW_NO_MERGIRAF:-0}" = "1" ]] && return 1
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

# Дістає опис із рядка "**Задача:**" у файлі-описі worktree (<wt_path>.md). Друкує порожньо,
# якщо файлу немає або рядка "**Задача:**" у ньому немає.
_getw_task_desc() {
    local md="$1" line rest
    [[ -f "$md" ]] || return 0
    while IFS= read -r line; do
        case "$line" in
            *'**Задача:**'*)
                rest="\${line#*'**Задача:**'}"
                while [[ "$rest" == [[:space:]]* ]]; do rest="\${rest#?}"; done
                print -r -- "$rest"
                return 0
                ;;
        esac
    done < "$md"
}

getw() {
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        echo "❌ Помилка: Ви не в Git репозиторії."
        return 1
    fi

    local current_wt_path=$(pwd)
    local current_branch=$(git branch --show-current)
    local wt_list=$(git worktree list | grep "/.worktrees/")

    if [[ -z "$wt_list" ]]; then
        echo "📭 У папці .worktrees не знайдено жодного робочого дерева."
        echo "Гарного дня! 👋"
        return 0
    fi

    if ! command -v fzf > /dev/null 2>&1; then
        echo "🔍 fzf не встановлено — ставлю через Homebrew (brew install fzf)..."
        if ! command -v brew > /dev/null 2>&1; then
            echo "❌ Homebrew (brew) не знайдено. Встанови fzf вручну: https://github.com/junegunn/fzf"
            return 1
        fi
        if ! brew install fzf; then
            echo "❌ Не вдалося встановити fzf через brew."
            return 1
        fi
    fi

    # Будуємо список для fzf: заголовок — назва директорії worktree, а під ним (якщо поруч є файл-опис
    # <wt_path>.md) — рядок "Задача: …" з нього. Елементи NUL-розділені (fzf --read0), бо містять
    # кілька рядків. Назву директорії використовуємо як ключ для зворотного мапінгу у рядок
    # git worktree list, звідки далі дістаємо шлях і гілку.
    typeset -A wt_by_name
    local -a fzf_items
    fzf_items=( '❌_ВІДМІНА_' )
    local wl wt_path wt_name task nl=$'\\n'
    while IFS= read -r wl; do
        [[ -z "$wl" ]] && continue
        wt_path=$(echo "$wl" | awk '{print $1}')
        wt_name="\${wt_path:t}"
        wt_by_name[$wt_name]="$wl"
        task=$(_getw_task_desc "$wt_path.md")
        if [[ -n "$task" ]]; then
            fzf_items+=( "$wt_name$nl   Задача: $task" )
        else
            fzf_items+=( "$wt_name" )
        fi
    done <<< "$wt_list"

    local selected=$(print -rN -- "\${fzf_items[@]}" | fzf --read0 --gap --prompt="Оберіть worktree для перенесення змін: ")

    if [[ -z "$selected" || "$selected" == "❌_ВІДМІНА_"* ]]; then
        echo "Дію скасовано. Всього найкращого! 👋✨"
        return 0
    fi

    wt_name=\${selected%%$nl*}
    local selected_wt_line="\${wt_by_name[$wt_name]}"
    if [[ -z "$selected_wt_line" ]]; then
        echo "❌ Не вдалося зіставити обраний worktree з його гілкою."
        return 1
    fi

    local target_wt_path=$(echo "$selected_wt_line" | awk '{print $1}')
    local target_branch=$(echo "$selected_wt_line" | awk -F'[][]' '{print $2}')

    if [[ -z "$target_branch" ]]; then
        echo "❌ Не вдалося визначити гілку."
        return 1
    fi

    echo "📦 Починаємо перенесення з ворктрі: $target_branch..."
    cd "$target_wt_path" || return 1
    git add -A

    if ! git diff --cached --quiet; then
        git commit -m "temp_merge_before_pull" --no-verify > /dev/null
    fi

    cd "$current_wt_path" || return 1
    echo "🔀 Накочуємо файли у поточну гілку ($current_branch) як Unstaged..."

    local merge_base=$(git merge-base "$current_branch" "$target_branch")
    if [[ -z "$merge_base" ]]; then
        echo "❌ Не вдалося визначити спільного предка (merge-base) гілок."
        return 1
    fi

    # Переносимо лише дельту worktree-гілки (merge-base..target) багаторівнево:
    #   Tier 0 — чисте git apply (без --index: незастейджено, файли поза патчем не чіпає);
    #   Tier 1 — пофайловий 3-way git merge-file --diff3 (без індексу → без "does not match index");
    #   Tier 2 — структурний авторезолвер mergiraf solve (опційний, якщо в PATH);
    #   Tier 3 — LLM-агент лише на те, що лишилось з маркерами.
    local patch_file
    patch_file=$(mktemp)
    git diff --binary "$merge_base" "$target_branch" > "$patch_file"

    if [[ ! -s "$patch_file" ]]; then
        rm -f "$patch_file"
        echo "ℹ️ Дельта порожня — переносити нічого."
    elif git apply --whitespace=nowarn "$patch_file"; then
        rm -f "$patch_file"
        echo "✅ Зміни накочано чисто (Unstaged)."
    else
        rm -f "$patch_file"
        echo "⚠️ Чисте накочування не вдалося — пофайловий 3-way merge (git merge-file)..."
        _getw_ensure_mergiraf

        local conflict_files=""
        local regen_bun=0
        local rel base_tmp ours_tmp theirs_tmp mf_rc bn
        # --no-renames: rename = delete(old)+add(new), обидва кейси покрито в циклі.
        local changed_files=$(git diff --no-renames --name-only "$merge_base" "$target_branch")

        while IFS= read -r rel; do
            [[ -z "$rel" ]] && continue

            # Видалено у target: прибираємо локально лише якщо поточна гілка файл не міняла.
            if ! git cat-file -e "$target_branch:$rel" 2> /dev/null; then
                if [[ -f "$rel" ]] && git show "$merge_base:$rel" 2> /dev/null | cmp -s - "$rel"; then
                    rm -f "$rel"
                elif [[ -f "$rel" ]]; then
                    echo "⚠️ $rel видалено у '$target_branch', але змінено локально — лишаю локальну версію."
                fi
                continue
            fi

            bn=$(basename "$rel")
            # bun.lock лише в корені репо — не мержимо; bun install лише якщо lock відрізняється від target.
            if [[ "$rel" = "bun.lock" ]]; then
                if _getw_bun_lock_differs "$current_branch" "$target_branch"; then
                    regen_bun=1
                    echo "🔒 bun.lock: відрізняється від '$target_branch' — перегенерую через bun install після мержу."
                else
                    echo "ℹ️ bun.lock: збігається з '$target_branch' — bun install не потрібен."
                fi
                continue
            fi
            # Інші lock-файли: пофайловий merge-file дає лише шум — беремо версію target.
            if [[ "$bn" = "package-lock.json" || "$bn" = "pnpm-lock.yaml" || "$bn" = "yarn.lock" ]]; then
                mkdir -p "$(dirname "$rel")"
                git show "$target_branch:$rel" > "$rel" 2> /dev/null
                echo "🔒 $rel: взято версію '$target_branch' — перегенеруй відповідним пакетним менеджером."
                continue
            fi

            base_tmp=$(mktemp); ours_tmp=$(mktemp); theirs_tmp=$(mktemp)
            git show "$merge_base:$rel" > "$base_tmp" 2> /dev/null || : > "$base_tmp"
            git show "$target_branch:$rel" > "$theirs_tmp" 2> /dev/null || : > "$theirs_tmp"
            if [[ -f "$rel" ]]; then cp "$rel" "$ours_tmp"; else : > "$ours_tmp"; fi

            # --diff3 лишає base-секцію (|||||||) — її потребує mergiraf solve для реконструкції.
            # Коди: 0 — чисто, 1..254 — конфлікти (маркери), 255 — помилка (напр. бінарний).
            git merge-file --diff3 -p -L "поточна ($current_branch)" -L "база" -L "worktree ($target_branch)" \\
                "$ours_tmp" "$base_tmp" "$theirs_tmp" > "$ours_tmp.merged" 2> /dev/null
            mf_rc=$?

            mkdir -p "$(dirname "$rel")"
            if [[ "$mf_rc" -eq 255 ]]; then
                cp "$theirs_tmp" "$rel"
                echo "⚠️ $rel: 3-way неможливий (ймовірно бінарний) — взято версію '$target_branch'."
            else
                mv "$ours_tmp.merged" "$rel"
                if [[ "$mf_rc" -ne 0 ]]; then
                    # Tier 2: структурний авторезолвер. Якщо повністю розв'язав — у конфлікти не додаємо.
                    if _getw_mergiraf_solve "$rel"; then
                        echo "   🧩 mergiraf розв'язав: $rel"
                    else
                        conflict_files="$conflict_files$rel
"
                    fi
                fi
            fi
            rm -f "$base_tmp" "$ours_tmp" "$ours_tmp.merged" "$theirs_tmp"
        done <<< "$changed_files"

        if [[ -z "$conflict_files" ]]; then
            echo "✅ 3-way merge без конфліктів (Unstaged)."
        else
            echo "🤖 Конфлікти (з маркерами) доводить агент:"
            printf '%s' "$conflict_files" | sed 's/^/   • /'

            if ! _getw_resolve_with_agent "$conflict_files" "$current_branch" "$target_branch"; then
                echo "❌ Інтелектуальний мерж не виконано — worktree '$target_branch' збережено для ручного перенесення."
                return 1
            fi

            local leftover=$(_getw_files_with_markers "$conflict_files")
            if [[ -n "$leftover" ]]; then
                echo "❌ Лишилися конфліктні маркери — worktree '$target_branch' збережено для ручного доведення:"
                printf '%s\\n' "$leftover" | sed 's/^/   • /'
                return 1
            fi

            echo "✅ Конфлікти розв'язано агентом, зміни як Unstaged."
            echo "   ⚠️ Перевір результат: git diff."
        fi

        # bun.lock: bun install лише якщо regen_bun (lock відрізнявся від target) і мерж успішний.
        if [[ "$regen_bun" -eq 1 ]] && _getw_bun_lock_differs "$current_branch" "$target_branch"; then
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
    fi

    echo "🗑️ Видаляємо ворктрі $target_branch..."

    if git worktree remove -f "$target_wt_path"; then
        git branch -D "$target_branch" > /dev/null
        echo "✅ Успішно! Зміни перенесено, ворктрі видалено. Роботу завершено! 🚀"
    else
        echo "⚠️ Зміни перенесено, але не вдалося видалити worktree."
    fi
}
getw
`

/**
 * Інтерактивно переносить дельту обраного git-worktree (merge-base..target) у поточну гілку
 * як unstaged (вибір через fzf) і прибирає цей worktree. Конфлікти резолвить багаторівнево:
 * `git merge-file --diff3` → `mergiraf solve` (AST; авто-встановлення через brew/cargo, off через
 * GETW_NO_MERGIRAF=1) → LLM-агент (`claude -p`, фолбек `cursor-agent -p`) лише на залишок; моделі —
 * через env `GETW_MERGE_MODEL` / `GETW_MERGE_CURSOR_MODEL`. Кореневий bun.lock не мержиться;
 * `bun install` лише якщо він відрізняється від target. Вердикт і прибирання — за скриптом, не за агентом. Worktree видаляється лише
 * коли маркерів не лишилось. Потребує zsh та git; fzf за відсутності ставиться через `brew install fzf`.
 * @param {typeof spawn} [spawnFn] - інжект `spawn` для тестів
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function getw(spawnFn = spawn) {
  const shell = spawnFn('zsh', ['-c', ZSH_SCRIPT], { stdio: 'inherit' })
  try {
    // once(emitter, 'exit') резолвиться аргументами події [code, signal] і відхиляється,
    // якщо емітнеться 'error' (напр. zsh не знайдено) — обидва кейси покрито без new Promise.
    const [code] = await once(shell, 'exit')
    return code ?? 0
  } catch (error) {
    process.stderr.write(`❌ Не вдалося запустити zsh: ${error.message}\n`)
    return 1
  }
}
