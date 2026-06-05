import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stdout } from 'node:process'

// Неінтерактивний генератор change-файлу `<ws>/.changes/YYMMDD-HHMM.md` (формат, який споживає
// `n-cursor release`): frontmatter з `bump` + `section` (Keep a Changelog) і текст опису.
// Повний автомат: `--message` обов'язковий, решта має дефолти (bump=minor, section=Changed) —
// користувач править файл вручну, якщо дефолт не підходить. Інтерактиву й TTY-логіки немає.

/** Дозволені semver-бампи. */
const BUMPS = Object.freeze(['patch', 'minor', 'major'])

/** Дозволені Keep a Changelog секції. */
const SECTIONS = Object.freeze(['Added', 'Changed', 'Fixed', 'Removed'])

/** Дефолт bump, якщо `--bump` не задано (користувач править файл вручну, якщо не так). */
const DEFAULT_BUMP = 'minor'

/** Дефолт section, якщо `--section` не задано (користувач править файл вручну, якщо не так). */
const DEFAULT_SECTION = 'Changed'

/** Підкаталог зі change-файлами всередині workspace. */
const CHANGES_DIR = '.changes'

const USAGE = [
  'Використання: npx @7n/n ch --message "<опис>" [--bump <major|minor|patch>] [--section <Added|Changed|Fixed|Removed>] [--ws <шлях>]',
  `Без флага --bump → ${DEFAULT_BUMP}; без --section → ${DEFAULT_SECTION}. Постав флаг, якщо інакше.`
].join('\n')

/**
 * Серіалізує change-файл у формат `n-cursor` (frontmatter рівно `bump` + `section` + опис).
 * @param {{ bump: string, section: string, message: string }} entry запис
 * @returns {string} вміст файлу
 */
export function serializeChange({ bump, section, message }) {
  return `---\nbump: ${bump}\nsection: ${section}\n---\n${message.trim()}\n`
}

/**
 * Локальний timestamp-префікс `YYMMDD-HHMM` (нулі дозаповнені).
 * @param {number} now `Date.now()`
 * @returns {string} напр. `260603-1430`
 */
function formatChangeTimestamp(now) {
  const d = new Date(now)
  const pad = n => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

/**
 * Ім'я change-файлу: людино-читабельний `YYMMDD-HHMM.md`; при колізії за ту саму
 * хвилину — числовий суфікс `-2`, `-3` тощо.
 * @param {number} now `Date.now()`
 * @param {number} [sequence] послідовність колізії; `1`/без аргументу — без суфікса
 * @returns {string} `YYMMDD-HHMM.md` або `YYMMDD-HHMM-<n>.md`
 */
export function changeFileName(now, sequence = 1) {
  const base = formatChangeTimestamp(now)
  return sequence > 1 ? `${base}-${sequence}.md` : `${base}.md`
}

/**
 * @param {unknown} error помилка запису
 * @returns {boolean} true, якщо файл уже існує
 */
function isFileExistsError(error) {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

/**
 * Пише change-файл create-only, додаючи числовий суфікс лише при локальній колізії
 * (анти-колізія для паралельних агентів, що пишуть у ту саму хвилину).
 * @param {(path: string, content: string) => Promise<void>} write create-only писар (кидає `EEXIST` при колізії)
 * @param {string} dir каталог `.changes`
 * @param {string} content вміст файлу
 * @param {number} now `Date.now()`
 * @returns {Promise<string>} створене ім'я файла
 */
async function writeUniqueChange(write, dir, content, now) {
  for (let sequence = 1; ; sequence++) {
    const name = changeFileName(now, sequence)
    try {
      await write(join(dir, name), content)
      return name
    } catch (error) {
      if (isFileExistsError(error)) continue
      throw error
    }
  }
}

/**
 * Парсить `--bump/--section/--message/--ws` з argv (без валідації значень).
 * @param {string[]} argv аргументи після `ch`
 * @returns {{ bump?: string, section?: string, message?: string, ws: string }} зібрані поля
 */
export function parseChArgs(argv) {
  const get = flag => {
    const i = argv.indexOf(flag)
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined
  }
  return { bump: get('--bump'), section: get('--section'), message: get('--message'), ws: get('--ws') ?? '.' }
}

/**
 * Доповнює відсутні `bump`/`section` дефолтами й валідує. Без інтерактиву: `message`
 * обов'язковий (інакше помилка), `bump`/`section` мають дефолти.
 * @param {{ bump?: string, section?: string, message?: string, ws: string }} partial поля з флагів
 * @returns {{ bump: string, section: string, message: string, ws: string }} повний запис
 */
export function resolveChange(partial) {
  const bump = partial.bump ?? DEFAULT_BUMP
  if (!BUMPS.includes(bump)) {
    throw new Error(`bump має бути одним із ${BUMPS.join('|')} (отримано «${bump}»)`)
  }
  const section = partial.section ?? DEFAULT_SECTION
  if (!SECTIONS.includes(section)) {
    throw new Error(`section має бути одним із ${SECTIONS.join('|')} (отримано «${section}»)`)
  }
  const message = (partial.message ?? '').trim()
  if (message === '') throw new Error('порожній опис (--message обов’язковий)')
  return { bump, section, message, ws: partial.ws }
}

/**
 * `npx @7n/n ch` — неінтерактивно створює change-файл із флагів (з дефолтами bump/section).
 * @param {string[]} argv аргументи після `ch`
 * @param {object} [io] інжект для тестів
 * @param {(message: string) => void} [io.log] вивід
 * @param {() => number} [io.now] джерело timestamp (дефолт `Date.now`)
 * @param {(path: string, content: string) => Promise<void>} [io.writeFile] create-only писар (кидає `EEXIST` при колізії; дефолт fs `wx`)
 * @param {string} [io.cwd] корінь (дефолт `process.cwd()`)
 * @returns {Promise<number>} exit code
 */
export async function runCh(argv, io = {}) {
  const log = io.log ?? (message => stdout.write(`${message}\n`))
  const partial = parseChArgs(argv)
  if (partial.message === undefined) {
    log(`❌ Бракує --message.\n${USAGE}`)
    return 1
  }
  try {
    const entry = resolveChange(partial)
    const now = (io.now ?? Date.now)()
    const cwd = io.cwd ?? process.cwd()
    const dir = join(cwd, entry.ws, CHANGES_DIR)
    const write =
      io.writeFile ??
      (async (path, content) => {
        await mkdir(dir, { recursive: true })
        await writeFile(path, content, { flag: 'wx' })
      })
    const name = await writeUniqueChange(write, dir, serializeChange(entry), now)
    log(`✅ ${join(entry.ws, CHANGES_DIR, name)}`)
    return 0
  } catch (error) {
    log(`❌ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
