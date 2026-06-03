# `publishConfig.access: "public"` для scoped-пакета npm

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Спроба `npm publish` для пакета `@7n/n` завершилась помилкою `E402 Payment Required — You must sign up for private packages`. npm за замовчуванням вважає scoped-пакети (`@scope/...`) приватними, що потребує платного плану.

## Considered Options

* Передавати `--access public` при кожному виклику `npm publish`
* Закріпити `"publishConfig": { "access": "public" }` у `package.json`

## Decision Outcome

Chosen option: "Закріпити `publishConfig` у `package.json`", because це зберігає налаштування в репо і не вимагає пам'ятати флаг при кожному `publish`, включно з CI.

### Consequences

* Good, because `npm publish --dry-run` підтвердив `Publishing to https://registry.npmjs.org/ with tag latest and public access` — помилка E402 більше не виникає.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

* Файл: `npm/package.json`, поле `"publishConfig": { "access": "public" }`
* Перевірка: `npm pkg get publishConfig` → `{ "@7n/n": { "access": "public" } }`
* Альтернативна разова команда: `npm publish --access public`
