---
session: ab3011c1-78a9-4cd9-a140-83733702e73e
captured: 2026-06-03T06:37:50+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/ab3011c1-78a9-4cd9-a140-83733702e73e.jsonl
---

## ADR Перейменування bin-entrypoint та усунення `./`-префікса у полі `bin` package.json

## Context and Problem Statement
`npm publish` автоматично видаляв запис `bin` з `npm/package.json` із попередженням «script name bin/7.js was invalid and removed». Спершу причиною вважалася цифрова назва файлу або цифровий ключ команди; емпірична перевірка виявила інший корінь.

## Considered Options
* Перейменувати ключ команди з `"7"` на буквено-цифровий (`7n`, `n7` тощо)
* Перейменувати файл `bin/7.js` → `bin/cli.js` (запит користувача)
* Прибрати `./`-префікс зі значення поля `bin` (виявлена реальна причина)

## Decision Outcome
Chosen option: "Перейменувати файл у `bin/cli.js` і прибрати `./`-префікс зі значення `bin`", because емпірична перевірка в ізольованому temp-пакеті показала, що npm під час `publish` відкидає будь-який bin-запис, якщо значення починається з `./` — навіть `"cli": "./bin/cli.js"` видалявся, тоді як `"cli": "bin/cli.js"` проходив чисто.

### Consequences
* Good, because `npm publish --dry-run` більше не виводить `auto-corrected` / `invalid and removed`; `bin/cli.js` потрапляє в пакет із тегом `latest`.
* Bad, because `scripts.start` у `npm/package.json` тепер посилається на `bun ./bin/cli.js`, тобто тут `./` лишено навмисно — різна поведінка в одному файлі може заплутати.

## More Information
* Змінені файли: `npm/package.json`, `npm/bin/cli.js` (перейменовано з `bin/7.js`).
* Команда перевірки: `npm publish --dry-run 2>&1 | grep -iE "invalid|removed|auto-corrected|bin/cli"`.
* `npm pkg fix` **не** усуває `./`-префікс, тому порада у тексті попередження марна.
* Результат dry-run після виправлення: `npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access`.

---

## ADR Назва CLI-команди `cli` у полі `bin`

## Context and Problem Statement
Після виявлення реальної причини помилки (`./`-префікс) постало питання, яке ім'я дати bin-команді у `npm/package.json`: початкове `7`, проміжне `7n`, або нейтральне `cli`.

## Considered Options
* `"7"` — оригінальна назва
* `"7n"` — співпадає з назвою репозиторію
* `"cli"` — нейтральна, описова назва виконуваного файлу

## Decision Outcome
Chosen option: `"cli"`, because користувач явно запросив: «перейменуй в cli також» — після того як з'ясувалося, що цифрові ключі самі по собі валідні.

### Consequences
* Good, because transcript фіксує очікувану користь: назва команди збігається з назвою файлу `bin/cli.js`, зменшує когнітивне навантаження.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
* Поточний стан у `npm/package.json`: `"bin": { "cli": "bin/cli.js" }`.
* Інші варіанти в transcript не обговорювалися детально — вибір зроблено на вимогу користувача.

---

## ADR Додавання `publishConfig.access: "public"` для scoped-пакета

## Context and Problem Statement
Публікація `@7n/7` падала з помилкою `E402 Payment Required` — npm за замовчуванням трактує scoped-пакети як приватні, що потребує платного плану.

## Considered Options
* Передавати флаг `--access public` при кожному виклику `npm publish`
* Закріпити `publishConfig: { "access": "public" }` у `npm/package.json`

## Decision Outcome
Chosen option: "Закріпити `publishConfig` у `package.json`", because це гарантує публічний доступ постійно — ні розробник, ні CI не мусять пам'ятати про флаг.

### Consequences
* Good, because `npm publish --dry-run` показав `with tag latest and public access` без додаткових аргументів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
* Змінений файл: `npm/package.json`, додано `"publishConfig": { "access": "public" }`.
* Команда перевірки: `npm publish --dry-run 2>&1 | grep -iE "tag|access|public|notice Publishing"`.
* Після виправлення виникла нова помилка `E400 "That word is not allowed"` — можлива проблема з самою назвою пакета `@7n/7`; це питання в transcript не вирішено.
