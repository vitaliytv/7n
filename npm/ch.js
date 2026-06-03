import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

// Інтерактивний генератор change-файлу `<ws>/.changes/<ts>-<rand>.md` (формат, який споживає
// `n-cursor release`): frontmatter з `bump` + `section` (Keep a Changelog) і текст опису.
// Гібрид: задані флаги беруться як є, питається лише відсутнє. Без TTY і без флагів — не зависає.

/** Дозволені semver-бампи (порядок = порядок у меню). */
const BUMPS = Object.freeze(['patch', 'minor', 'major'])

/** Дозволені Keep a Changelog секції (порядок = порядок у меню). */
const SECTIONS = Object.freeze(['Added', 'Changed', 'Fixed', 'Removed'])

/** Підкаталог зі change-файлами всередині workspace. */
const CHANGES_DIR = '.changes'

const USAGE = [
  'Використання: npx @7n/n ch [--bump <major|minor|patch>] [--section <Added|Changed|Fixed|Removed>] [--message "<опис>"] [--ws <шлях>]',
  'Без флагів — інтерактивний режим (потрібен TTY). Задані флаги пропускають відповідний крок.'
].join('\n')

/**
 * Серіалізує change-файл у формат `n-cursor`.
 * @param {{ bump: string, section: string, message: string }} entry запис
 * @returns {string} вміст файлу
 */
export function serializeChange({ bump, section, message }) {
  return `---\nbump: ${bump}\nsection: ${section}\n---\n${message.trim()}\n`
}

/**
 * Ім'я нового change-файлу: timestamp (порядок) + rand (анти-колізія).
 * @param {number} now `Date.now()`
 * @param {string} rand короткий hex-суфікс
 * @returns {string} `<now>-<rand>.md`
 */
export function changeFileName(now, rand) {
  return `${now}-${rand}.md`
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
 * Запитує вибір зі списку (нумероване меню) доки не отримає валідну опцію; Enter — дефолт.
 * @param {(question: string) => Promise<string>} prompt асинхронний запит рядка
 * @param {(message: string) => void} log вивід підказок
 * @param {string} label назва поля
 * @param {readonly string[]} options допустимі значення
 * @returns {Promise<string>} обране значення
 */
async function selectPrompt(prompt, log, label, options) {
  const menu = options.map((opt, i) => `${i + 1}) ${opt}`).join('  ')
  for (;;) {
    log(`${label}: ${menu}`)
    const answer = await prompt(`Вибір [1]: `)
    const raw = answer.trim()
    if (raw === '') return options[0]
    const byNumber = Number.parseInt(raw, 10)
    if (Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= options.length) return options[byNumber - 1]
    if (options.includes(raw)) return raw
    log(`Невалідний вибір «${raw}». Введи число 1–${options.length} або точну назву.`)
  }
}

/**
 * Запитує не-порожній рядок доки не отримає його.
 * @param {(question: string) => Promise<string>} prompt асинхронний запит рядка
 * @param {(message: string) => void} log вивід підказок
 * @param {string} question текст запиту
 * @returns {Promise<string>} не-порожнє значення
 */
async function requiredPrompt(prompt, log, question) {
  for (;;) {
    const answer = await prompt(question)
    const value = answer.trim()
    if (value !== '') return value
    log('Порожнє значення — спробуй ще раз.')
  }
}

/**
 * Доповнює відсутні поля інтерактивно (валідуючи флаги, якщо задані).
 * @param {{ bump?: string, section?: string, message?: string, ws: string }} partial поля з флагів
 * @param {{ prompt: (q: string) => Promise<string>, log: (m: string) => void }} io інжект промпту/виводу
 * @returns {Promise<{ bump: string, section: string, message: string, ws: string }>} повний запис
 */
export async function collectChange(partial, io) {
  const { prompt, log } = io
  if (partial.bump !== undefined && !BUMPS.includes(partial.bump)) {
    throw new Error(`bump має бути одним із ${BUMPS.join('|')} (отримано «${partial.bump}»)`)
  }
  if (partial.section !== undefined && !SECTIONS.includes(partial.section)) {
    throw new Error(`section має бути одним із ${SECTIONS.join('|')} (отримано «${partial.section}»)`)
  }
  const bump = partial.bump ?? (await selectPrompt(prompt, log, 'bump', BUMPS))
  const section = partial.section ?? (await selectPrompt(prompt, log, 'section', SECTIONS))
  const messageRaw = partial.message ?? (await requiredPrompt(prompt, log, 'Опис: '))
  const message = messageRaw.trim()
  if (message === '') throw new Error('порожній опис')
  return { bump, section, message, ws: partial.ws }
}

/**
 * `npx @7n/n ch` — інтерактивно (або з флагів) створює change-файл.
 * @param {string[]} argv аргументи після `ch`
 * @param {object} [io] інжект для тестів
 * @param {(message: string) => void} [io.log] вивід
 * @param {(question: string) => Promise<string>} [io.prompt] запит рядка (тести); інакше readline по TTY
 * @param {boolean} [io.isTTY] чи інтерактивний stdin (дефолт `stdin.isTTY`)
 * @param {() => number} [io.now] джерело timestamp (дефолт `Date.now`)
 * @param {() => string} [io.rand] джерело суфікса (дефолт 3 random-байти hex)
 * @param {(path: string, content: string) => Promise<void>} [io.writeFile] писар (дефолт fs)
 * @param {string} [io.cwd] корінь (дефолт `process.cwd()`)
 * @returns {Promise<number>} exit code
 */
export async function runCh(argv, io = {}) {
  const log = io.log ?? (message => stdout.write(`${message}\n`))
  const partial = parseChArgs(argv)
  const needsPrompt = partial.bump === undefined || partial.section === undefined || partial.message === undefined
  const isTTY = io.isTTY ?? Boolean(stdin.isTTY)

  if (needsPrompt && !io.prompt && !isTTY) {
    log(`❌ Бракує полів, а stdin не інтерактивний.\n${USAGE}`)
    return 1
  }

  const rl = needsPrompt && !io.prompt ? createInterface({ input: stdin, output: stdout }) : null
  const prompt = io.prompt ?? (rl ? question => rl.question(question) : () => Promise.resolve(''))
  try {
    const entry = await collectChange(partial, { prompt, log })
    const now = (io.now ?? Date.now)()
    const rand = (io.rand ?? (() => randomBytes(3).toString('hex')))()
    const name = changeFileName(now, rand)
    const cwd = io.cwd ?? process.cwd()
    const dir = join(cwd, entry.ws, CHANGES_DIR)
    const rel = join(entry.ws, CHANGES_DIR, name)
    const write =
      io.writeFile ??
      (async (path, content) => {
        await mkdir(dir, { recursive: true })
        await writeFile(path, content)
      })
    await write(join(dir, name), serializeChange(entry))
    log(`✅ ${rel}`)
    return 0
  } catch (error) {
    log(`❌ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  } finally {
    rl?.close()
  }
}
