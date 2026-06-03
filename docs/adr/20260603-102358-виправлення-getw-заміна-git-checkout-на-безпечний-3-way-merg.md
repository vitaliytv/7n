---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:23:58+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Виправлення `getw`: заміна `git checkout -- .` на безпечний 3-way merge з багаторівневою обробкою конфліктів

## Context and Problem Statement
Команда `getw` реалізовувала перенесення змін з worktree-гілки до поточної гілки через `git checkout "$target_branch" -- .`, що сліпо перезаписувало **всі** файли цільової гілки (включно з файлами, яких worktree не чіпав), знищуючи незакомічені або незалежно додані зміни в поточній гілці. Додатково, спроба замінити на `git apply --3way` виявила нову проблему: при «брудному» робочому дереві (де обидві гілки незалежно правили ті самі файли) `--3way` повертав `does not match index` і відмовлявся. Нарешті, агентська обробка конфліктів спочатку делегувала **видалення** `.rej`-файлів самому Клоду, що є крихкою схемою: вердикт про успіх не повинен залежати від дозволів агента на `rm`.

## Considered Options
* Лишити `git checkout "$target_branch" -- .` (статус-кво, втрата змін)
* `git checkout` тільки файлів, які реально змінились у worktree (часткова фільтрація через `git diff`)
* Чистий `git apply` дельти `merge-base..target` без `--index`
* `git apply --3way` (зупинений через `does not match index` на dirty робочому дереві)
* `git apply --reject` з делегуванням видалення `.rej` агенту (проміжна реалізація, відкинута: вердикт не повинен залежати від агента)
* Пофайловий `git merge-file --diff3` (скрипт сам ставить маркери, виносить детермінований вердикт) + багаторівнева обробка конфліктів: mergiraf (Tier 2) → LLM-агент (Tier 3)

## Decision Outcome
Chosen option: "пофайловий `git merge-file --diff3` + многорівнева обробка конфліктів (mergiraf → LLM-агент, вердикт завжди за скриптом)", because це єдина схема, яка: (1) не торкається файлів поза патчем; (2) обходить `does not match index` (merge-file працює виключно по файлах, без індексу); (3) зберігає детерміновану відповідальність скрипта за вердикт (grep маркерів `<<<<<<<`/`>>>>>>>`); (4) мінімізує виклики LLM завдяки дешевим авторезолверам на ранніх рівнях.

### Consequences
* Good, because файли, змінені лише в поточній гілці, більше не перезаписуються — підтверджено функціональним тестом у `/tmp/getw_func/run.sh` (кейс «тільки ours змінив»).
* Good, because `bun.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` беруться детерміновано з target-гілки (замість безглуздого line-based merge lock-файлів).
* Good, because вердикт про успіх мержу є повністю детермінованим і не залежить від поведінки або дозволів LLM-агента — скрипт сам грепає маркери після кожного tier'у.
* Good, because Tier 2 (mergiraf) є опційним і вмикається автоматично лише за наявності `mergiraf` у `PATH`; вимикається через `GETW_NO_MERGIRAF=1`.
* Bad, because `git merge-file` позначає конфліктом навіть **сусідні** (не лише перетинні) зміни — це стандартна поведінка diff3, яка збільшує кількість звернень до агента порівняно з AST-aware merge.
* Bad, because Tier 2 (mergiraf) вимагає окремої інсталяції (`cargo install --locked mergiraf`) і не є стандартним інструментом git.

## More Information
Змінені файли: `npm/getw.js`, `npm/README.md`.
Ключові функції у `npm/getw.js`: `_getw_resolve_with_agent` (рядки 14–43), `_getw_files_with_markers` (рядки 44–51), `_getw_mergiraf_solve` (рядки 53–61).
Tier-логіка (блок накладання): рядки ~130–200 `npm/getw.js`.
Команда синтаксичної перевірки: `zsh -n /tmp/gc.zsh` (екстракція скрипта з JS-модуля через `node --input-type=module`).
Функціональний тест tier'ів: `/tmp/getw_t2/run.sh` (fake-mergiraf + реальний `git merge-file --diff3`).
Change-файли changelog: `npm/.changes/1780426461517-b64370.md` (patch/Fixed — заміна `git checkout`), `npm/.changes/1780458577813-a40c6e.md` (minor/Added — 3way+агент), `npm/.changes/1780465944005-c49062.md` (patch/Fixed — перехід з `--3way` на `--reject`), `npm/.changes/1780466204188-014133.md` (patch/Changed — пофайловий merge-file), `npm/.changes/1780471368242-6c992b.md` (minor/Added — mergiraf Tier 2).
Mergiraf CLI: `mergiraf solve <файл>` (in-place, потребує diff3-маркерів з `|||||||` base-секцією).
Env-змінні агентського тиру: `GETW_MERGE_MODEL` (модель claude), `GETW_MERGE_CURSOR_MODEL` (модель cursor-agent), `GETW_NO_MERGIRAF=1` (вимкнути Tier 2).
