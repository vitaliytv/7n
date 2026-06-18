import { loadOmlxConfig, resolveFiles } from './omlx.mjs'

// CLI-ентрі Tier-3 резолву для zsh-ядра (_n7merge_resolve_with_agent шелл-аутить сюди як
// `node omlx-resolve.js <files…>`). Редагує файли in-place через локальний omlx і друкує per-file
// підсумок у stdout (його zsh забирає у розділ Tier 3). Exit 0 — усі хунки розвʼязано; 1 — лишилися
// нерозвʼязані (з маркерами) або omlx недоступний.

const trunc = lines => {
  const s = (Array.isArray(lines) ? lines.join(' ') : String(lines)).trim()
  return s.length > 70 ? `${s.slice(0, 67)}…` : s
}

// Живий прогрес резолву → stderr (stdout захоплює zsh для розділу Tier 3). Перетворює події ядра
// (omlx.mjs) на людські рядки, щоб довгий generate-validate цикл не виглядав як «зависло».
const reportProgress = event => {
  if (event.type === 'start') {
    process.stderr.write(`🤖 Локальний omlx: ${event.files} файл(и), модель ${event.model} @ ${event.url}\n`)
  } else if (event.type === 'file') {
    process.stderr.write(`📄 [${event.index}/${event.total}] ${event.file} — ${event.hunks} конфліктних хунк(и)\n`)
  } else if (event.type === 'attempt' && event.attempt === 1) {
    process.stderr.write(`   hunk ${event.hunkIndex}/${event.hunkTotal} · спроба 1 (t=${event.temperature}) · OURS: ${trunc(event.ours)} ↔ THEIRS: ${trunc(event.theirs)}\n`)
  } else if (event.type === 'attempt') {
    // attempt>0 несе feedback — причину відхилення попередньої спроби (point 4).
    process.stderr.write(`   ↻ відхилено: ${trunc(event.feedback)} → спроба ${event.attempt}/${event.total} (t=${event.temperature})\n`)
  } else if (event.type === 'json-retry') {
    process.stderr.write(`   🔧 JSON невалідний — пере-резолв (pass ${event.pass}/${event.total})\n`)
  }
}

/**
 * Резолвить передані файли через локальний omlx, друкує per-file підсумок у stdout.
 * @param {string[]} files
 * @returns {Promise<number>} 0 — усе розвʼязано; 1 — лишилися хунки або omlx недоступний.
 */
async function main(files) {
  if (files.length === 0) {
    process.stderr.write('omlx-resolve: не передано файлів\n')
    return 1
  }
  try {
    const { ok, summary } = await resolveFiles(files, loadOmlxConfig(), { onProgress: reportProgress })
    for (const s of summary) {
      process.stdout.write(`📄 ${s.file}: розвʼязано ${s.resolved}, не вдалося ${s.failed}\n`)
      for (const d of s.details) {
        if (d.ok) {
          process.stdout.write(`   ✅ хунк (спроб: ${d.attempts}) — OURS: ${trunc(d.ours)} · THEIRS: ${trunc(d.theirs)} → ${trunc(d.resolved)}\n`)
        } else {
          process.stdout.write(`   ❌ хунк не розвʼязано: ${d.reasons}\n`)
        }
      }
    }
    return ok ? 0 : 1
  } catch (error) {
    process.stderr.write(`❌ omlx-resolve: ${error.message}\n`)
    return 1
  }
}

process.exitCode = await main(process.argv.slice(2).filter(Boolean))
