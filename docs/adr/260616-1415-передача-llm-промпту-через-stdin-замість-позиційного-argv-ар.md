---
session: 10799558-6237-4779-978f-51c2d521f437
captured: 2026-06-16T14:15:19+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/10799558-6237-4779-978f-51c2d521f437.jsonl
---

## ADR Передача LLM-промпту через stdin замість позиційного argv-аргументу

## Context and Problem Statement
`_n7push_gen_message` у `npm/push.js` передавала diff-контекст (~5.4 MB, 1326 рядків з ~4100 байт/рядок) як позиційний аргумент усім трьом агентам (`pi`, `claude`, `cursor-agent`). `ARG_MAX` на macOS = 1 048 576 байт; prompt виростав до ~3.7 MB — `execve` повертав `E2BIG`, zsh виводив `argument list too long: <agent>` ще до старту бінарника (exit code 127, ~0.3 s), тож жоден агент не стартував.

## Considered Options
* Передача prompt позиційним аргументом (`pi ... "$prompt"`) — поточна поведінка, що спричинила баг
* Передача prompt через stdin (`< "$pf"`, де `$pf` — `mktemp`-файл)

## Decision Outcome
Chosen option: "Передача prompt через stdin", because stdin не підпадає під `ARG_MAX` і всі три агенти (перевірено `echo "..." | pi -p ...`, `claude -p`, `cursor-agent -p`) читають prompt зі stdin у `-p`-режимі.

### Consequences
* Good, because prompt довільного розміру (зокрема diff великих репозиторіїв) більше не спричиняє `E2BIG` і не блокує генерацію commit-меседжу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Файл: `npm/push.js`, функція `_n7push_gen_message`; виклики змінено на `pi "${pi_args[@]}" < "$pf"`, `claude -p --model "$claude_model" < "$pf"`, `cursor-agent -p --force --output-format text --model "$cursor_model" < "$pf"`
- `$pf` прибирається (`rm -f "$err" "$pf"`) на всіх шляхах виходу функції
- Додатково: тришарове обрізання diff — `head -n` (рядки, `N7COMMIT_MAX_DIFF_LINES`) → `cut -c1-$maxcol` (довжина рядка, `N7COMMIT_MAX_LINE`=500) → `head -c` (байти, `N7COMMIT_MAX_DIFF_BYTES`=256 KiB)
- Перевірка: 27/27 тестів (`bun test tests/push.test.mjs`), `zsh -n` — синтаксис чистий; відтворено баг і фікс з 4 MB payload

---

## ADR Floor-версія з npm-реєстру в CI перед `n-cursor release`

## Context and Problem Statement
`n-cursor release` читає поточну версію виключно з локального `package.json` (`manifest.version`), а не з npm-реєстру, і не перевіряє exit code `git push --follow-tags`. Через race condition (`76df7e2` тригернув CI; поки готувався commit-back, в `origin/main` приземлився `fb0797d`) push commit-back отримав `non-fast-forward` (rejected), але `n-cursor release` вийшов з кодом 0, і `npm publish` опублікував `0.12.1`. У git лишилась версія `0.12.0` — «фантом»: npm = 0.12.1, git = 0.12.0. Наступний реліз, стартуючи від `package.json` = 0.12.0, запропонував би знову `0.12.1`; `JS-DevTools/npm-publish@v4.1.5` зі strategy `upgrade` (дефолт) тихо пропустив би publish без помилки.

## Considered Options
* Гейт на commit-back: перевіряти `git rev-parse HEAD == origin/main` між кроками; publish лише якщо рівні
* Floor-версія: перед `n-cursor release` запитати `npm view @7n/n version` і підняти локальний `package.json` до `max(local, published)`
* Retry-with-rebase: `fetch` → `rebase` бампу на свіжий `main` → повторний push (2–3 спроби)
* Серіалізація релізів: `concurrency` без `cancel-in-progress`

## Decision Outcome
Chosen option: "Floor-версія", because вона ізольовано усуває дрейф версій одним кроком у CI без змін у `n-cursor release`; є ідемпотентною: якщо git = npm — floor нічого не змінює; якщо git відстав — floor підтягує до «полу» реєстру, і bump дає наступну, гарантовано вільну версію.

### Consequences
* Good, because після floor `n-cursor release` завжди пропонує версію вищу за опубліковану — `npm publish` не отримає колізії і не пропустить реліз мовчки.
* Bad, because крок `npm view` читає з npm-реєстру і додає залежність від його доступності на початку CI-job.

## More Information
- Файл: `.github/workflows/npm-publish.yml` — крок «Sync local version to npm floor» доданий перед «Release (bump + CHANGELOG + tag)»
- Логіка: `published=$(npm view @7n/n version)` → `semver compare local published`; якщо `local < published` → `node -e "... p.version = published; ..."` → запис у `package.json`
- `node_modules/@nitra/cursor/rules/release/release.mjs`: версія читається як `manifest.version` (рядок ~93), push виконується як `await runGit(['push', '--follow-tags'])` без перевірки rc (рядок ~115)
- `JS-DevTools/npm-publish@v4.1.5` зі strategy `upgrade` (дефолт) не падає на вже опублікованій версії — тихо виходить з `type: none`
- Reconcile-коміт `c0e43ff` вручну вирівняв git до `0.12.1` перед впровадженням floor
- `concurrency.cancel-in-progress: true` у workflows залишено незмінним
