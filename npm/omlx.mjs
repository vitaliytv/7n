import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Локальний omlx-резолвер Tier-3 конфліктів (заміна cloud-агентів pi/claude/cursor). omlx — OpenAI-
// сумісний MLX-сервер на Apple Silicon (gemma-4 та ін.). Резолв — generate-validate цикл ПО-ХУНКОВО:
// для кожного diff3-хунка шлемо ours/base/theirs, забираємо резолв із sentinel-блоку, агресивно
// валідуємо (маркери, галюцинації, покриття обох сторін, довжина) і ретраїмо з таргетованим фідбеком.
// Усе — чисті функції над рядками + інжектовані fetch/fs, тож повністю unit-тестовно.

const DEFAULT_KEY = 'omlx-local-test-key'
export const RESOLVE_START = '<<<N7-RESOLVED'
export const RESOLVE_END = 'N7-RESOLVED>>>'

/**
 * Читає конфіг omlx з `~/.omlx/` (URL із server.host/port, ключ із auth.api_key, дефолт-модель —
 * `is_default` у model_settings.json) з env-оверайдами N7MERGE_OMLX_*. Ключ дефолтиться на
 * `omlx-local-test-key`. V6 (strict — усі унікальні рядки мусять вціліти) увімкнено, вимикається
 * N7MERGE_OMLX_STRICT=0.
 * @param {object} [env] - середовище (process.env)
 * @param {typeof readFileSync} [readFile]
 * @param {string} [home]
 * @returns {{url:string,key:string,model:(string|undefined),maxTokens:number,retries:number,strict:boolean}}
 */
export function loadOmlxConfig(env = process.env, readFile = readFileSync, home = homedir()) {
  let settings
  let modelSettings
  try {
    settings = JSON.parse(readFile(join(home, '.omlx', 'settings.json'), 'utf8'))
  } catch {
    settings = {}
  }
  try {
    modelSettings = JSON.parse(readFile(join(home, '.omlx', 'model_settings.json'), 'utf8'))
  } catch {
    modelSettings = {}
  }

  const host = settings?.server?.host || '127.0.0.1'
  const port = settings?.server?.port || 8000
  // omlx — локальний MLX-сервер, http за дизайном (127.0.0.1).
  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const url = env.N7MERGE_OMLX_URL || `http://${host}:${port}`
  const key = env.N7MERGE_OMLX_KEY || settings?.auth?.api_key || DEFAULT_KEY

  let defaultModel
  for (const [id, m] of Object.entries(modelSettings?.models || {})) {
    if (m?.is_default) {
      defaultModel = id
      break
    }
  }
  const model = env.N7MERGE_OMLX_MODEL || defaultModel

  return {
    url,
    key,
    model,
    maxTokens: Number(env.N7MERGE_OMLX_MAX_TOKENS) || 2048,
    retries: Number(env.N7MERGE_OMLX_RETRIES) || 3,
    strict: env.N7MERGE_OMLX_STRICT !== '0',
  }
}

/**
 * POST на `/v1/chat/completions`. Температуру форсимо 0 (server-default 1.0 зруйнував би детермінізм),
 * на ретраях підіймаємо через opts.temperature. Кидає на HTTP-помилку або відсутній content.
 * @param {Array<{role:string,content:string}>} messages
 * @param {{url:string,key:string,model:string,maxTokens:number}} cfg
 * @param {{temperature?:number,maxTokens?:number}} [opts]
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<string>}
 */
export async function omlxChat(messages, cfg, opts = {}, fetchFn = fetch) {
  const res = await fetchFn(`${cfg.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? cfg.maxTokens,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`omlx HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`omlx: немає content у відповіді: ${JSON.stringify(data).slice(0, 300)}`)
  }
  return content
}

/**
 * Якщо модель не задана — бере першу з `/v1/models`. Заодно слугує health-check'ом (кине, якщо сервер
 * лежить чи без моделей).
 * @param {{url:string,key:string,model?:string}} cfg
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<string>}
 */
export async function ensureModel(cfg, fetchFn = fetch) {
  if (cfg.model) {
    return cfg.model
  }
  const res = await fetchFn(`${cfg.url}/v1/models`, { headers: { Authorization: `Bearer ${cfg.key}` } })
  if (!res.ok) {
    throw new Error(`omlx /v1/models HTTP ${res.status}`)
  }
  const data = await res.json()
  const first = data?.data?.[0]?.id
  if (!first) {
    throw new Error('omlx: жодної моделі не доступно')
  }
  return first
}

const isMarker = line => /^(<{7}|\|{7}|={7}|>{7})/.test(line)

/**
 * Читає один diff3-блок із lines, починаючи з рядка-маркера `<<<<<<<` (start).
 * @param {string[]} lines
 * @param {number} start
 * @returns {{ours:string[],base:string[],theirs:string[],end:number}} секції + індекс після `>>>>>>>`
 */
function readConflictBlock(lines, start) {
  const ours = []
  const base = []
  const theirs = []
  let i = start + 1
  while (i < lines.length && !/^\|{7}/.test(lines[i]) && !/^={7}/.test(lines[i])) {
    ours.push(lines[i])
    i++
  }
  if (i < lines.length && /^\|{7}/.test(lines[i])) {
    i++
    while (i < lines.length && !/^={7}/.test(lines[i])) {
      base.push(lines[i])
      i++
    }
  }
  if (i < lines.length && /^={7}/.test(lines[i])) {
    i++
  }
  while (i < lines.length && !/^>{7}/.test(lines[i])) {
    theirs.push(lines[i])
    i++
  }
  if (i < lines.length && /^>{7}/.test(lines[i])) {
    i++
  }
  return { ours, base, theirs, end: i }
}

/**
 * Розбиває diff3-маркований текст на сегменти: {type:'text',lines} та
 * {type:'conflict',ours,base,theirs}. Зберігає порядок; reconstruct() відновлює файл 1:1.
 * @param {string} text
 * @returns {Array<object>}
 */
export function parseConflicts(text) {
  const lines = text.split('\n')
  const segments = []
  let buf = []
  const flush = () => {
    if (buf.length) {
      segments.push({ type: 'text', lines: buf })
      buf = []
    }
  }
  let i = 0
  while (i < lines.length) {
    if (/^<{7}/.test(lines[i])) {
      flush()
      const block = readConflictBlock(lines, i)
      segments.push({ type: 'conflict', ours: block.ours, base: block.base, theirs: block.theirs })
      i = block.end
    } else {
      buf.push(lines[i])
      i++
    }
  }
  flush()
  return segments
}

/**
 * Збирає файл назад зі сегментів. Для conflict-сегмента бере seg.resolved (масив рядків).
 * @param {Array<object>} segments
 * @returns {string}
 */
export function reconstruct(segments) {
  return segments.map(s => (s.type === 'text' ? s.lines : s.resolved).join('\n')).join('\n')
}

/**
 * Відновлює diff3-блок із маркерами (для хунків, які omlx не зміг розвʼязати — лишаємо на ручний резолв).
 * @param {{ours:string[],base:string[],theirs:string[]}} seg
 * @returns {string[]}
 */
function rebuildMarkers(seg) {
  return ['<<<<<<< OURS', ...seg.ours, '||||||| BASE', ...seg.base, '=======', ...seg.theirs, '>>>>>>> THEIRS']
}

/**
 * Витягує резолв із виходу моделі: вміст між sentinel-маркерами (як фолбек — увесь вихід), обрізає
 * порожні краї й code-fence, якщо модель таки обгорнула.
 * @param {string} output
 * @returns {string[]}
 */
export function extractResolved(output) {
  const s = output.indexOf(RESOLVE_START)
  const e = output.indexOf(RESOLVE_END)
  const body = s !== -1 && e > s ? output.slice(s + RESOLVE_START.length, e) : output
  const lines = body.split('\n')
  while (lines.length && lines[0].trim() === '') {
    lines.shift()
  }
  while (lines.length && lines.at(-1).trim() === '') {
    lines.pop()
  }
  if (lines.length && /^```/.test(lines[0])) {
    lines.shift()
  }
  if (lines.length && /^```/.test(lines.at(-1))) {
    lines.pop()
  }
  return lines
}

const meaningful = arr => arr.map(l => l.trim()).filter(l => l !== '')

/**
 * Чи `a` — same-line-правка `b` (а не окреме доповнення): спільний префікс ≥ половини коротшого й
 * ≥3 символи. Напр. `const port = 8080` ~ `const port = 3000 // ovr` (правка), але `const host=…` не
 * схоже на `const port=…`. Так відрізняємо pure-addition (мусить вціліти) від конфлікту-заміни.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function similarEdit(a, b) {
  const n = Math.min(a.length, b.length)
  let p = 0
  while (p < n && a[p] === b[p]) {
    p++
  }
  return p >= 3 && p >= 0.5 * n
}

/**
 * Pure-additions сторони: додані рядки, що НЕ є same-line-правкою жодного доданого рядка з іншого боку.
 * @param {string[]} added
 * @param {string[]} otherAdded
 * @returns {string[]}
 */
function pureAdds(added, otherAdded) {
  return added.filter(l => !otherAdded.some(o => similarEdit(l, o)))
}

/**
 * Агресивна валідація резолву хунка. V1 маркери · V2 непорожньо · V4 без галюцинацій (кожен рядок —
 * з якоїсь сторони) · V5 покриття обох сторін (≥1 unique з кожної) · V6 (strict) усі unique мусять
 * вціліти · V7 довжина ≥ більшої сторони. Повертає {ok, reasons[]}.
 * @param {{ours:string[],base:string[],theirs:string[]}} hunk
 * @param {string[]} resolved
 * @param {{strict?:boolean}} [opts]
 * @returns {{ok:boolean,reasons:string[]}}
 */
export function validateResolution({ ours, base, theirs }, resolved, { strict = true } = {}) {
  const reasons = []
  // V1 — жодних конфліктних маркерів.
  if (resolved.some(line => isMarker(line))) {
    reasons.push('лишилися конфліктні маркери')
  }
  const rM = meaningful(resolved)
  const oM = meaningful(ours)
  const bM = meaningful(base)
  const tM = meaningful(theirs)
  // V2 — непорожньо (крім випадку, коли обидві сторони порожні).
  if (rM.length === 0 && (oM.length > 0 || tM.length > 0)) {
    reasons.push('порожній результат')
  }
  const baseSet = new Set(bM)
  const allSet = new Set([...oM, ...bM, ...tM])
  const sideLines = [...oM, ...bM, ...tM]
  const rSet = new Set(rM)
  const oursAdded = oM.filter(l => !baseSet.has(l))
  const theirsAdded = tM.filter(l => !baseSet.has(l))
  // pure-additions: справжні доповнення сторони (не правка того ж рядка з іншого боку). Лише вони
  // ЗОБОВʼЯЗАНІ вціліти — конфлікт-заміни (port=8080 vs port=3000//ovr) законно беруть одну версію.
  const pureOurs = pureAdds(oursAdded, theirsAdded)
  const pureTheirs = pureAdds(theirsAdded, oursAdded)
  // V4 — без галюцинацій: рядок результату або дослівно з якоїсь сторони, або правдоподібна комбінація
  // (ділить префікс із рядком сторони — напр. поєднання двох same-line правок). Жорсткий фейл лише на
  // повністю чужі рядки.
  const invented = rM.filter(l => !allSet.has(l) && !sideLines.some(s => similarEdit(l, s)))
  if (invented.length) {
    reasons.push(`вигадані рядки (не з жодної сторони): ${invented.slice(0, 3).join(' | ')}`)
  }
  // V5 — покриття: pure-additions кожної сторони мають бути представлені (≥1), якщо вони є.
  if (pureOurs.length && !pureOurs.some(l => rSet.has(l))) {
    reasons.push(`втрачено ВСІ pure-add OURS: ${pureOurs.slice(0, 3).join(' | ')}`)
  }
  if (pureTheirs.length && !pureTheirs.some(l => rSet.has(l))) {
    reasons.push(`втрачено ВСІ pure-add THEIRS: ${pureTheirs.slice(0, 3).join(' | ')}`)
  }
  // V6 (strict) — УСІ pure-additions кожної сторони мусять вціліти (не лише ≥1).
  if (strict) {
    const missOurs = pureOurs.filter(l => !rSet.has(l))
    const missTheirs = pureTheirs.filter(l => !rSet.has(l))
    if (missOurs.length) {
      reasons.push(`відсутні pure-add OURS: ${missOurs.slice(0, 5).join(' | ')}`)
    }
    if (missTheirs.length) {
      reasons.push(`відсутні pure-add THEIRS: ${missTheirs.slice(0, 5).join(' | ')}`)
    }
  }
  // V7 — результат не коротший за більшу сторону (тихе скорочення = втрата).
  if (rM.length < Math.max(oM.length, tM.length)) {
    reasons.push(`результат коротший за більшу сторону (${rM.length} < ${Math.max(oM.length, tM.length)})`)
  }
  return { ok: reasons.length === 0, reasons }
}

/**
 * Будує chat-повідомлення для одного хунка: system із правилами + few-shot, user із блоками
 * OURS/BASE/THEIRS і (за наявності) таргетованим фідбеком попередньої відхиленої спроби.
 * @param {{ours:string[],base:string[],theirs:string[]}} hunk
 * @param {string} feedback
 * @returns {Array<{role:string,content:string}>}
 */
function buildMessages(hunk, feedback) {
  const sys = [
    'Ти розвʼязуєш ОДИН git-конфлікт. Дано три версії: OURS, BASE, THEIRS.',
    'Поверни ОДИН злитий результат, що зберігає наміри ОБОХ сторін (OURS і THEIRS).',
    'Правила:',
    '- Збережи КОЖЕН рядок, доданий в OURS (відносно BASE), І КОЖЕН доданий в THEIRS. Не викидай рядок лише тому, що він на одній стороні.',
    '- Якщо сторони правлять той самий рядок по-різному — поєднай розумно.',
    '- НЕ вигадуй рядків, яких немає в жодній версії.',
    `- Виведи РІВНО злиті рядки між маркерами ${RESOLVE_START} та ${RESOLVE_END}. Без пояснень, без code fence.`,
    '',
    'Приклад:',
    'OURS:',
    'const host = "0.0.0.0"',
    'const port = 8080',
    'BASE:',
    'const port = 3000',
    'THEIRS:',
    'const port = 3000 // override',
    'const debug = true',
    'Правильна відповідь:',
    RESOLVE_START,
    'const host = "0.0.0.0"',
    'const port = 3000 // override',
    'const debug = true',
    RESOLVE_END,
  ].join('\n')
  const user = [
    'OURS:',
    hunk.ours.join('\n'),
    'BASE:',
    hunk.base.join('\n'),
    'THEIRS:',
    hunk.theirs.join('\n'),
    feedback ? `\nПопередня відповідь відхилена: ${feedback}. Виправ і виведи знову між маркерами.` : '',
  ].join('\n')
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ]
}

/**
 * Generate-validate цикл для одного хунка. Температура росте на ретраях (0 → 0.3 → 0.6), бо при temp=0
 * повтор того ж промпта дав би той самий хибний вихід; фідбек теж змінює вхід.
 * @param {{ours:string[],base:string[],theirs:string[]}} hunk
 * @param {object} cfg
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ok:boolean,resolved?:string[],attempts?:number,reasons?:string}>}
 */
export async function resolveHunk(hunk, cfg, fetchFn = fetch) {
  const temps = [0, 0.3, 0.6]
  let feedback = ''
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    const temperature = temps[Math.min(attempt, temps.length - 1)]
    const out = await omlxChat(buildMessages(hunk, feedback), cfg, { temperature }, fetchFn)
    const resolved = extractResolved(out)
    const { ok, reasons } = validateResolution(hunk, resolved, { strict: cfg.strict })
    if (ok) {
      return { ok: true, resolved, attempts: attempt + 1 }
    }
    feedback = reasons.join('; ')
  }
  return { ok: false, reasons: feedback }
}

/**
 * Резолвить усі хунки тексту файлу. Нерозвʼязані хунки лишаються з маркерами (на ручний резолв).
 * @param {string} text
 * @param {object} cfg
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{text:string,resolved:number,failed:number,details:object[]}>}
 */
export async function resolveFileText(text, cfg, fetchFn = fetch) {
  const segments = parseConflicts(text)
  let resolved = 0
  let failed = 0
  const details = []
  for (const seg of segments) {
    if (seg.type !== 'conflict') {
      continue
    }
    const r = await resolveHunk(seg, cfg, fetchFn)
    if (r.ok) {
      seg.resolved = r.resolved
      resolved++
      details.push({ ok: true, attempts: r.attempts, ours: seg.ours, theirs: seg.theirs, resolved: r.resolved })
    } else {
      seg.resolved = rebuildMarkers(seg)
      failed++
      details.push({ ok: false, reasons: r.reasons })
    }
  }
  return { text: reconstruct(segments), resolved, failed, details }
}

/**
 * Читає → резолвить → пише кожен файл. Якщо модель не задана — бере дефолт із `/v1/models`.
 * @param {string[]} files
 * @param {object} cfg
 * @param {{readFile?:typeof readFileSync,writeFile?:typeof writeFileSync,fetch?:typeof fetch}} [deps]
 * @returns {Promise<{ok:boolean,summary:object[]}>}
 */
export async function resolveFiles(files, cfg, deps = {}) {
  const read = deps.readFile || readFileSync
  const write = deps.writeFile || writeFileSync
  const fetchFn = deps.fetch || fetch
  const resolved = { ...cfg, model: cfg.model || (await ensureModel(cfg, fetchFn)) }
  const summary = []
  let anyFailed = false
  for (const file of files) {
    const res = await resolveFileText(read(file, 'utf8'), resolved, fetchFn)
    write(file, res.text)
    if (res.failed) {
      anyFailed = true
    }
    summary.push({ file, ...res })
  }
  return { ok: !anyFailed, summary }
}
