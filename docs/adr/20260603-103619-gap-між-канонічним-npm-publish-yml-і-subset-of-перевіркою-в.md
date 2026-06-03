---
session: 5b26f1bc-0998-47bb-8bf7-c4d2f7e7db49
captured: 2026-06-03T10:36:19+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/5b26f1bc-0998-47bb-8bf7-c4d2f7e7db49/5b26f1bc-0998-47bb-8bf7-c4d2f7e7db49.jsonl
---

## ADR Gap між канонічним `npm-publish.yml` і subset-of перевіркою в `@nitra/cursor`

## Context and Problem Statement

Виклик скіла `n-fix` (через `npx @nitra/cursor fix npm-module`) не приводить `.github/workflows/npm-publish.yml` до форми, описаної як «Канон: npm-publish.yml» у `.cursor/rules/n-npm-module.mdc`. Legacy-workflow із `jobs.publish`, `contents: read`, без `setup-bun-deps`, без `Configure git identity` та без кроку `Release` проходить перевірку з exit 0 і лишається незміненим. Причина — programmatic-перевірка `npm_module.npm_publish_yml` реалізована як `subset-of` і enforce-ить лише наявність push-тригера, `id-token: write` та publish-кроку, тоді як `.mdc` описує повний `release-publish` job як єдиний канон.

## Considered Options

* **Autofix-апгрейд:** `fix npm-module` детектує legacy `publish`-only job і переписує його у канонічний `release-publish`, але лише коли в репо наявні передумови (`./.github/actions/setup-bun-deps`, `npm/bin/n-cursor.js`); інакше subset-of лишається як є.
* **Уточнення документації канону:** у `.mdc` явно розділити «мінімальний subset-канон» (те, що enforce-ить check) і «розширений release-publish приклад» (опційний), щоб усунути хибне очікування про повний апгрейд.

## Decision Outcome

Chosen option: "Підготовка LLM-patch промпта для команди `@nitra/cursor`", because проблема є в самому пакеті `@nitra/cursor` (policy rego + JS autofix), а не в consumer-репо; пряма правка в `7n` не усуне розрив для інших споживачів. Промпт передає обидва варіанти фіксу команді пакета й вимагає обґрунтованого вибору.

### Consequences

* Good, because transcript фіксує очікувану користь: autofix або уточнення `.mdc` усунуть «тихий» розрив між описаним каноном і реальною поведінкою `fix npm-module`.
* Bad, because subset-of перевірка має лишитися для consumer-ів без `setup-bun-deps`/`n-cursor.js` — повне enforcement зламає прості publish-пакети без release-flow; це накладає обмеження на scope autofix.

## More Information

- Поточний legacy-workflow: `.github/workflows/npm-publish.yml` — `jobs.publish`, `contents: read`, `persist-credentials: false`, без `setup-bun-deps`, без `Configure git identity`, без кроку `Release`.
- Канонічна форма описана в `.cursor/rules/n-npm-module.mdc` (секція «## npm publish»): job `release-publish`, `contents: write`, `persist-credentials: true`, `fetch-depth: 0`, `setup-bun-deps`, `Configure git identity`, крок `Release (bump + CHANGELOG + tag)`.
- Точки правки у `@nitra/cursor`: `npm/rules/npm-module/policy/npm_module/npm_publish_yml/*.rego` (subset-of умови), `npm/rules/npm-module/js/` (autofix-логіка).
- Передумови для autofix-апгрейду: наявність `./.github/actions/setup-bun-deps` і `npm/bin/n-cursor.js` у consumer-репо.
- Обмеження: зміни в `npm/**` пакета потребують change-файлу (`n-changelog`); дотримання `n-ga` (concurrency, мін-версії actions) і `n-js-lint`.
