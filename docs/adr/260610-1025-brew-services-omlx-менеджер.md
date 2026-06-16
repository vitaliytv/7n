# brew services як єдиний менеджер omlx-сервера

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

omlx розповсюджується двома шляхами: Homebrew Formula (`brew install omlx`, tap `jundot/omlx`) і нативний macOS .app (`.dmg` з GitHub Releases). Обидва варіанти запускають сервер на порту `8000`, тому одночасно не можуть працювати. Потрібно визначити, який шлях керує сервером на 16 GB Mac під час сесії тестування Gemma 4.

## Considered Options

- `brew services` керує сервером — headless, автозапуск через LaunchAgent
- `.dmg` / `oMLX.app` керує сервером — menu bar UI, auto-update вбудований
- `pip + venv` встановлення з HEAD репозиторію

## Decision Outcome

Chosen option: "`brew services` керує сервером", because користувач явно вибрав цей варіант («brew керує сервером, тести з Gemma продовжуй») після пояснення конфлікту на порту.

### Consequences

- Good, because всі `brew services restart omlx` проходили штатно; CLI `omlx` доступний з `/opt/homebrew/bin/omlx`; headless-режим не блокує UI.
- Bad, because будь-який `brew upgrade omlx` перезаписує venv, включно з ручними `pip install` патчами (наприклад, підміна `mlx-lm` на HEAD-версію).
- Neutral, because .dmg-варіант залишається доступним для перемикання у майбутньому; обидва варіанти несумісні одночасно через конфлікт порту 8000.

## More Information

Formula: `jundot/omlx` tap, файл `Formula/omlx.rb`.
Команди управління: `brew services stop/start/restart omlx`.
Альтернативні .dmg-збірки: `oMLX-0.4.3-macos15-sequoia.dmg` і `oMLX-0.4.3-macos26-27.dmg` в GitHub Releases `v0.4.3`.
Додаткової інформації в transcript не зафіксовано про причини відхилення `.dmg` крім конфлікту порту.
