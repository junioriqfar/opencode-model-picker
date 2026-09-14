import { readFileSync, copyFileSync } from 'node:fs'
import { opencodeConfigPath, parseJsonc, writeFileAtomic } from './utils.js'
import { t, formatNumber } from './i18n.js'

export function readOpencodeConfig(lang = 'en') {
  const path = opencodeConfigPath()
  const raw = readFileSafe(path)
  if (raw === null) {
    return { config: {}, path, exists: false }
  }
  try {
    const config = parseJsonc(raw)
    return { config, path, exists: true }
  } catch (err) {
    throw new Error(t(lang, 'errParseConfig', { path, msg: err.message }))
  }
}

function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Bangun struktur blok model sesuai skema opencode.
 * @param {Array} orderedModels - array {id, shortName, vision, api?}
 *   api: 'chat' | 'messages' | 'responses' (hasil deteksi endpoint Go).
 *   Untuk OpenCode Go, model minimax/qwen butuh @ai-sdk/anthropic (/messages)
 *   dan muse-spark/grok/luna butuh @ai-sdk/openai (/responses).
 *   Lihat https://opencode.ai/docs/go/#endpoints
 * @param {Object} opts
 * @param {Array<string>} opts.paidIds - daftar model yang ditandai PAID
 * @param {boolean} opts.markPaid - label PAID
 * @param {string} opts.numbering - gaya penomoran: '01.', '1.', '001.', '01 -', 'none'
 * @param {string} opts.defaultNpm - npm default provider-level
 */
export function buildModelsBlock(
  orderedModels,
  { paidIds = [], markPaid = false, numbering = '01.', defaultNpm = '@ai-sdk/openai-compatible' } = {},
) {
  const models = {}
  orderedModels.forEach((m, i) => {
    const prefix = formatNumber(i, numbering)
    const isPaid = paidIds.includes(m.id)
    const paidSuffix = markPaid && isPaid ? ' (PAID)' : ''
    const entry = {
      name: `${prefix}${m.shortName}${paidSuffix}`,
      modalities: {
        input: m.vision ? ['text', 'image'] : ['text'],
        output: ['text'],
      },
    }
    // Override per-model agar runtime opencode memakai SDK yang benar.
    // Format: { provider: { npm: "..." } } sesuai diskusi anomalyco/opencode#31919.
    const needNpm = m.api === 'messages' ? '@ai-sdk/anthropic' : m.api === 'responses' ? '@ai-sdk/openai' : null
    if (needNpm && needNpm !== defaultNpm) {
      entry.provider = { npm: needNpm }
    }
    models[m.id] = entry
  })
  return models
}

/**
 * Tentukan npm provider-level yang paling cocok dari daftar model.
 * Jika semua model memakai api yang sama, pakai npm-nya langsung
 * sehingga tidak perlu override per-model.
 */
export function pickProviderNpm(orderedModels, fallback = '@ai-sdk/openai-compatible') {
  const apis = new Set((orderedModels ?? []).map((m) => m.api).filter(Boolean))
  if (apis.size === 1) {
    const only = [...apis][0]
    if (only === 'messages') return '@ai-sdk/anthropic'
    if (only === 'responses') return '@ai-sdk/openai'
    return '@ai-sdk/openai-compatible'
  }
  return fallback
}

export function providerExists(providerKey, lang = 'en') {
  const { config } = readOpencodeConfig(lang)
  return !!(config.provider && config.provider[providerKey])
}

export function writeOpencodeConfig(providerKey, providerBlock, lang = 'en') {
  const { config, path, exists } = readOpencodeConfig(lang)
  if (!config.provider) config.provider = {}

  // Backup file asli sebelum ditulis ulang (komentar/format asli tidak dipertahankan).
  const backupPath = `${path}.bak`
  let backedUp = false
  if (exists) {
    try {
      copyFileSync(path, backupPath)
      backedUp = true
    } catch {
      backedUp = false
    }
  }

  // simpan opsi provider lain jika ada
  const existing = config.provider[providerKey]
  config.provider[providerKey] = {
    ...(existing ?? {}),
    ...providerBlock,
  }

  const out = JSON.stringify(config, null, 2) + '\n'
  writeFileAtomic(path, out)
  return { path, backupPath: backedUp ? backupPath : null }
}

export function previewConfig(providerKey, providerBlock, lang = 'en') {
  const { config } = readOpencodeConfig(lang)
  if (!config.provider) config.provider = {}
  const existing = config.provider[providerKey]
  config.provider[providerKey] = {
    ...(existing ?? {}),
    ...providerBlock,
  }
  return JSON.stringify(config, null, 2)
}
