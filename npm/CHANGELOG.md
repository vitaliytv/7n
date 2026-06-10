# Changelog

## [0.5.0] - 2026-06-10

### Changed

- pull: спершу справжній fast-forward (git merge --ff-only), і лише коли FF неможливий — фолбек на дельта-мердж

## [0.4.0] - 2026-06-09

### Added

- команда ch — інтерактивний/флаговий генератор change-файлів .changes/ (npx @7n/n ch), bin n
- getw: інтелектуальний мерж конфліктів через LLM-агента (claude -p, фолбек cursor-agent -p) замість падіння — git apply --3way + розвʼязання маркерів; моделі через GETW_MERGE_MODEL / GETW_MERGE_CURSOR_MODEL
- getw: багаторівневий резолв конфліктів — git merge-file --diff3, опційний авторезолвер mergiraf (mergiraf solve, off через GETW_NO_MERGIRAF=1), детерміноване перенесення lock-файлів з target, і лише залишок іде на LLM-агента
- getw: авто-встановлення mergiraf через brew install mergiraf (фолбек cargo) і окрема обробка bun.lock — не мержиться, а перегенеровується через bun install після успішного мержу
- команда pull — накочує лише дельту merge-base(HEAD, origin/<гілка>)..origin/<гілка> у поточне дерево як unstaged тим самим багаторівневим мерджем, що й getw (apply→merge-file→mergiraf→агент); спільне ядро _n7merge_delta винесено у merge.js і перевикористане в getw. Додано pre-flight бекап незакомічених змін через git stash create (знімок без чіпання дерева, з командою відкату в stdout) і per-file підсумок від Tier-3-агента у stdout. Env-кнопки нейтральні N7MERGE__ з backward-фолбеком на GETW\__
- Команда `npx @7n/n push`: сквошить локальні коміти (`origin/<branch>..HEAD`) і всі зміни робочого дерева (`git add -A`) в один коміт на вершині `origin/<branch>`, генерує commit-меседж LLM-агентом (українською, Gitmoji + Monorepo) і пушить одним комітом. `git fetch` робиться завжди; за дивергенції автоматично підтягує дельту origin тим самим ядром, що й `pull` (`_n7merge_delta`). Без інтерактивного підтвердження, коміт із `--no-verify`. Меседж будується насамперед на застейджених change-файлах (`.changes/*.md`) — вони описують намір прозою; diff аналізується лише за їх відсутності, і тоді — повний перелік файлів + diff БЕЗ вмісту шумних шляхів (`docs/**` включно з ADR, `CHANGELOG.md`, `.changes/`, `*.lock`, `*.d.ts`, snapshots, build), обрізаний за рядками. У stdout ADR-файли згортаються в кількість. Конфіг env: `N7COMMIT_MODEL`/`N7COMMIT_CURSOR_MODEL` (фолбек `N7MERGE_*`/`GETW_*`), `N7COMMIT_NO_DEFAULT_EXCLUDE`, `N7COMMIT_EXCLUDE`, `N7COMMIT_MAX_DIFF_LINES`.
- push: режим без LLM — за наявних застейджених change-файлів (.changes/*.md) commit-меседж збирається детерміновано (section→emoji/type, scope зі шляхів, summary за найвищим bump, тіло — булет на файл); LLM лишається фолбеком за відсутності change-файлів або через N7COMMIT_FORCE_LLM=1
- push: режим налагодження N7COMMIT_DEBUG=1 — друкує в stderr позначений часом таймлайн етапів (fetch/add/збір контексту) і тривалість+exit code+розмір/перші рядки відповіді кожного LLM-агента (pi/claude/cursor-agent), щоб одразу бачити, де саме push «висить»

### Changed

- bin: команда перейменована cli → n (bin/n.js); пакет публікується як @7n/n з public access
- getw: конфлікти через пофайловий git merge-file (скрипт ставить маркери й виносить вердикт), агент лише прибирає маркери — без делегування видалення .rej Клоду; коректно обробляє додані/видалені/бінарні файли
- getw: bun install лише коли bun.lock відрізняється від worktree-гілки (порівняння локального/HEAD з target), а не за фактом наявності в дельті
- getw: bun.lock лише в корені репо — порівняння й regen без вкладених шляхів
- ch: вирівняно з @nitra/cursor — ім'я change-файлу YYMMDD-HHMM з числовим суфіксом при колізії (замість epoch-ms + random hex); frontmatter тепер рівно bump+section (прибрано зайве поле created). Прибрано інтерактивний режим: команда тепер повний автомат — --message обов'язковий, bump за замовч. minor, section за замовч. Changed (користувач править файл вручну, якщо не так)
- push: diff-и для генерації commit-меседжу беруться явно проти origin ($base) — change-файли й scope охоплюють застейджене + незастейджене/untracked + локальні коміти (різниця vs origin) в одному наборі
- getw: worktree із порожньою дельтою (немає незакомічених змін і немає комітів поверх merge-base з поточною гілкою) тепер мовчки видаляється (worktree+гілка) під час побудови списку й не показується у fzf — раніше його доводилось обрати, щоб дізнатись що переносити нічого. Поточний worktree та кейс невизначеного merge-base ніколи не чіпаються.
- ch: тепер тонка обгортка — лише доповнює дефолтами (bump=minor, section=Changed, --message обов'язковий) і делегує запис change-файлу каноном через npx @nitra/cursor change; власну логіку імені/колізії/серіалізації прибрано (нуль дрейфу від канону, без спільних залежностей)
- Оновлено release note для `npm-publish` потоку: зміна в `npm/**` має тригерити publish на `main` через workflow, який агрегує `.changes` і публікує `npm/package.json`.
- push: діагностичний таймлайн (тривалість/exit code кожного LLM-агента та етапів fetch/add/контекст) тепер увімкнено за замовчуванням — вимикається лише явним N7COMMIT_DEBUG=0

### Fixed

- getw переносить лише дельту worktree-гілки (merge-base..target) через git apply замість git checkout -- ., що раніше затирав файли, змінені тільки в поточній гілці
- getw: мерж конфліктів через git apply --reject + агент замість git apply --3way (--3way падав з 'does not match index' на dirty робочому дереві й був атомарним); критерій успіху — відсутність \*.rej
- Пробує LLM-агентів у порядку pi → claude → cursor-agent у push/merge та показує exit code зі stderr/stdout при падінні кожного доступного агента.
- ci/npm-publish: крок Release викликає `bunx n-cursor release` замість неіснуючого у пакеті `node npm/bin/n-cursor.js release` — відновлено автоматичну публікацію (падала з `Cannot find module .../npm/bin/n-cursor.js`)
