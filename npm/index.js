import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HELP = `@7n/7 — CLI

Використання:
  n-7 <команда> [аргументи]

Команди:
  greet [ім'я]    Привітатися (типове ім'я — «світ»)
  version         Показати версію
  help            Показати цю довідку

Опції:
  -h, --help      Показати довідку
  -v, --version   Показати версію
`

/**
 * Повертає version пакета з його package.json.
 * @returns {string} версія пакета
 */
export function version() {
  const pkgPath = fileURLToPath(new URL('package.json', import.meta.url))
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version
}

/**
 * Будує привітання.
 * @param {string} [name] - ім'я для привітання
 * @returns {string} рядок привітання
 */
export function greet(name = 'світ') {
  return `Привіт, ${name}!`
}

/**
 * Точка входу CLI.
 * @param {string[]} argv - аргументи без `node <script>`
 * @param {{ log?: (message: string) => void }} [io] - інжектиться у тестах
 * @returns {number} exit code
 */
export function run(argv, io = {}) {
  const log = io.log ?? (message => process.stdout.write(`${message}\n`))
  const [command, ...rest] = argv

  if (command === '-v' || command === '--version' || command === 'version') {
    log(version())
    return 0
  }

  if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
    log(HELP)
    return 0
  }

  if (command === 'greet') {
    log(greet(rest[0]))
    return 0
  }

  log(`Невідома команда: ${command}\n\n${HELP}`)
  return 1
}
