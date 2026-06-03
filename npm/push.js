import { spawn } from 'node:child_process'

import { MERGE_ZSH_LIB, runZsh } from './merge.js'

// zsh-функція push: бере ВСІ локальні коміти (origin/<branch>..HEAD) + усі зміни робочого дерева
// (staged/unstaged/untracked через `git add -A`), сквошить їх в ОДИН коміт на вершині
// origin/<branch>, генерує commit-меседж LLM-агентом (українською, Gitmoji + Monorepo) і пушить
// одним комітом. Якщо origin/<branch> має коміти, яких немає локально (дивергенція), — НЕ зупиняємось,
// а спершу автоматично підтягуємо їхню дельту через спільне ядро `_n7merge_delta` (merge.js, та сама
// механіка, що й pull), і лише тоді сквошимо — інакше squash затер би віддалені правки.
// Squash робимо через `git reset --soft <base>`: parent майбутнього коміту = base, тож push до
// наявної origin/<branch> завжди fast-forward. Підтвердження НЕ питаємо (за вимогою) — у stdout
// друкуємо subject коміту і список файлів. Коміт — з `--no-verify` (hooks тут не потрібні).
const ZSH_SCRIPT = `
${MERGE_ZSH_LIB}

# Генерує multi-line commit-меседж (українською, Gitmoji + Monorepo / Conventional Commits зі scope)
# LLM-агентом на основі застейдженої дельти. $1 — файл-вивід для меседжу, $2 — файл із git diff.
# Прогрес друкуємо у stderr, щоб у $1 потрапив ЛИШЕ сам меседж. Повертає код агента (0 — успіх).
_n7push_gen_message() {
    local out="$1" ctx="$2"
    local prompt="Згенеруй Git commit-меседж українською у стилі Gitmoji + Monorepo (Conventional Commits зі scope).

Формат:
  <emoji> <type>(<scope>): <короткий підсумок>

  - <пункт тіла: що саме змінено і навіщо>
  - <ще пункт за потреби, 1-5 загалом>

Правила:
- Мова — українська; технічні ідентифікатори, шляхи, команди та API-назви лишай англійською.
- <emoji> — доречний Gitmoji (✨ нова фіча, 🐛 фікс, ♻️ рефактор, 📝 докси, ✅ тести, 🔧 конфіг, ⬆️ оновлення залежностей, 🚀 деплой/реліз тощо).
- <type> — feat|fix|refactor|docs|test|chore|build за змістом змін.
- <scope> — назва workspace/каталогу, де основні зміни (напр. npm). Якщо їх кілька — обери головний.
- Subject (перший рядок) ≤ 72 символи, без крапки в кінці.
- Виведи ЛИШЕ сам меседж: subject, далі порожній рядок, далі тіло. БЕЗ преамбул, БЕЗ code fence, БЕЗ лапок навколо.

Зміни (git diff проти бази):
$(cat "$ctx")"

    if command -v claude > /dev/null 2>&1; then
        echo "🤖 Генерую commit-меседж через claude -p..." >&2
        claude -p "$prompt" --model "\${N7COMMIT_MODEL:-\${N7MERGE_MODEL:-\${GETW_MERGE_MODEL:-sonnet}}}" > "$out"
        return $?
    fi

    if command -v cursor-agent > /dev/null 2>&1; then
        echo "🤖 Генерую commit-меседж через cursor-agent -p..." >&2
        cursor-agent -p --force --output-format text --model "\${N7COMMIT_CURSOR_MODEL:-\${N7MERGE_CURSOR_MODEL:-\${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}}}" "$prompt" > "$out"
        return $?
    fi

    echo "❌ Немає ні claude, ні cursor-agent у PATH — згенерувати меседж неможливо." >&2
    return 1
}

push() {
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        echo "❌ Помилка: Ви не в Git репозиторії."
        return 1
    fi

    local branch="$1"
    if [[ -z "$branch" ]]; then
        branch=$(git branch --show-current)
    fi
    if [[ -z "$branch" ]]; then
        echo "❌ Не вдалося визначити гілку (detached HEAD?). Вкажи явно: npx @7n/n push <branch>"
        return 1
    fi

    echo "⬇️  Оновлюємо origin/$branch (git fetch)..."
    git fetch origin "$branch" 2> /dev/null

    # База для squash + чи це наявна origin-гілка (тоді push — fast-forward без -u).
    local base="" base_is_remote_branch=0
    if git rev-parse --verify --quiet "origin/$branch" > /dev/null; then
        base_is_remote_branch=1
        base="origin/$branch"
        # Дивергенція: origin/<branch> має коміти, яких немає в HEAD → автопідтягуємо їхню дельту.
        if ! git merge-base --is-ancestor "origin/$branch" HEAD; then
            echo "🔀 origin/$branch має нові коміти — підтягую їхню дельту (як pull)..."
            if ! _n7merge_delta "HEAD" "origin/$branch"; then
                echo "❌ Автопідтягування лишило конфлікти — розв'яжи вручну (git diff), потім повтори npx @7n/n push."
                return 1
            fi
        fi
    else
        echo "ℹ️  origin/$branch ще не існує — це буде перший push гілки."
        local default_ref=$(git rev-parse --abbrev-ref origin/HEAD 2> /dev/null)
        if [[ -n "$default_ref" ]] && git rev-parse --verify --quiet "$default_ref" > /dev/null; then
            base=$(git merge-base HEAD "$default_ref")
        fi
        if [[ -z "$base" ]]; then
            base=$(git rev-list --max-parents=0 HEAD | tail -1)
        fi
    fi

    echo "📦 Збираю всі зміни (git add -A)..."
    git add -A

    if git diff --cached --quiet "$base" --; then
        echo "✅ Немає змін відносно $base — пушити нічого. 👋"
        return 0
    fi

    # Сквошимо локальні коміти й застейджені зміни в один: parent = base.
    git reset --soft "$base"

    local ctx msg
    ctx=$(mktemp)
    msg=$(mktemp)
    git diff --cached > "$ctx"

    if ! _n7push_gen_message "$msg" "$ctx"; then
        echo "❌ Не вдалося згенерувати commit-меседж — нічого не закомічено й не запушено."
        rm -f "$ctx" "$msg"
        return 1
    fi

    # Прибираємо порожні рядки на краях, щоб git не лаявся на порожній subject.
    local subject=$(grep -m1 -v '^[[:space:]]*$' "$msg")
    if [[ -z "$subject" ]]; then
        echo "❌ Агент повернув порожній меседж — нічого не закомічено."
        rm -f "$ctx" "$msg"
        return 1
    fi

    echo ""
    echo "📝 Commit: $subject"
    echo "📂 Файли:"
    git diff --cached --name-status | sed 's/^/   /'
    echo ""

    if ! git commit --no-verify -F "$msg" > /dev/null; then
        echo "❌ git commit не вдався."
        rm -f "$ctx" "$msg"
        return 1
    fi
    rm -f "$ctx" "$msg"

    echo "🚀 Пушу origin/$branch одним комітом..."
    if [[ "$base_is_remote_branch" -eq 1 ]]; then
        if ! git push origin "$branch"; then
            echo "❌ git push не вдався (можливо, origin/$branch знову оновився — зроби npx @7n/n push ще раз)."
            return 1
        fi
    else
        if ! git push -u origin "$branch"; then
            echo "❌ git push не вдався."
            return 1
        fi
    fi

    echo "✅ Готово! Локальні зміни запушено одним комітом у origin/$branch. 🚀"
}
push "$1"
`

/**
 * Сквошить усі локальні коміти (`origin/<branch>..HEAD`) разом зі змінами робочого дерева
 * (`git add -A` — staged/unstaged/untracked) в ОДИН коміт на вершині `origin/<branch>`, генерує
 * commit-меседж LLM-агентом (українською, Gitmoji + Monorepo) і пушить його одним комітом. За
 * дивергенції (origin має коміти, яких немає локально) спершу автоматично підтягує їхню дельту тим
 * самим ядром, що й pull (`_n7merge_delta`, merge.js), тож віддалені правки не затираються; squash
 * робиться через `git reset --soft <base>`, тож push до наявної гілки — fast-forward. Підтвердження не
 * питає: у stdout друкує subject коміту і список файлів. Коміт — з `--no-verify`. Модель агента — env
 * `N7COMMIT_MODEL` (фолбек `N7MERGE_MODEL` → `GETW_MERGE_MODEL` → `sonnet`) і `N7COMMIT_CURSOR_MODEL`
 * (фолбек `N7MERGE_CURSOR_MODEL` → `GETW_MERGE_CURSOR_MODEL`). Потребує zsh, git і claude/cursor-agent.
 * @param {string} [branch] - назва гілки (дефолт — поточна)
 * @param {typeof spawn} [spawnFn] - інжект `spawn` для тестів
 * @returns {Promise<number>} exit code дочірнього zsh-процесу
 */
export async function push(branch, spawnFn = spawn) {
  return runZsh(ZSH_SCRIPT, spawnFn, [branch ?? ''])
}

export { ZSH_SCRIPT as PUSH_ZSH_SCRIPT }
