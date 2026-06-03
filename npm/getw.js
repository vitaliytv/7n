import { spawn } from 'node:child_process'
import { once } from 'node:events'

// zsh-функція getw: через fzf обираємо git-worktree з-під .worktrees/, комітимо там зміни
// тимчасовим комітом, накочуємо ЛИШЕ дельту цієї гілки (merge-base..target) у поточну гілку
// як unstaged, після чого видаляємо worktree і його гілку. Дельту переносимо через
// `git apply` (а не `git checkout <branch> -- .`), щоб не затерти файли, які змінювала тільки
// поточна гілка. При конфлікті НЕ падаємо: пробуємо `git apply --3way` (лишає конфліктні
// маркери) і доводимо мерж LLM-агентом — `claude -p` з фолбеком на `cursor-agent -p`. Worktree
// видаляється лише після успішного перенесення; якщо маркери лишились — зберігаємо worktree
// для ручного доведення. Запускаємо в zsh зі stdio:'inherit' — fzf потребує інтерактивного
// TTY, тож виконуємо через дочірній процес, а не через Node-API.
const ZSH_SCRIPT = `
_getw_resolve_with_agent() {
    local files="$1"
    local cur="$2"
    local tgt="$3"
    local prompt="У git-дереві після перенесення змін гілки '$tgt' у '$cur' лишилися конфліктні маркери (<<<<<<<, =======, >>>>>>>) у файлах:
$files

Розв'яжи кожен конфлікт, поєднавши наміри обох сторін так, щоб результат був коректним і робочим. Прибери ВСІ конфліктні маркери у цих файлах. Редагуй ЛИШЕ перелічені файли і НЕ запускай жодних git-команд (add/commit/reset/checkout)."

    if command -v claude > /dev/null 2>&1; then
        echo "🤖 Інтелектуальний мерж через claude -p..."
        claude -p "$prompt" --permission-mode acceptEdits --model "\${GETW_MERGE_MODEL:-sonnet}"
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

    local selected_wt_line=$(echo "❌_ВІДМІНА_\\n$wt_list" | fzf --delimiter="/" --with-nth="-1" --prompt="Оберіть worktree для перенесення змін: ")

    if [[ -z "$selected_wt_line" || "$selected_wt_line" == *"❌_ВІДМІНА_"* ]]; then
        echo "Дію скасовано. Всього найкращого! 👋✨"
        return 0
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

    # Переносимо лише дельту worktree-гілки (merge-base..target). git apply без --index кладе
    # зміни у робоче дерево незастейдженими і не чіпає файли поза патчем. При конфлікті НЕ падаємо:
    # пробуємо --3way (лишає конфліктні маркери), тоді доводимо мерж LLM-агентом.
    local patch_file
    patch_file=$(mktemp)
    git diff --binary "$merge_base" "$target_branch" > "$patch_file"

    if [[ ! -s "$patch_file" ]]; then
        rm -f "$patch_file"
        echo "ℹ️ Дельта порожня — переносити нічого."
    elif git apply --whitespace=nowarn "$patch_file"; then
        rm -f "$patch_file"
        echo "✅ Зміни накочено чисто (Unstaged)."
    else
        echo "⚠️ Чисте накочування не вдалося — пробую 3-way merge з конфліктними маркерами..."
        local apply3_ok=1
        git apply --3way --whitespace=nowarn "$patch_file" || apply3_ok=0
        rm -f "$patch_file"

        local conflicted=$(git diff --name-only --diff-filter=U)

        if [[ -z "$conflicted" ]]; then
            if [[ "$apply3_ok" -eq 0 ]]; then
                echo "❌ Не вдалося накотити зміни навіть 3-way merge — worktree '$target_branch' збережено."
                return 1
            fi
            git reset > /dev/null
            echo "✅ Зміни накочано 3-way merge без конфліктів (Unstaged)."
        else
            echo "🤖 Конфлікти у файлах:"
            echo "$conflicted" | sed 's/^/   • /'

            if ! _getw_resolve_with_agent "$conflicted" "$current_branch" "$target_branch"; then
                echo "❌ Інтелектуальний мерж не виконано — worktree '$target_branch' збережено для ручного перенесення."
                return 1
            fi

            local leftover=""
            local f
            for f in \${(f)conflicted}; do
                if [[ -f "$f" ]] && grep -qE '^(<<<<<<<|>>>>>>>)' "$f"; then
                    leftover="$leftover $f"
                fi
            done

            if [[ -n "$leftover" ]]; then
                echo "❌ Лишилися конфліктні маркери у:$leftover"
                echo "   worktree '$target_branch' збережено для ручного доведення."
                return 1
            fi

            git reset > /dev/null
            echo "✅ Конфлікти розв'язано агентом, зміни як Unstaged."
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
 * як unstaged (вибір через fzf) і прибирає цей worktree. При конфлікті пробує `git apply --3way`
 * і доводить мерж LLM-агентом (`claude -p`, фолбек `cursor-agent -p`); модель — через env
 * `GETW_MERGE_MODEL` / `GETW_MERGE_CURSOR_MODEL`. Потребує zsh та git; якщо fzf відсутній —
 * ставить його через `brew install fzf` (за наявності Homebrew).
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
