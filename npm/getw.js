import { spawn } from 'node:child_process'
import { once } from 'node:events'

// zsh-функція getw: через fzf обираємо git-worktree з-під .worktrees/, комітимо там зміни
// тимчасовим комітом, накочуємо файли цієї гілки у поточну гілку як unstaged, після чого
// видаляємо worktree і його гілку. Запускаємо в zsh зі stdio:'inherit' — fzf потребує
// інтерактивного TTY, тож виконуємо через дочірній процес, а не через Node-API.
const ZSH_SCRIPT = `
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

    if ! git checkout "$target_branch" -- .; then
        echo "❌ Помилка при виконанні git checkout."
        return 1
    fi

    git reset . > /dev/null
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
 * Інтерактивно переносить зміни з обраного git-worktree у поточну гілку (вибір через fzf)
 * і прибирає цей worktree. Потребує zsh, git і fzf на машині користувача.
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
