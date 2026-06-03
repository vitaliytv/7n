# @7n/7

CLI-утиліта `@7n/7` (Bun monorepo).

## Встановлення

```bash
bun add @7n/7
# або глобально
npm i -g @7n/7
```

## Використання

```bash
n-7 greet "світ"   # Привіт, світ!
n-7 --version
n-7 --help
```

### `getw` — перенести зміни з worktree

```bash
npx @7n/7 getw
```

Інтерактивно (через [`fzf`](https://github.com/junegunn/fzf)) обирає git-worktree з-під `.worktrees/`, переносить **лише його дельту** (від спільного merge-base) у **поточну** гілку як unstaged, після чого видаляє той worktree і його гілку. Файли, які змінювала тільки поточна гілка, не зачіпаються.

При конфлікті перенесення **не падає**: виконується `git apply --3way` (з конфліктними маркерами), після чого мерж доводить LLM-агент — `claude -p`, а за його відсутності `cursor-agent -p`. Модель задається env-змінними `GETW_MERGE_MODEL` (default `sonnet`) і `GETW_MERGE_CURSOR_MODEL`. Якщо агент не прибрав усі маркери або жодного CLI немає в `PATH` — worktree зберігається для ручного доведення.

Потребує `zsh` та `git`; якщо `fzf` відсутній — автоматично ставить його через `brew install fzf` (потрібен Homebrew).

## Програмний API

```js
import { greet, run, version } from '@7n/7'

greet('7n') // "Привіт, 7n!"
version() // "0.1.0"
run(['greet', 'світ']) // друкує "Привіт, світ!", повертає 0
```
