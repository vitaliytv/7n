import { spawn } from 'node:child_process'

import { MERGE_ZSH_LIB, runZsh } from './merge.js'

// zsh-функція getw: через fzf обираємо git-worktree з-під .worktrees/, комітимо там зміни
// тимчасовим комітом і накочуємо ЛИШЕ дельту цієї гілки (merge-base..target) у поточну гілку як
// unstaged через спільне ядро `_n7merge_delta` (git apply → 3-way merge-file → mergiraf → агент;
// merge.js), після чого видаляємо worktree і його гілку. Worktree видаляємо лише коли мерж без
// невирішених маркерів; інакше зберігаємо для ручного доведення. Запускаємо в zsh зі
// stdio:'inherit' — fzf потребує інтерактивного TTY, тож виконуємо через дочірній процес.
const ZSH_SCRIPT = `
${MERGE_ZSH_LIB}

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

# Друкує дату й час СТВОРЕННЯ worktree (YYYY-MM-DD HH:MM) — birth time директорії, тобто момент
# git worktree add (macOS-stat). Якщо birth time недоступний — падаємо на mtime директорії.
_getw_created() {
    local dir="$1" t
    [[ -d "$dir" ]] || return 0
    t=$(stat -f '%SB' -t '%Y-%m-%d %H:%M' "$dir" 2>/dev/null)
    [[ -z "$t" || "$t" == '-' ]] && t=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$dir" 2>/dev/null)
    print -r -- "$t"
}

# Друкує дату й час ОСТАННЬОЇ ЗМІНИ у worktree (YYYY-MM-DD HH:MM) — mtime найсвіжішого файлу
# (без .git та node_modules), бо це відображає реальну активність. Якщо файлів немає — падаємо
# на mtime самої директорії.
_getw_modified() {
    local dir="$1" newest t
    [[ -d "$dir" ]] || return 0
    newest=$(find "$dir" -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -print0 2>/dev/null \\
        | xargs -0 stat -f '%m' 2>/dev/null | sort -rn | head -1)
    if [[ -n "$newest" ]]; then
        t=$(date -r "$newest" '+%Y-%m-%d %H:%M' 2>/dev/null)
    else
        t=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$dir" 2>/dev/null)
    fi
    print -r -- "$t"
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
    local wl wt_path wt_name task created modified item nl=$'\\n'
    while IFS= read -r wl; do
        [[ -z "$wl" ]] && continue
        wt_path=$(echo "$wl" | awk '{print $1}')
        wt_name="\${wt_path:t}"
        wt_by_name[$wt_name]="$wl"
        task=$(_getw_task_desc "$wt_path.md")
        created=$(_getw_created "$wt_path")
        modified=$(_getw_modified "$wt_path")
        item="$wt_name"
        [[ -n "$task" ]] && item="$item$nl   Задача: $task"
        [[ -n "$created" ]] && item="$item$nl   🕒 Створено: $created"
        [[ -n "$modified" ]] && item="$item$nl   ✏️  Змінено:  $modified"
        fzf_items+=( "$item" )
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
    echo "🔀 Накочуємо дельту worktree-гілки у поточну гілку ($current_branch) як Unstaged..."

    if ! _n7merge_delta "$current_branch" "$target_branch"; then
        echo "❌ Мерж не завершено — worktree '$target_branch' збережено для ручного доведення."
        return 1
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
 * як unstaged (вибір через fzf) і прибирає цей worktree. Спільне ядро мерджу — `_n7merge_delta`
 * (merge.js): `git apply` → `git merge-file --diff3` → `mergiraf solve` → LLM-агент лише на
 * залишок; моделі — через env `N7MERGE_MODEL` / `N7MERGE_CURSOR_MODEL` (backward-фолбек на
 * `GETW_MERGE_MODEL` / `GETW_MERGE_CURSOR_MODEL`), mergiraf off через `N7MERGE_NO_MERGIRAF=1`
 * (фолбек `GETW_NO_MERGIRAF`). Worktree видаляється лише коли невирішених маркерів не лишилось. Потребує
 * zsh та git; fzf за відсутності ставиться через `brew install fzf`.
 * @param {typeof spawn} [spawnFn] - інжект `spawn` для тестів
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function getw(spawnFn = spawn) {
  return runZsh(ZSH_SCRIPT, spawnFn)
}
