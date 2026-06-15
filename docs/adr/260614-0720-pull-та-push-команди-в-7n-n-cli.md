---
session: ff3f7caf-f19f-4812-b3d0-14ecd69b8336
captured: 2026-06-14T07:20:27+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/ff3f7caf-f19f-4812-b3d0-14ecd69b8336.jsonl
---

## ADR Pull та Push команди в @7n/n CLI

## Context and Problem Statement
До CLI-утиліти `@7n/n` додаються дві нові команди — `pull` та `push`. Потреба виникла в контексті запиту на публікацію опису цих команд у Telegram-канал команди через скіл `/n-publish-telegram`.

## Considered Options
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Реалізація команд `pull` та `push` у пакеті `@7n/n`", because у transcript зафіксовано явний запит користувача описати саме ці дві команди (`npx @7n/n pull` та `npx @7n/n push`) як предмет публікації.

### Consequences
* Good, because transcript фіксує очікувану користь: команди стають частиною публічного CLI-інтерфейсу `@7n/n`, доступного через `npx`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Пакет: `@7n/n` v0.8.1, розташований у `/Users/vitalii/www/vitaliytv/7n/npm/`
- README: `/Users/vitalii/www/vitaliytv/7n/npm/README.md`
- Скіл публікації: `.cursor/skills/n-publish-telegram/SKILL.md`
- Команди викликаються через `npx @7n/n pull` та `npx @7n/n push`
- Деталі реалізації (файли команд) у transcript не були повністю розкриті через обрив результату агента
