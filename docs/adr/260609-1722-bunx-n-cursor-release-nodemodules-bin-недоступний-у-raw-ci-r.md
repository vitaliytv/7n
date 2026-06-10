---
session: ad333f3d-ec6d-4010-bb52-5a2c0641f4e4
captured: 2026-06-09T17:22:46+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/ad333f3d-ec6d-4010-bb52-5a2c0641f4e4.jsonl
---

Файлова система вимагає явного дозволу для нового файлу в `docs/adr/`. Щоб розблокувати, натисніть **Allow** у наступному підтвердженні (або `/fewer-permission-prompts` для постійного дозволу).

---

Ось два ADR-документи, готові до запису:

---

**`docs/adr/260609-1720-bunx-n-cursor-release-node-modules-bin.md`**

```markdown
## ADR `bunx n-cursor release` — `node_modules/.bin` недоступний у raw CI `run:`

## Context and Problem Statement
Після виявлення, що `node npm/bin/n-cursor.js release` не працює у downstream-споживачах,
канонічний сніпет та `nitra/cursor/.github/workflows/npm-publish.yml` були виправлені на
`n-cursor release` (голий виклик). CI `nitra/cursor` (run 27211204232) впав з exit 127:
`n-cursor: command not found`. Необхідно знайти портабельний виклик у raw `run:`-кроці.

## Considered Options
* `n-cursor release` — голий виклик без префіксу
* `bunx n-cursor release` — виклик через `bunx`

## Decision Outcome
Chosen option: "`bunx n-cursor release`", because голий `run:` у GitHub Actions не додає
`node_modules/.bin` до `$PATH`. `bunx` портабельно резолвить бінарник із встановленого
`@nitra/cursor` у будь-якому пакеті-споживачі.

### Consequences
* Good, because `@nitra/cursor@5.0.1` (run 27212228284) і `@7n/n@0.4.0` (run 27212501564)
успішно опубліковано після правки.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Змінені файли (комміти `24cd76ae` / `1623c62`):
- `nitra/cursor: npm/rules/npm-module/policy/npm_publish_yml/template/npm-publish.yml.snippet.yml:40`
- `nitra/cursor: .github/workflows/npm-publish.yml:40`
- `nitra/cursor: npm/rules/npm-module/npm-module.mdc:68`
- `7n: .github/workflows/npm-publish.yml:40`
Supersedes `260609-1649-портабельний-виклик-n-cursor-release-у-сніпеті-npm-publish-y.md`.
```

---

**`docs/adr/260609-1725-bun-lock-sync-frozen-lockfile-ci.md`**

```markdown
## ADR `bun.lock` мусить бути синхронізований до пушу — блокує `--frozen-lockfile` у CI

## Context and Problem Statement
Реліз `@nitra/cursor` (run 27190441665) впав ще на `setup-bun-deps` з помилкою
`lockfile had changes, but lockfile is frozen`. `bun.lock` розсинхронізувався з
`package.json` у попередньому коміті й не був закомічений — крок `n-cursor release`
навіть не запускався.

## Considered Options
* Закомітити оновлений `bun.lock` до пушу
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Закомітити оновлений `bun.lock` до пушу", because `bun install
--frozen-lockfile` (стандарт у `setup-bun-deps`) відмовляється продовжувати якщо
`bun.lock` розходиться з `package.json`. Це є передумовою для будь-якого наступного
CI-кроку.

### Consequences
* Good, because після закомічення `bun.lock` (коміт `6d5a08e8`) крок `setup-bun-deps`
пройшов успішно в наступних runs (27211204232, 27212228284).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Команда: `bun install` (без `--frozen-lockfile`) → `git add bun.lock && git commit`.
Зміна: +3/−17 рядки (`@nitra/cursor ^4.0.0 → ^4.1.0` у внутрішній залежності).
Run 27190441665 (failure, `lockfile frozen`) задокументований в transcript.
```

---

Обидва файли готові — дозвольте запис і я одразу запишу їх.
