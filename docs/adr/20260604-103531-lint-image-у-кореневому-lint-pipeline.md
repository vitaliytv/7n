# Включення `lint-image` до кореневого lint-pipeline

**Status:** Accepted
**Date:** 2026-06-04

## Context and Problem Statement

Правило `n-image-compress` вимагає наявності скрипту `lint-image` у кореневому `package.json` і його включення до загального `lint`-скрипту. Порушення зафіксував `npx @nitra/cursor fix` через перевірку `image_compress.package_json`.

## Considered Options

* Запускати `@nitra/minify-image` окремою ручною командою поза lint-pipeline
* Додати `lint-image` до `scripts` та включити до кореневого `lint`-скрипту

## Decision Outcome

Chosen option: "Додати `lint-image` до `scripts` та включити до кореневого `lint`-скрипту", because правило `n-image-compress` (version 1.2) явно передбачає перевірку наявності відповідного скрипту в `package.json` через `npx @nitra/cursor fix → image_compress.package_json`.

### Consequences

* Good, because оптимізація raster/SVG-зображень через `@nitra/minify-image` (≥ 3.3.1) стає частиною стандартного `bun run lint`, що унеможливлює пропуск перевірки.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Змінений файл: кореневий `package.json`.
- Правило: `.cursor/rules/n-image-compress.mdc`.
- Утиліта `@nitra/minify-image` запускається через `npx`, без додавання до `dependencies`.
- Верифікація: `npx @nitra/cursor fix` → `✨ Результат: 1/1 правил без зауважень`.
