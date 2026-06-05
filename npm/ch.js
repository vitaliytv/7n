import { spawn } from 'node:child_process'
import { stdout } from 'node:process'

// Тонка обгортка над `npx @nitra/cursor change`: лише ДОПОВНЮЄ дефолтами (bump=minor,
// section=Changed) і робить --message обов'язковим, а сам запис change-файлу (ім'я
// YYMMDD-HHMM, анти-колізія, серіалізація) делегує каноном через npx. Спільних залежностей
// немає — взаємодія через процесну межу. Користувач править файл вручну, якщо дефолт не той.

/** Дефолт bump, якщо `--bump` не задано (канон валідує значення). */
const DEFAULT_BUMP = 'minor'

/** Дефолт section, якщо `--section` не задано. */
const DEFAULT_SECTION = 'Changed'

const USAGE = [
  'Використання: npx @7n/n ch --message "<опис>" [--bump <major|minor|patch>] [--section <Added|Changed|Fixed|Removed>] [--ws <шлях>]',
  `Без флага --bump → ${DEFAULT_BUMP}; без --section → ${DEFAULT_SECTION}. Постав флаг, якщо інакше. Запис делегується npx @nitra/cursor change.`
].join('\n')

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
 * Будує аргументи для `@nitra/cursor change`, доповнюючи відсутні `bump`/`section`
 * дефолтами. `message` обов'язковий; валідацію значень робить канон.
 * @param {{ bump?: string, section?: string, message?: string, ws: string }} partial поля з флагів
 * @returns {string[]} аргументи (`['change', '--bump', …, '--section', …, '--message', …]`)
 */
export function buildChangeArgs(partial) {
  const message = (partial.message ?? '').trim()
  if (message === '') throw new Error('порожній опис (--message обов’язковий)')
  const args = [
    'change',
    '--bump',
    partial.bump ?? DEFAULT_BUMP,
    '--section',
    partial.section ?? DEFAULT_SECTION,
    '--message',
    message
  ]
  if (partial.ws && partial.ws !== '.') args.push('--ws', partial.ws)
  return args
}

/**
 * Запускає `npx @nitra/cursor <args>` зі спадковим stdio й резолвить exit-код.
 * @param {string[]} args аргументи після `@nitra/cursor`
 * @returns {Promise<number>} exit code
 */
function spawnCanon(args) {
  return new Promise(resolve => {
    const child = spawn('npx', ['@nitra/cursor', ...args], { stdio: 'inherit' })
    child.on('error', () => resolve(1))
    child.on('close', code => resolve(code ?? 1))
  })
}

/**
 * `npx @7n/n ch` — доповнює дефолтами й делегує створення change-файлу каноном.
 * @param {string[]} argv аргументи після `ch`
 * @param {object} [io] інжект для тестів
 * @param {(message: string) => void} [io.log] вивід
 * @param {(args: string[]) => Promise<number>} [io.run] запуск канону (дефолт — `npx @nitra/cursor`)
 * @returns {Promise<number>} exit code
 */
export async function runCh(argv, io = {}) {
  const log = io.log ?? (message => stdout.write(`${message}\n`))
  const partial = parseChArgs(argv)
  if (partial.message === undefined) {
    log(`❌ Бракує --message.\n${USAGE}`)
    return 1
  }
  let args
  try {
    args = buildChangeArgs(partial)
  } catch (error) {
    log(`❌ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  return (io.run ?? spawnCanon)(args)
}
