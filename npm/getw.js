import { spawn } from 'node:child_process'
import { once } from 'node:events'

// zsh-функція getw: через fzf обираємо git-worktree з-під .worktrees/, комітимо там зміни
// тимчасовим комітом, накочуємо ЛИШЕ дельту цієї гілки (merge-base..target) у поточну гілку
// як unstaged, після чого видаляємо worktree і його гілку. Дельту переносимо через
// `git apply` (а не `git checkout <branch> -- .`), щоб не затерти файли, які змінювала тільки
// поточна гілка. Спершу пробуємо чисте `git apply`; якщо не лягло — пофайловий 3-way через
// `git merge-file` (працює лише по файлах, БЕЗ індексу, тож немає помилок "does not match index").
// Розподіл ролей чіткий: СКРИПТ детерміновано готує конфлікти (ставить маркери), прибирає й
// виносить вердикт (чи лишились маркери), а LLM-агент (`claude -p`, фолбек `cursor-agent -p`)
// робить лише творчу частину — прибирає маркери. Агент нічого не видаляє і не запускає git.
// Worktree видаляється лише коли маркерів не лишилось; інакше зберігаємо його для ручного
// доведення. Запускаємо в zsh зі stdio:'inherit' — fzf потребує інтерактивного TTY, тож
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

    # Переносимо лише дельту worktree-гілки (merge-base..target). Спершу — чисте git apply (без
    # --index: незастейджено, файли поза патчем не чіпає). Якщо не лягло — пофайловий 3-way через
    # git merge-file (працює лише по файлах, без індексу, тож без "does not match index").
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
        rm -f "$patch_file"
        echo "⚠️ Чисте накочування не вдалося — пофайловий 3-way merge (git merge-file)..."

        local conflict_files=""
        local rel base_tmp ours_tmp theirs_tmp mf_rc
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

            base_tmp=$(mktemp); ours_tmp=$(mktemp); theirs_tmp=$(mktemp)
            git show "$merge_base:$rel" > "$base_tmp" 2> /dev/null || : > "$base_tmp"
            git show "$target_branch:$rel" > "$theirs_tmp" 2> /dev/null || : > "$theirs_tmp"
            if [[ -f "$rel" ]]; then cp "$rel" "$ours_tmp"; else : > "$ours_tmp"; fi

            # merge-file: 0 — чисто, 1..254 — є конфлікти (маркери), 255 — помилка (напр. бінарний).
            git merge-file -p -L "поточна ($current_branch)" -L "база" -L "worktree ($target_branch)" \\
                "$ours_tmp" "$base_tmp" "$theirs_tmp" > "$ours_tmp.merged" 2> /dev/null
            mf_rc=$?

            mkdir -p "$(dirname "$rel")"
            if [[ "$mf_rc" -eq 255 ]]; then
                cp "$theirs_tmp" "$rel"
                echo "⚠️ $rel: 3-way неможливий (ймовірно бінарний) — взято версію '$target_branch'."
            else
                mv "$ours_tmp.merged" "$rel"
                [[ "$mf_rc" -ne 0 ]] && conflict_files="$conflict_files$rel
"
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
            echo "   ⚠️ Перевір результат: git diff (lock-файли за потреби перегенеруй, напр. bun install)."
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
 * як unstaged (вибір через fzf) і прибирає цей worktree. При конфлікті робить пофайловий 3-way
 * (`git merge-file`) і доводить маркери LLM-агентом (`claude -p`, фолбек `cursor-agent -p`);
 * модель — через env `GETW_MERGE_MODEL` / `GETW_MERGE_CURSOR_MODEL`. Вердикт (чи лишились
 * маркери) і прибирання — за скриптом, не за агентом. Worktree видаляється лише коли маркерів
 * не лишилось. Потребує zsh та git; якщо fzf відсутній — ставить його через `brew install fzf`
 * (за наявності Homebrew).
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
