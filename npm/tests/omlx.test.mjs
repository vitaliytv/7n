/* eslint-disable @microsoft/sdl/no-insecure-url, sonarjs/no-clear-text-protocols -- локальні omlx-URL (http) лише в тест-фікстурах */
import { describe, expect, it, vi } from 'vitest'

import {
  extractResolved,
  loadOmlxConfig,
  omlxChat,
  parseConflicts,
  reconstruct,
  resolveFileText,
  resolveHunk,
  validateResolution,
  RESOLVE_END,
  RESOLVE_START,
} from '../omlx.mjs'

// Фейковий fetch для chat-completions: дає черговий вихід зі списку (по виклику).
const fakeFetch = outputs => {
  let i = 0
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: outputs[Math.min(i++, outputs.length - 1)] } }] }),
  }))
}
const wrap = body => `${RESOLVE_START}\n${body}\n${RESOLVE_END}`

describe('loadOmlxConfig', () => {
  // Матчимо за повним іменем файлу (model_settings.json теж закінчується на settings.json).
  const read = files => path => {
    const name = path.split('/').pop()
    if (name in files) {
      return JSON.stringify(files[name])
    }
    throw new Error('ENOENT')
  }

  it('будує URL/ключ/дефолт-модель із ~/.omlx; ключ дефолтиться на omlx-local-test-key', () => {
    const cfg = loadOmlxConfig(
      {},
      read({
        'settings.json': { server: { host: '127.0.0.1', port: 8000 }, auth: { api_key: 'omlx-local-test-key' } },
        'model_settings.json': { models: { 'gemma-4-e4b-it-OptiQ-4bit': { is_default: true }, other: {} } },
      }),
      '/home/u'
    )
    expect(cfg.url).toBe('http://127.0.0.1:8000')
    expect(cfg.key).toBe('omlx-local-test-key')
    expect(cfg.model).toBe('gemma-4-e4b-it-OptiQ-4bit')
    expect(cfg.strict).toBe(true)
  })

  it('env-оверайди мають пріоритет; STRICT=0 вимикає V6', () => {
    const cfg = loadOmlxConfig(
      { N7MERGE_OMLX_URL: 'http://x:9', N7MERGE_OMLX_KEY: 'k', N7MERGE_OMLX_MODEL: 'm', N7MERGE_OMLX_STRICT: '0' },
      () => {
        throw new Error('no file')
      },
      '/home/u'
    )
    expect(cfg.url).toBe('http://x:9')
    expect(cfg.key).toBe('k')
    expect(cfg.model).toBe('m')
    expect(cfg.strict).toBe(false)
  })

  it('без конфіга й env — ключ-дефолт і дефолтний URL', () => {
    const cfg = loadOmlxConfig(
      {},
      () => {
        throw new Error('no file')
      },
      '/home/u'
    )
    expect(cfg.url).toBe('http://127.0.0.1:8000')
    expect(cfg.key).toBe('omlx-local-test-key')
    expect(cfg.model).toBeUndefined()
  })
})

describe('parseConflicts / reconstruct', () => {
  it('парсить diff3-хунк на ours/base/theirs і відновлює файл 1:1', () => {
    const text = ['a', '<<<<<<< OURS', 'o1', '||||||| BASE', 'b1', '=======', 't1', '>>>>>>> THEIRS', 'z'].join('\n')
    const segs = parseConflicts(text)
    const conflict = segs.find(s => s.type === 'conflict')
    expect(conflict.ours).toEqual(['o1'])
    expect(conflict.base).toEqual(['b1'])
    expect(conflict.theirs).toEqual(['t1'])
    // reconstruct із resolved=маркери назад дає вихідний текст.
    conflict.resolved = ['<<<<<<< OURS', 'o1', '||||||| BASE', 'b1', '=======', 't1', '>>>>>>> THEIRS']
    expect(reconstruct(segs)).toBe(text)
  })

  it('текст без конфліктів — один text-сегмент, reconstruct тотожний', () => {
    const text = 'line1\nline2\n'
    expect(reconstruct(parseConflicts(text))).toBe(text)
  })
})

describe('extractResolved', () => {
  it('бере вміст між sentinel, обрізає порожні краї й code-fence', () => {
    expect(extractResolved(`шум\n${RESOLVE_START}\n\`\`\`\nx\ny\n\`\`\`\n${RESOLVE_END}\nхвіст`)).toEqual(['x', 'y'])
  })
  it('без sentinel — увесь вихід (фолбек)', () => {
    expect(extractResolved('a\nb')).toEqual(['a', 'b'])
  })
})

describe('validateResolution', () => {
  const hunk = { ours: ['host', 'port=8080'], base: ['port=3000'], theirs: ['port=3000 // ovr', 'debug'] }

  it('V1 ловить лишені маркери', () => {
    const r = validateResolution(hunk, ['<<<<<<< OURS', 'host'])
    expect(r.ok).toBe(false)
    expect(r.reasons.join()).toMatch(/маркери/)
  })

  it('V5 ловить дроп pure-add однієї сторони (кейс host), але port=8080→port=3000//ovr — НЕ дроп', () => {
    // Взято лише THEIRS-сторону: host (pure-add ours) загублено. port=8080 — same-line правка, не pure.
    const r = validateResolution(hunk, ['port=3000 // ovr', 'debug'], { strict: false })
    expect(r.ok).toBe(false)
    expect(r.reasons.join()).toMatch(/pure-add OURS/)
  })

  it('V4 ловить повністю чужі рядки, але толерує комбінацію same-line правок', () => {
    expect(validateResolution(hunk, ['host', 'port=3000 // ovr', 'debug', 'INVENTED']).reasons.join()).toMatch(/вигадані/)
    // Комбінований рядок ділить префікс із port-рядками сторін → не галюцинація.
    const combo = validateResolution({ ours: ['port=8080'], base: ['port=3000'], theirs: ['port=9090'] }, ['port=8080 || port=9090'])
    expect(combo.reasons.join()).not.toMatch(/вигадані/)
  })

  it('V6 (strict): коректний мердж проходить (заміна port не вимагається), часткова втрата pure-add — ні', () => {
    // host (pure ours) + debug/verbose (pure theirs); port=8080 законно замінено.
    const h2 = { ours: ['host', 'port=8080'], base: ['port=3000'], theirs: ['port=3000 // ovr', 'debug', 'verbose'] }
    expect(validateResolution(h2, ['host', 'port=3000 // ovr', 'debug', 'verbose'], { strict: true }).ok).toBe(true)
    // Пропущено verbose (pure-add theirs): strict валить; нестрогий пропускає (≥1 pure theirs = debug).
    const partial = ['host', 'port=3000 // ovr', 'debug']
    expect(validateResolution(h2, partial, { strict: true }).ok).toBe(false)
    expect(validateResolution(h2, partial, { strict: false }).ok).toBe(true)
  })

  it('V7 ловить тихе скорочення', () => {
    const r = validateResolution({ ours: ['a', 'b', 'c'], base: [], theirs: ['a', 'b', 'c'] }, ['a'])
    expect(r.reasons.join()).toMatch(/коротший/)
  })
})

describe('omlxChat', () => {
  it('POST з Bearer-ключем і форсованою temperature=0', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }))
    const out = await omlxChat([{ role: 'user', content: 'x' }], { url: 'http://h:8000', key: 'K', model: 'M', maxTokens: 10 }, {}, fetchFn)
    expect(out).toBe('ok')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://h:8000/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer K')
    expect(JSON.parse(init.body).temperature).toBe(0)
  })

  it('кидає на HTTP-помилку (напр. memory ceiling)', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'memory ceiling' }))
    await expect(omlxChat([], { url: 'u', key: 'k', model: 'm', maxTokens: 1 }, {}, fetchFn)).rejects.toThrow(/HTTP 500/)
  })
})

describe('resolveHunk (цикл)', () => {
  const hunk = { ours: ['host', 'port=8080'], base: ['port=3000'], theirs: ['port=3000 // ovr', 'debug'] }
  const cfg = { url: 'u', key: 'k', model: 'm', maxTokens: 100, retries: 3, strict: true }

  it('перша валідна відповідь приймається', async () => {
    const fetchFn = fakeFetch([wrap('host\nport=3000 // ovr\ndebug')])
    const r = await resolveHunk(hunk, cfg, fetchFn)
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(1)
    expect(r.resolved).toEqual(['host', 'port=3000 // ovr', 'debug'])
  })

  it('ретраїть погану відповідь і приймає наступну валідну', async () => {
    const fetchFn = fakeFetch([wrap('port=3000 // ovr\ndebug'), wrap('host\nport=3000 // ovr\ndebug')])
    const r = await resolveHunk(hunk, cfg, fetchFn)
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('після вичерпання ретраїв — ok:false', async () => {
    const fetchFn = fakeFetch([wrap('port=3000 // ovr\ndebug')]) // завжди губить host
    const r = await resolveHunk(hunk, { ...cfg, retries: 2 }, fetchFn)
    expect(r.ok).toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(3) // attempts 0..2
  })
})

describe('resolveFileText', () => {
  const cfg = { url: 'u', key: 'k', model: 'm', maxTokens: 100, retries: 1, strict: true }

  it('розвʼязаний хунк замінює маркери; нерозвʼязаний лишає маркери', async () => {
    const text = ['top', '<<<<<<< OURS', 'host', '||||||| BASE', '=======', 'debug', '>>>>>>> THEIRS', 'bottom'].join('\n')
    // Валідний мердж зберігає host (ours-unique) і debug (theirs-unique).
    const okFetch = fakeFetch([wrap('host\ndebug')])
    const okRes = await resolveFileText(text, cfg, okFetch)
    expect(okRes.failed).toBe(0)
    expect(okRes.text).toContain('host\ndebug')
    expect(okRes.text).not.toContain('<<<<<<<')

    // Завжди губить host → лишаються маркери.
    const badFetch = fakeFetch([wrap('debug')])
    const badRes = await resolveFileText(text, cfg, badFetch)
    expect(badRes.failed).toBe(1)
    expect(badRes.text).toContain('<<<<<<< OURS')
  })
})
