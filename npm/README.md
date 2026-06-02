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

## Програмний API

```js
import { greet, run, version } from '@7n/7'

greet('7n') // "Привіт, 7n!"
version() // "0.1.0"
run(['greet', 'світ']) // друкує "Привіт, світ!", повертає 0
```
