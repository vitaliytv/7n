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

Інтерактивно (через [`fzf`](https://github.com/junegunn/fzf)) обирає git-worktree з-під `.worktrees/`, переносить його зміни у **поточну** гілку як unstaged, після чого видаляє той worktree і його гілку. Потребує `zsh` та `git`; якщо `fzf` відсутній — автоматично ставить його через `brew install fzf` (потрібен Homebrew).

## Програмний API

```js
import { greet, run, version } from '@7n/7'

greet('7n') // "Привіт, 7n!"
version() // "0.1.0"
run(['greet', 'світ']) // друкує "Привіт, світ!", повертає 0
```
