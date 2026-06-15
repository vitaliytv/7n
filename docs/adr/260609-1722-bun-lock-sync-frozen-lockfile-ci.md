# bun.lock мусить бути синхронізований до пушу — блокує --frozen-lockfile у CI

**Status:** Accepted
**Date:** 2026-06-09

## Context and Problem Statement

Після коміту фіксу canonical сніпету в `nitra/cursor` workflow `npm-publish` падав ще на кроці `setup-bun-deps` з помилкою `error: lockfile had changes, but lockfile is frozen` (run 27190441665). `bun.lock` не був оновлений разом зі зміненим `package.json` (devDep `@nitra/cursor` змінений з `^4.0.0` на `^4.1.0`). До кроку `n-cursor release` виконання не доходило.

## Considered Options

* Додати оновлений `bun.lock` окремим комітом і тригернути `npm-publish` через change-файл у `npm/.changes/`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Додати оновлений `bun.lock` окремим комітом і тригернути `npm-publish` через change-файл у `npm/.changes/`", because workflow `npm-publish` у `nitra/cursor` тригериться лише на `npm/.changes/**`; re-run старого run взяв би застарілий tree без виправленого `bun.lock`.

### Consequences

* Good, because після push `bun.lock` + `npm/.changes/260609-1130.md` крок `setup-bun-deps` у run 27211204232 пройшов успішно.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Run 27190441665 (failure): `error: lockfile had changes, but lockfile is frozen` — зафіксовано в transcript.
- `bun install` (без `--frozen-lockfile`) показав: `Removed: 1`, lockfile розійшовся на 1 пакет (`@nitra/cursor` ^4.0.0 → ^4.1.0).
- Змінені файли: `bun.lock` (+3/−17 рядки), `npm/.changes/260609-1130.md`.
- `setup-bun-deps` використовує `bun install --frozen-lockfile` — стандарт у `nitra/cursor` CI.
