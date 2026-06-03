import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { runCh } from './ch.js'
import { getw } from './getw.js'
import { pull } from './pull.js'
import { push } from './push.js'

const HELP = `@7n/n — CLI

Використання:
  npx @7n/n <команда> [аргументи]

Команди:
  greet [ім'я]    Привітатися (типове ім'я — «світ»)
  ch              Створити change-файл (.changes/) інтерактивно або з флагів (--bump/--section/--message/--ws)
  getw            Перенести зміни з обраного git-worktree у поточну гілку (fzf) і прибрати worktree
  pull [гілка]    Накотити дельту origin/<гілка> (дефолт — поточна) у поточне дерево як unstaged
  push [гілка]    Сквошити локальні коміти+зміни в один, згенерувати меседж (Gitmoji) і запушити origin/<гілка>
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
 * @param {{ log?: (message: string) => void, getw?: () => Promise<number>, pull?: (branch?: string) => Promise<number>, push?: (branch?: string) => Promise<number> }} [io] - інжектиться у тестах
 * @returns {Promise<number>} exit code
 */
export async function run(argv, io = {}) {
  const log = io.log ?? (message => process.stdout.write(`${message}\n`))
  const runGetw = io.getw ?? getw
  const runPull = io.pull ?? pull
  const runPush = io.push ?? push
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

  if (command === 'ch') {
    return await runCh(rest, io)
  }

  if (command === 'getw') {
    return await runGetw()
  }

  if (command === 'pull') {
    return await runPull(rest[0])
  }

  if (command === 'push') {
    return await runPush(rest[0])
  }

  log(`Невідома команда: ${command}\n\n${HELP}`)
  return 1
}
