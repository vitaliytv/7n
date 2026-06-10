import { spawn } from 'node:child_process'

import { MERGE_ZSH_LIB, runZsh } from './merge.js'

// zsh-функція pull: спершу пробує справжній fast-forward (git merge --ff-only), і лише коли FF
// неможливий — падає на delta-мердж, тим самим спільним ядром `_n7merge_delta` (merge.js), що й getw.
// FF можливий, лише коли HEAD — предок origin/<branch> (історія не розійшлась). git сам пропускає
// чисте дерево та локальні правки у файлах, яких апдейт не чіпає (їх FF зберігає), і повертає
// non-zero, тільки якщо локальні зміни перетинаються з апдейтом — тоді переходимо на дельта-мердж.
// Окремий stash не потрібен: FF або проходить (і зберігає неконфліктні правки), або чесно
// відмовляється — а перетин розрулює дельта-мердж, краще за сліпий stash pop.
// Delta-мердж накочує у поточне дерево ЛИШЕ дельту merge-base(HEAD, origin/<branch>)..origin/<branch>
// як unstaged — джерело тут не локальний worktree, а віддалена гілка (після git fetch). Переносимо
// дельту (а не весь зріз), тож локальні, ще не запушені правки tracked-файлів не затираються;
// конфлікти резолвляться багаторівнево (apply → 3-way → mergiraf → агент).
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

    # Уже актуально — origin/<branch> збігається з HEAD.
    if [[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch")" ]]; then
        echo "✅ Вже актуально — origin/$branch збігається з HEAD."
        return 0
    fi

    # FF можливий, лише коли HEAD — предок origin/<branch> (історія не розійшлась). git сам збереже
    # неконфліктні локальні правки й поверне non-zero, тільки якщо вони перетинаються з апдейтом.
    if git merge-base --is-ancestor HEAD "origin/$branch"; then
        echo "⏩ Fast-forward HEAD → origin/$branch..."
        if git merge --ff-only "origin/$branch"; then
            echo "✅ Готово! HEAD переміщено на origin/$branch (fast-forward). 🚀"
            return 0
        fi
        echo "↩️  FF неможливий (локальні зміни перетинаються з апдейтом) — переходжу на дельта-мердж..."
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
 * Підтягує `origin/<branch>`: `git fetch origin <branch>`, далі спершу пробує справжній
 * fast-forward (`git merge --ff-only`) — коли HEAD є предком origin/<branch> і локальні зміни не
 * перетинаються з апдейтом, HEAD просто переміщується вперед. Лише якщо FF неможливий (історія
 * розійшлась або локальні правки перетинаються), падає на дельту `origin/<branch>`
 * (merge-base(HEAD, origin/<branch>)..origin/<branch>) тим самим багаторівневим мерджем, що й getw
 * (`_n7merge_delta`, merge.js): `git apply` → `git merge-file --diff3` → `mergiraf solve` →
 * LLM-агент лише на залишок. Переносить лише дельту, тож локальні незапушені правки tracked-файлів
 * не затираються. Гілка — `branch` або, якщо не задано, поточна
 * (`git branch --show-current`). Env-кнопки спільні з getw (`N7MERGE_MODEL` / `N7MERGE_NO_MERGIRAF`,
 * backward-фолбек на `GETW_*`). Потребує zsh та git.
 * @param {string} [branch] - назва гілки (дефолт — поточна)
 * @param {typeof spawn} [spawnFn] - інжект `spawn` для тестів
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function pull(branch, spawnFn = spawn) {
  return runZsh(ZSH_SCRIPT, spawnFn, [branch ?? ''])
}

export { ZSH_SCRIPT as PULL_ZSH_SCRIPT }
