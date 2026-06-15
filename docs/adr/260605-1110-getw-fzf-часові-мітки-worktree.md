# getw: Часові мітки worktree у fzf-інтерфейсі

**Status:** Accepted
**Date:** 2026-06-05

## Context and Problem Statement

У `fzf`-інтерфейсі `getw` (`npm/getw.js`) кожен пункт списку показував лише назву та опис задачі без часових міток. Потрібно відображати момент створення worktree та момент реальної активності в ньому, щоб користувач міг оцінити актуальність кожного worktree без виходу з меню. Потрібно було вирішити, як вимірювати ці дві різні події.

## Considered Options

* Birth time директорії (`stat -f '%SB'`) як сигнал часу створення worktree
* mtime найновішого файлу в директорії (без `.git/` та `node_modules/`) як сигнал «останньої зміни»
* mtime самої директорії worktree як сигнал «останньої зміни» (відхилено — не оновлюється при редагуванні існуючих файлів)

## Decision Outcome

Chosen option: "birth time директорії для створення + mtime найновішого файлу для зміни", because birth time відповідає моменту `git worktree add`, а mtime самої директорії не відображає реальну активність при редагуванні файлів усередині неї.

### Consequences

* Good, because `📅 Створено` показує точний момент `git worktree add`, а `✏️ Змінено` — реальну активність у worktree.
* Bad, because `stat -f '%SB'` є macOS-специфічним; на інших платформах `_getw_created` падає на mtime, що може дати неточний результат; transcript не містить підтвердженого рішення для non-macOS.

## More Information

- Змінений файл: `npm/getw.js`
- Хелпер `_getw_created`: `stat -f '%SB' -t '%Y-%m-%d %H:%M'` з fallback на `%Sm`
- Хелпер `_getw_modified`: `find … | xargs -0 stat -f '%m %N' | sort -rn | head -1`, fallback на mtime директорії
- Фільтри: `-not -path '*/.git/*'`, `-not -path '*/node_modules/*'`
- Формат рядка: `<назва>\n   Задача: <опис>\n   📅 Створено: YYYY-MM-DD HH:MM\n   ✏️ Змінено:  YYYY-MM-DD HH:MM`
- Парсинг вибраного (`wt_name=${selected%%$nl*}`) не змінювався
- Суміжний ADR: `20260603-111512-getw-fzf-preview-опис-worktree.md`
