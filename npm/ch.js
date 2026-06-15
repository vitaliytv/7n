import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stdout } from 'node:process'

import { ensureModel, loadOmlxConfig, omlxChat } from './omlx.mjs'

// Тонка обгортка над `npx @nitra/cursor change`: ДОПОВНЮЄ дефолтами (bump=minor,
// section=Changed), а РОЗТАШУВАННЯ change-файлу визначає АВТОМАТИЧНО — дивиться, у яких
// воркспейсах є змінені файли (git), і пише окремий change у КОЖЕН зачеплений підпакет-воркспейс.
// Цілі — ЛИШЕ підпакети з кореневого `workspaces` (їхні `.changes/` веде CHANGELOG); корінь
// монорепо `n-changelog` не агрегує, тож кореневі/`docs/` файли пропускаємо (orphans). Якщо
// підпакетів немає (однопакетне репо) — корінь сам є пакетом і стає ціллю.
// `--message` ОПЦІЙНИЙ: якщо не задано — для КОЖНОГО воркспейса генерує опис локально через
// omlx (OpenAI-сумісний MLX-сервер) з його diff, тобто аналізує зміни по воркспейсах окремо.
// Сам запис change-файлу (ім'я YYMMDD-HHMM, анти-колізія, серіалізація) делегується каноном
// через npx; взаємодія через процесну межу. Користувач править файли вручну.

/** Дефолт bump, якщо `--bump` не задано (канон валідує значення). */
const DEFAULT_BUMP = 'minor'

/** Дефолт section, якщо `--section` не задано. */
const DEFAULT_SECTION = 'Changed'

/** Максимум рядків diff-контексту, що шлемо в omlx (захист від величезних дифів). */
const MAX_DIFF_LINES = 800

const USAGE = [
  'Використання: npx @7n/n ch [--message "<опис>"] [--bump <major|minor|patch>] [--section <Added|Changed|Fixed|Removed>]',
  `Без флага --bump → ${DEFAULT_BUMP}; без --section → ${DEFAULT_SECTION}.`,
  'Цілі — підпакети-воркспейси, зачеплені змінами git (окремий change-файл у кожен). Кореневі/docs-файли поза воркспейсами пропускаються (CHANGELOG для них не ведеться).',
  'Без --message опис кожного воркспейса генерується локально через omlx з його diff.',
  'Запис делегується npx @nitra/cursor change.'
].join('\n')

/**
 * Парсить `--bump/--section/--message` з argv (без валідації значень).
 * @param {string[]} argv аргументи після `ch`
 * @returns {{ bump?: string, section?: string, message?: string }} зібрані поля
 */
export function parseChArgs(argv) {
  const get = flag => {
    const i = argv.indexOf(flag)
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined
  }
  return { bump: get('--bump'), section: get('--section'), message: get('--message') }
}

/**
 * Будує аргументи для `@nitra/cursor change`, доповнюючи відсутні `bump`/`section`
 * дефолтами й додаючи `--ws`, якщо воркспейс не корінь. Валідацію значень робить канон.
 * @param {{ bump?: string, section?: string }} partial поля з флагів
 * @param {string} message опис (вже непорожній)
 * @param {string} ws воркспейс відносно кореня репо (`.` — корінь)
 * @returns {string[]} аргументи (`['change', '--bump', …, '--section', …, '--message', …]`)
 */
export function buildChangeArgs(partial, message, ws) {
  const trimmed = (message ?? '').trim()
  if (trimmed === '') throw new Error('порожній опис (--message обов’язковий)')
  const args = [
    'change',
    '--bump',
    partial.bump ?? DEFAULT_BUMP,
    '--section',
    partial.section ?? DEFAULT_SECTION,
    '--message',
    trimmed
  ]
  if (ws && ws !== '.') args.push('--ws', ws)
  return args
}

/**
 * Розбирає вивід `git status --porcelain=v1 -z` у список шляхів (відносно кореня репо).
 * Для rename/copy бере цільовий шлях і пропускає вихідний. Враховує staged, unstaged
 * та untracked (`??`).
 * @param {string} raw NUL-розділений вивід `git status --porcelain -z`
 * @returns {string[]} шляхи (posix), без дублікатів
 */
export function parsePorcelainZ(raw) {
  const fields = raw.split('\0')
  const paths = new Set()
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i]
    if (rec.length < 4) continue
    const xy = rec.slice(0, 2)
    const path = rec.slice(3)
    // rename/copy: наступне поле — вихідний шлях, пропускаємо його
    if (xy.includes('R') || xy.includes('C')) i++
    if (path) paths.add(path.replace(/\\/g, '/'))
  }
  return [...paths]
}

/**
 * Читає список воркспейсів з кореневого `package.json` і повертає наявні директорії
 * (posix, відносно кореня). Підтримує масив і `{ packages: [...] }`; розгортає лише
 * простий хвостовий glob `<dir>/*`.
 * @param {string} repoRoot абсолютний шлях до кореня репо
 * @returns {string[]} відносні шляхи воркспейсів
 */
export function resolveWorkspaces(repoRoot) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  } catch {
    return []
  }
  const raw = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces?.packages ?? [])
  const out = new Set()
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry === '') continue
    const norm = entry.replace(/\\/g, '/').replace(/\/+$/, '')
    if (norm.endsWith('/*')) {
      const parent = norm.slice(0, -2)
      const parentAbs = join(repoRoot, parent)
      let names = []
      try {
        names = readdirSync(parentAbs, { withFileTypes: true })
      } catch {
        names = []
      }
      for (const d of names) {
        if (d.isDirectory() && existsSync(join(parentAbs, d.name, 'package.json'))) {
          out.add(`${parent}/${d.name}`)
        }
      }
    } else if (existsSync(join(repoRoot, norm, 'package.json'))) {
      out.add(norm)
    }
  }
  return [...out]
}

/**
 * Планує цілі для change-файлів за змінами git. Валідні цілі — ЛИШЕ підпакети-воркспейси
 * (їхні `.changes/` веде CHANGELOG). Корінь монорепо за наявності підпакетів НЕ є ціллю
 * (`n-changelog` його не агрегує) — кореневі/`docs/` файли йдуть в `orphans` і пропускаються.
 * Якщо підпакетів немає (однопакетне репо), корінь `.` сам є пакетом — тоді всі файли в `.`.
 * @param {string[]} changedPaths шляхи (posix, відносно кореня)
 * @param {string[]} workspaces підпакети-воркспейси (з кореневого `workspaces`)
 * @returns {{ groups: Array<{ ws: string, files: string[] }>, orphans: string[] }} цілі + позаворкспейсні файли
 */
export function planChanges(changedPaths, workspaces) {
  // Однопакетне репо: кореневий package.json і є пакетом → усі зміни в `.`.
  if (workspaces.length === 0) {
    return { groups: changedPaths.length ? [{ ws: '.', files: [...changedPaths] }] : [], orphans: [] }
  }
  const byLen = [...workspaces].sort((a, b) => b.length - a.length)
  /** @type {Map<string, string[]>} */
  const map = new Map()
  const orphans = []
  for (const p of changedPaths) {
    const ws = byLen.find(w => p === w || p.startsWith(`${w}/`))
    if (ws) {
      if (!map.has(ws)) map.set(ws, [])
      map.get(ws).push(p)
    } else {
      orphans.push(p)
    }
  }
  const groups = [...map.entries()]
    .map(([ws, files]) => ({ ws, files }))
    .sort((a, b) => a.ws.localeCompare(b.ws))
  return { groups, orphans }
}

/**
 * Обрізає текст до перших `max` рядків, додаючи позначку про обрізання.
 * @param {string} text вхід
 * @param {number} max ліміт рядків
 * @returns {string} обрізаний текст
 */
function truncateLines(text, max) {
  const lines = text.split('\n')
  if (lines.length <= max) return text
  return `${lines.slice(0, max).join('\n')}\n… (обрізано: ${lines.length - max} рядків)`
}

/**
 * Збирає diff-контекст одного воркспейса для генерації меседжу: name-status + повний diff
 * проти HEAD (staged+unstaged) для його файлів + вміст untracked-файлів, обрізане до ліміту.
 * @param {string} repoRoot корінь репо
 * @param {string} ws воркспейс (`.` — корінь)
 * @param {string[]} files змінені файли воркспейса
 * @param {typeof execFileSync} [execFn] інжект для тестів
 * @returns {string} текст контексту
 */
export function workspaceDiffContext(repoRoot, ws, files, execFn = execFileSync) {
  const pathspec = files.length ? files : [ws === '.' ? '.' : ws]
  const git = args => {
    try {
      return execFn('git', ['-c', 'core.quotepath=false', ...args], { cwd: repoRoot, encoding: 'utf8' })
    } catch {
      return ''
    }
  }
  const names = git(['diff', '--name-status', 'HEAD', '--', ...pathspec]).trim()
  const diff = git(['diff', 'HEAD', '--', ...pathspec])
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...pathspec])
    .split('\n')
    .filter(Boolean)
  const parts = [`Змінені файли:\n${names || '(нема відстежуваних змін)'}`]
  if (diff.trim()) parts.push(`Diff:\n${diff}`)
  for (const f of untracked) {
    let content = ''
    try {
      content = readFileSync(join(repoRoot, f), 'utf8')
    } catch {
      content = ''
    }
    parts.push(`Новий файл ${f}:\n${content}`)
  }
  return truncateLines(parts.join('\n\n'), MAX_DIFF_LINES)
}

/**
 * Будує chat-повідомлення для генерації одно-рядкового опису зміни воркспейса.
 * @param {string} ws воркспейс (`.` — корінь)
 * @param {string} context diff-контекст
 * @returns {Array<{ role: string, content: string }>} повідомлення
 */
export function buildGenMessages(ws, context) {
  const sys = [
    `Ти пишеш ОДИН рядок опису зміни (changelog entry) українською для воркспейса «${ws === '.' ? 'корінь' : ws}».`,
    'Дано git diff цього воркспейса. Опиши СУТЬ зміни одним коротким рядком.',
    'Правила:',
    '- Мова — українська; технічні ідентифікатори, шляхи, команди та API-назви лишай англійською.',
    '- Один рядок, ≤ 72 символи, без крапки в кінці.',
    '- БЕЗ emoji, БЕЗ префіксів типу feat/fix/refactor, БЕЗ лапок, БЕЗ code fence, БЕЗ пояснень.',
    '- Виведи РІВНО сам опис, нічого більше.'
  ].join('\n')
  return [
    { role: 'system', content: sys },
    { role: 'user', content: context }
  ]
}

/**
 * Чистить вихід моделі до одного рядка опису: перший непорожній рядок без code fence,
 * провідного `- `, обрамлювальних лапок/беків і крапки в кінці.
 * @param {string} output сирий вихід omlx
 * @returns {string} опис
 */
export function cleanGeneratedMessage(output) {
  const line = output
    .split('\n')
    .map(l => l.trim())
    .find(l => l !== '' && !/^```/.test(l))
  if (!line) return ''
  return line
    .replace(/^[-*]\s+/, '')
    .replace(/\.+$/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
}

/**
 * Дефолтний генератор меседжів через omlx: лінива одноразова підготовка cfg+model,
 * далі — diff-контекст воркспейса → omlxChat → чистий рядок.
 * @returns {(ws: string, files: string[], repoRoot: string) => Promise<string>} генератор
 */
function defaultGenerator() {
  let ready
  const prepare = async () => {
    const cfg = loadOmlxConfig()
    return { ...cfg, model: cfg.model || (await ensureModel(cfg)) }
  }
  return async (ws, files, repoRoot) => {
    ready = ready ?? prepare()
    const cfg = await ready
    const context = workspaceDiffContext(repoRoot, ws, files)
    const out = await omlxChat(buildGenMessages(ws, context), cfg)
    return cleanGeneratedMessage(out)
  }
}

/**
 * Реальний git-контекст: корінь репо, воркспейси, змінені файли.
 * @returns {{ repoRoot: string, workspaces: string[], changed: string[] }} контекст
 */
function gitContext() {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const raw = execFileSync('git', ['status', '--porcelain=v1', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  return { repoRoot, workspaces: resolveWorkspaces(repoRoot), changed: parsePorcelainZ(raw) }
}

/**
 * Запускає `npx @nitra/cursor <args>` зі спадковим stdio й резолвить exit-код.
 * @param {string[]} args аргументи після `@nitra/cursor`
 * @param {string} [cwd] робоча тека (корінь репо)
 * @returns {Promise<number>} exit code
 */
function spawnCanon(args, cwd) {
  return new Promise(resolve => {
    const child = spawn('npx', ['@nitra/cursor', ...args], { stdio: 'inherit', cwd })
    child.on('error', () => resolve(1))
    child.on('close', code => resolve(code ?? 1))
  })
}

/**
 * `npx @7n/n ch` — доповнює дефолтами, автоматично визначає зачеплені воркспейси за змінами
 * git і делегує створення change-файлу каноном у КОЖЕН воркспейс окремо. Без `--message` опис
 * кожного воркспейса генерується локально через omlx з його diff.
 * @param {string[]} argv аргументи після `ch`
 * @param {object} [io] інжект для тестів
 * @param {(message: string) => void} [io.log] вивід
 * @param {(args: string[], cwd?: string) => Promise<number>} [io.run] запуск канону
 * @param {() => { repoRoot: string, workspaces: string[], changed: string[] }} [io.context] git-контекст
 * @param {(ws: string, files: string[], repoRoot: string) => Promise<string>} [io.generate] генератор меседжу
 * @returns {Promise<number>} exit code (перший ненульовий, інакше 0)
 */
export async function runCh(argv, io = {}) {
  const log = io.log ?? (message => stdout.write(`${message}\n`))
  const run = io.run ?? spawnCanon
  const partial = parseChArgs(argv)
  const provided = partial.message
  if (provided !== undefined && provided.trim() === '') {
    log(`❌ Порожній --message.\n${USAGE}`)
    return 1
  }

  let ctx
  try {
    ctx = (io.context ?? gitContext)()
  } catch (error) {
    log(`❌ git недоступний: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  const { groups, orphans } = planChanges(ctx.changed, ctx.workspaces)

  if (orphans.length) {
    log(
      `ℹ️ Поза воркспейсами (CHANGELOG не ведеться, пропускаю): ${orphans.slice(0, 5).join(', ')}${
        orphans.length > 5 ? ` … +${orphans.length - 5}` : ''
      }`
    )
  }

  if (groups.length === 0) {
    log('✅ Немає змін у воркспейсах, що ведуть CHANGELOG — нічого створювати. 👋')
    return 0
  }

  log(`📦 Зачеплені воркспейси: ${groups.map(g => (g.ws === '.' ? '<корінь>' : g.ws)).join(', ')}`)

  const generate = io.generate ?? defaultGenerator()
  let exit = 0
  for (const { ws, files } of groups) {
    let message = provided
    if (message === undefined) {
      try {
        log(`🤖 Генерую опис для ${ws === '.' ? '<корінь>' : ws} через omlx...`)
        message = await generate(ws, files, ctx.repoRoot)
      } catch (error) {
        log(`❌ omlx не зміг згенерувати опис для ${ws}: ${error instanceof Error ? error.message : String(error)}`)
        exit = exit || 1
        continue
      }
      if (!message || message.trim() === '') {
        log(`❌ Порожній опис від omlx для ${ws} — пропускаю (постав --message вручну).`)
        exit = exit || 1
        continue
      }
      log(`📝 ${ws === '.' ? '<корінь>' : ws}: ${message}`)
    }
    const code = await run(buildChangeArgs(partial, message, ws), ctx.repoRoot)
    if (code !== 0 && exit === 0) exit = code
  }
  return exit
}
