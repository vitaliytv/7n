# Gap між канонічним `npm-publish.yml` і subset-of перевіркою в `@nitra/cursor`

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Виклик скіла `n-fix` (`npx @nitra/cursor fix npm-module`) не приводить `.github/workflows/npm-publish.yml` до форми, описаної як «Канон: npm-publish.yml» у `.cursor/rules/n-npm-module.mdc`. Legacy-workflow із `jobs.publish`, `contents: read`, без `setup-bun-deps`, без `Configure git identity` та без кроку `Release` проходить перевірку з exit 0 і лишається незміненим. Причина — programmatic-перевірка `npm_module.npm_publish_yml` реалізована як `subset-of` і enforce-ить лише наявність push-тригера, `id-token: write` та publish-кроку, тоді як `.mdc` описує повний `release-publish` job як єдиний канон.

## Considered Options

* **Autofix-апгрейд:** `fix npm-module` детектує legacy `publish`-only job і переписує його у канонічний `release-publish`, але лише коли в репо наявні передумови (`./.github/actions/setup-bun-deps`, `npm/bin/n-cursor.js`); інакше subset-of лишається як є.
* **Уточнення документації канону:** у `.mdc` явно розділити «мінімальний subset-канон» (те, що enforce-ить check) і «розширений release-publish приклад» (опційний), щоб усунути хибне очікування про повний апгрейд.

## Decision Outcome

Chosen option: "Підготовка LLM-patch промпта для команди `@nitra/cursor`", because проблема є в самому пакеті `@nitra/cursor` (policy rego + JS autofix), а не в consumer-репо; пряма правка в `7n` не усуне розрив для інших споживачів. Промпт передає обидва варіанти фіксу команді пакета й вимагає обґрунтованого вибору. Рішення між двома варіантами делеговано виконавцю в репозиторії `@nitra/cursor`.

### Consequences

* Good, because підготовлений промпт містить точні точки правки (`rules/npm-module/policy/npm_module/npm_publish_yml/`, `rules/npm-module/js/check.mjs`, `npm-module.mdc`), критерії ідемпотентності та умови збереження `subset-of` для simple-consumer без release-flow.
* Bad, because `subset-of` перевірка навмисно не охоплює повний канон, щоб не ламати consumer-проєкти без `setup-bun-deps`/`n-cursor.js`; розрив між документацією і enforcement лишається до реалізації в `@nitra/cursor`.
* Bad, because зміни до source-пакету не вносились у цій сесії; вибір між двома варіантами делеговано виконавцю.

## More Information

* Поточний legacy-workflow: `.github/workflows/npm-publish.yml` — `jobs.publish`, `contents: read`, `persist-credentials: false`, без `setup-bun-deps`, без `Configure git identity`, без кроку `Release`
* Канонічна форма описана в `.cursor/rules/n-npm-module.mdc` (секція «## npm publish»): job `release-publish`, `contents: write`, `persist-credentials: true`, `fetch-depth: 0`, `setup-bun-deps`, `Configure git identity`, крок `Release (bump + CHANGELOG + tag)`
* Rego-policy для перевірки: `npm_module.npm_publish_yml` (пакет `@nitra/cursor`, шлях `rules/npm-module/policy/npm_module/npm_publish_yml/*.rego`)
* JS-autofix: `rules/npm-module/js/` у `@nitra/cursor`
* Передумови для autofix-апгрейду: наявність `./.github/actions/setup-bun-deps` і `npm/bin/n-cursor.js` у consumer-репо
* Скіл: `.cursor/skills/n-llm-patch/SKILL.md` — read-only аналіз, жодних змін у поточному репо не вносилося
* Команда, виконана агентом: `npx @nitra/cursor fix npm-module` (exit 0 без змін файлу)
* Зміни в `npm/**` пакета потребують change-файлу (`n-changelog`); дотримання `n-ga` (concurrency, мін-версії actions) і `n-js-lint`
