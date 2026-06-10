import { spawn } from 'node:child_process'

import { MERGE_ZSH_LIB, runZsh } from './merge.js'

// zsh-функція pull: спершу пробує справжній fast-forward (git merge --ff-only), і лише коли FF
// неможливий — робить reverse-delta тим самим спільним ядром `_n7merge_delta` (merge.js), що й getw.
// FF можливий, лише коли HEAD — предок origin/<branch> (історія не розійшлась). git сам пропускає
// чисте дерево та локальні правки у файлах, яких апдейт не чіпає (їх FF зберігає), і повертає
// non-zero, тільки якщо локальні зміни перетинаються з апдейтом.
// Reverse-delta (фолбек, коли FF неможливий — розбіжна історія АБО перетин правок): знімаємо ПОВНИЙ
// локальний стан (коміти + uncommitted) через `git stash create`, переводимо HEAD на origin
// (`git reset --hard`), і накладаємо локальну дельту merge-base(origin, backup)..backup назад у дерево
// як unstaged — тим самим _n7merge_delta, лише з оберненими ролями (ours=origin, src=знімок). Так HEAD
// = origin (чиста історія/SHA), а твоя робота лежить зверху незакоміченою → git status = up to date,
// pull ідемпотентний і чисто лягає під push. reset --hard страхуємо бекапом + trap на відкат.
// Конфлікти (перетин) резолвляться багаторівнево (apply → 3-way → mergiraf → агент).
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
    fi

    # FF неможливий — або історія розійшлась, або локальні зміни перетинаються з апдейтом. Робимо
    # reverse-delta: HEAD → origin (чиста історія/SHA), а ПОВНУ локальну роботу (коміти + uncommitted)
    # накладаємо назад як unstaged тим самим _n7merge_delta, лише з оберненими ролями
    # (ours=origin, src=знімок локального стану). Так pull стає «завершеним» (git status = up to date),
    # ідемпотентним і чисто лягає під push. reset --hard страхуємо бекапом + trap на відкат.
    echo "↩️  FF неможливий — reverse-delta: HEAD → origin/$branch, локальну роботу як unstaged..."

    # Знімок ПОВНОГО локального стану ДО reset: git stash create робить commit-знімок (HEAD-дерево +
    # staged + unstaged tracked) НЕ чіпаючи дерево. Якщо чисто — джерелом дельти стає сам HEAD.
    local old_head stash_sha backup_ref recover reverse_done=0
    old_head=$(git rev-parse HEAD)
    stash_sha=$(git stash create "n7pull: backup before reverse-delta ($branch)" 2> /dev/null)
    recover="git reset --hard $old_head"
    if [[ -n "$stash_sha" ]]; then
        git stash store -m "n7pull: backup before reverse-delta ($branch)" "$stash_sha" 2> /dev/null
        backup_ref="$stash_sha"
        recover="$recover && git stash apply $stash_sha"
    else
        backup_ref="$old_head"
    fi
    echo "🛟 Бекап локального стану збережено. Відкат: $recover"

    # На перерив (Ctrl-C / kill) до завершення reset+delta — автоматично відкочуємо до локального стану.
    trap 'if [[ "$reverse_done" -eq 0 ]]; then echo "⚠️ Перервано — відкочую до локального стану..."; git reset --hard "$old_head" > /dev/null 2>&1; [[ -n "$stash_sha" ]] && git stash apply "$stash_sha" > /dev/null 2>&1; fi' INT TERM

    if ! git reset --hard "origin/$branch" > /dev/null 2>&1; then
        trap - INT TERM
        echo "❌ Не вдалося перевести HEAD на origin/$branch — локальний стан недоторканий."
        return 1
    fi

    if ! _n7merge_delta "origin/$branch" "$backup_ref"; then
        reverse_done=1
        trap - INT TERM
        echo "❌ Reverse-delta мерж не завершено — розв'яжи конфлікти (git diff), потім закоміть."
        echo "   повний відкат до локального стану: $recover"
        return 1
    fi

    reverse_done=1
    trap - INT TERM
    echo "✅ Готово! HEAD на origin/$branch, локальну роботу накладено як unstaged — переглянь і закоміть. 🚀"
}
pull "$1"
`

/**
 * Підтягує `origin/<branch>`: `git fetch origin <branch>`, далі спершу пробує справжній
 * fast-forward (`git merge --ff-only`) — коли HEAD є предком origin/<branch> і локальні зміни не
 * перетинаються з апдейтом, HEAD просто переміщується вперед. Якщо FF неможливий (історія
 * розійшлась або локальні правки перетинаються), робить reverse-delta: знімає повний локальний стан
 * (`git stash create`), переводить HEAD на origin (`git reset --hard`) і накладає локальну дельту
 * (merge-base(origin, backup)..backup) назад як unstaged тим самим багаторівневим мерджем, що й getw
 * (`_n7merge_delta`, merge.js): `git apply` → `git merge-file --diff3` → `mergiraf solve` →
 * LLM-агент лише на залишок. Підсумок: HEAD = origin (чиста історія), локальна робота лежить зверху
 * незакоміченою; reset --hard страхується бекапом + trap на відкат. Гілка — `branch` або, якщо не
 * задано, поточна
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
