// Єдине джерело правди для збирання diff-контексту, що йде LLM-агенту (commit-меседж у push.js,
// changelog-опис у ch.js). Тут живуть: (1) «шумні» шляхи, чий ВМІСТ агенту не потрібен для визначення
// суті зміни (наратив/bookkeeping/генероване), і (2) ліміти обрізання. Спільне, щоб набори й ліміти
// в push (zsh) та ch (JS) НЕ розходились — саме розходження й пропустило .n-cursor/*.jsonl у push,
// поки ch не мав жодного виключення.
//
// Обрізання — трирівневе: рядки → довжина рядка → байти. push додатково застосовує per-file
// байт-бюджет у zsh (дзеркало семантики truncateContext тут), щоб жоден один великий файл не з'їв
// усю байтову стелю.

/**
 * Шумні glob-и (без префікса pathspec). Їхній ВМІСТ виключаємо з diff-контексту генерації меседжу;
 * самі файли лишаються в коміті, а їхні ІМЕНА агент усе одно бачить у name-status.
 * @type {string[]}
 */
export const NOISE_GLOBS = [
  'docs/**', // вся документація (ADR, гайди) — наратив, не суть коду
  '**/docs/**', // docs/ у будь-якому під-workspace
  '**/CHANGELOG.md', // генерується CI з change-файлів
  '**/.changes/**', // change-файли (bookkeeping)
  '.n-cursor/**', // трейси/стан n-cursor у корені — машинний bookkeeping
  '**/.n-cursor/**', // ...і в будь-якому під-workspace (llm-trace.jsonl тощо)
  '**/*.jsonl', // JSONL-дампи (трейси/логи): одна гігантська лінія монополізує байт-бюджет
  '*.lock', // bun.lock та інші *.lock у корені
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/*.snap', // тест-снапшоти
  '**/__snapshots__/**',
  '**/*.min.js', // мініфіковане
  '**/*.map', // source maps
  '**/*.d.ts', // генеровані типи (з JSDoc)
  'dist/**', // білд-артефакти
  'build/**',
  'coverage/**'
]

/**
 * Дефолтні ліміти обрізання diff-контексту. push мапить їх на env N7COMMIT_MAX_* (zsh), ch вживає
 * напряму. Тримаємо тут, щоб числа не розходились між модулями.
 */
export const DEFAULT_LIMITS = {
  maxLines: 1500, // head -n / split('\n') — стеля рядків
  maxLineLen: 500, // cut -c / per-line обрізання за довжиною (символи)
  maxBytes: 262144, // тверда глобальна стеля контексту (256 KiB)
  maxFileBytes: 16384 // per-file байт-бюджет (16 KiB) — щоб один файл не монополізував стелю
}

/**
 * git-pathspec'и виключення (`:(exclude)<glob>`) для прямих JS-викликів git (ch.js) і для генерації
 * zsh-масиву (push.js).
 * @param {string[]} [globs] перелік glob-ів (дефолт — {@link NOISE_GLOBS})
 * @returns {string[]} pathspec'и
 */
export function excludePathspecs(globs = NOISE_GLOBS) {
  return globs.map(g => `:(exclude)${g}`)
}

/**
 * Рендерить тіло zsh-масиву дефолтних виключень для вбудови у скрипт push (по одному pathspec у рядку,
 * з відступом). Джерело — {@link NOISE_GLOBS}, тож push і ch не розходяться.
 * @param {string} [indent] відступ кожного рядка
 * @returns {string} рядки виду `'\\''\:(exclude)glob'\\''` з відступом, розділені \n
 */
export function renderZshNoiseArray(indent = '                ') {
  return excludePathspecs()
    .map(spec => `${indent}'${spec}'`)
    .join('\n')
}

/**
 * Обрізає текст до `maxBytes` байтів у UTF-8, не лишаючи «обрубаного» multibyte-символа в кінці.
 * @param {string} text вхід
 * @param {number} maxBytes стеля в байтах
 * @returns {string} обрізаний текст
 */
export function clampBytes(text, maxBytes) {
  const buf = new TextEncoder().encode(text)
  if (buf.length <= maxBytes) return text
  // non-fatal декодер замінює обрубаний хвостовий байт на U+FFFD — прибираємо його.
  return new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, maxBytes)).replace(/�+$/, '')
}

/**
 * Трирівневе обрізання diff-контексту (JS-дзеркало zsh-логіки push): рядки (maxLines) → довжина
 * кожного рядка (maxLineLen) → тверда байтова стеля (maxBytes). Додає лаконічні позначки про те,
 * що саме обрізано.
 * @param {string} text зібраний контекст
 * @param {{ maxLines?: number, maxLineLen?: number, maxBytes?: number }} [limits] ліміти (дефолт — {@link DEFAULT_LIMITS})
 * @returns {string} обрізаний контекст
 */
export function truncateContext(text, limits = {}) {
  const { maxLines, maxLineLen, maxBytes } = { ...DEFAULT_LIMITS, ...limits }
  let lines = text.split('\n')
  const omittedLines = lines.length > maxLines ? lines.length - maxLines : 0
  if (omittedLines) lines = lines.slice(0, maxLines)
  lines = lines.map(l => (l.length > maxLineLen ? l.slice(0, maxLineLen) : l))
  let out = lines.join('\n')
  const bytesClipped = new TextEncoder().encode(out).length > maxBytes
  if (bytesClipped) out = clampBytes(out, maxBytes)
  const notes = []
  if (omittedLines) notes.push(`… (обрізано: ${omittedLines} рядків понад ліміт ${maxLines})`)
  if (bytesClipped) notes.push(`… (обрізано за байтами до ~${maxBytes}; рядки — до ${maxLineLen} симв.)`)
  return notes.length ? `${out}\n${notes.join('\n')}` : out
}
