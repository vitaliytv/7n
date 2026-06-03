import { spawn } from 'node:child_process'

import { MERGE_ZSH_LIB, runZsh } from './merge.js'

// zsh-функція pull: тим самим delta-мерджем, що й getw (спільне ядро `_n7merge_delta` у
// merge.js), накочує у поточне робоче дерево ЛИШЕ дельту merge-base(HEAD, origin/<branch>)..
// origin/<branch> як unstaged — джерело тут не локальний worktree, а віддалена гілка (після
// git fetch). Переносимо дельту (а не весь зріз), тож локальні, ще не запушені правки tracked-
// файлів не затираються; конфлікти резолвляться багаторівнево (apply → 3-way → mergiraf → агент).
// Гілка — перший аргумент скрипту ($1) або поточна (git branch --show-current).
const ZSH_SCRIPT = `
${MERGE_ZSH_LIB}

pull() {
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        echo "❌ Помилка: Ви не в Git репозиторії."
        return 1
    fi

    local branch="$1"
    if [[ -z "$branch" ]]; then
        branch=$(git branch --show-current)
    fi
    if [[ -z "$branch" ]]; then
        echo "❌ Не вдалося визначити гілку (detached HEAD?). Вкажи явно: npx @7n/n pull <branch>"
        return 1
    fi

    echo "⬇️  Оновлюємо origin/$branch (git fetch)..."
    if ! git fetch origin "$branch"; then
        echo "❌ Не вдалося отримати origin/$branch (перевір назву гілки та доступ до remote)."
        return 1
    fi

    if ! git rev-parse --verify "origin/$branch" > /dev/null 2>&1; then
        echo "❌ Гілку origin/$branch не знайдено."
        return 1
    fi

    echo "🔀 Накочуємо дельту origin/$branch у поточне дерево як Unstaged..."

    if ! _n7merge_delta "HEAD" "origin/$branch"; then
        echo "❌ Мерж не завершено — розв'яжи конфлікти вручну (git diff), потім закоміть."
        return 1
    fi

    echo "✅ Готово! Дельта origin/$branch перенесена як unstaged — переглянь і закоміть. 🚀"
}
pull "$1"
`

/**
 * Накочує дельту `origin/<branch>` (merge-base(HEAD, origin/<branch>)..origin/<branch>) у поточне
 * робоче дерево як unstaged — тим самим багаторівневим мерджем, що й getw (`_n7merge_delta`,
 * merge.js): спершу `git fetch origin <branch>`, далі `git apply` → `git merge-file --diff3` →
 * `mergiraf solve` → LLM-агент лише на залишок. Переносить лише дельту, тож локальні незапушені
 * правки tracked-файлів не затираються. Гілка — `branch` або, якщо не задано, поточна
 * (`git branch --show-current`). Env-кнопки спільні з getw (`N7MERGE_MODEL` / `N7MERGE_NO_MERGIRAF`,
 * backward-фолбек на `GETW_*`). Потребує zsh та git.
 * @param {string} [branch] - назва гілки (дефолт — поточна)
 * @param {typeof spawn} [spawnFn] - інжект `spawn` для тестів
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function pull(branch, spawnFn = spawn) {
  return runZsh(ZSH_SCRIPT, spawnFn, [branch ?? ''])
}
