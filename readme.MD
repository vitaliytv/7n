# @7n/7 — monorepo

Bun monorepo. Публікований пакет — [`@7n/7`](npm/README.md) у `npm/`.

```bash
bun install        # встановити залежності
bun run start      # запустити CLI
bun run test       # тести (vitest)
bun run lint       # лінт усього репо
```

Tooling керується [`@nitra/cursor`](https://www.npmjs.com/package/@nitra/cursor): правила лежать у `.cursor/rules/`, конфіг — у `.n-cursor.json`. Оновити правила та `AGENTS.md`: `npx @nitra/cursor`.
