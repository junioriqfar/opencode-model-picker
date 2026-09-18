import { copyFileSync } from 'node:fs'
import { opencodeConfigPath, parseJsonc, readFileSafe, writeFileAtomic } from './utils.js'
import { t, formatNumber } from './i18n.js'
import { getGoModelMeta } from './go-models.js'

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

// Peta endpoint -> paket AI SDK yang dipakai opencode.
export function npmForApi(api) {
  if (api === 'messages') return '@ai-sdk/anthropic'
  if (api === 'responses') return '@ai-sdk/openai'
  return '@ai-sdk/openai-compatible'
}

/**
 * Bangun struktur blok model sesuai skema opencode.
 * @param {Array} orderedModels - array {id, shortName, vision, api?}
 *   api: 'chat' | 'messages' | 'responses' (hasil deteksi endpoint Go).
 *   Untuk OpenCode Go, model minimax/qwen butuh @ai-sdk/anthropic (/messages)
 *   dan muse-spark/grok/luna butuh @ai-sdk/openai (/responses).
 *   Lihat https://opencode.ai/docs/go/#endpoints
 * @param {Object} opts
 * @param {string} opts.numbering - gaya penomoran: '01.', '1.', '001.', '01 -', 'none'
 * @param {string} opts.defaultNpm - npm default provider-level
 * @param {boolean} opts.go - true untuk OpenCode Go: tulis capabilities + limit
 *   agar OpenCode otomatis membuat model variants (mis. low/medium/high).
 */
export function buildModelsBlock(
  orderedModels,
  { numbering = '01.', defaultNpm = '@ai-sdk/openai-compatible', go = false } = {},
) {
  const models = {}
  orderedModels.forEach((m, i) => {
    const prefix = formatNumber(i, numbering)
    const entry = {
      name: `${prefix}${m.shortName}`,
      modalities: {
        input: m.vision ? ['text', 'image'] : ['text'],
        output: ['text'],
      },
    }

    if (go) {
      // Metadata OpenCode Go (dari models.dev). `reasoning` memicu variants,
      // dan `limit.output` wajib agar varian Anthropic (@ai-sdk/anthropic)
      // tidak menghasilkan budgetTokens negatif (lihat ProviderTransform.variants).
      const meta = getGoModelMeta(m.id)
      entry.reasoning = meta.reasoning !== false
      entry.limit = {
        context: m.contextLength ?? meta.context,
        output: m.maxOutput ?? meta.output,
      }
      if (Array.isArray(meta.input) && meta.input.length > 0) {
        entry.modalities = { input: meta.input, output: ['text'] }
      }
    }

    // Override per-model hanya untuk minoritas, agar sesedikit mungkin bergantung
    // pada provider.npm per-model (lihat anomalyco/opencode#31919/#33888).
    const needNpm = m.api ? npmForApi(m.api) : null
    if (needNpm && needNpm !== defaultNpm) {
      entry.provider = { npm: needNpm }
    }
    models[m.id] = entry
  })
  return models
}

/**
 * Bangun blok provider opencode.
 * `name` sengaja selalu sama dengan `key` yang diketik user, agar label
 * provider di OpenCode konsisten dengan key-nya.
 * @param {Object} opts
 * @param {string} opts.key - provider key di opencode
 * @param {string} opts.npm - npm provider-level
 * @param {string} opts.baseURL
 * @param {string} opts.apiKey
 * @param {Object} opts.models - hasil buildModelsBlock
 */
export function buildProviderBlock({ key, npm, baseURL, apiKey, models }) {
  return {
    npm,
    name: key,
    options: {
      baseURL,
      apiKey,
    },
    models,
  }
}

/**
 * Tentukan npm provider-level dari api yang paling banyak dipakai.
 * Mayoritas dipasang di level provider, minoritas diberi override per-model,
 * sehingga sesedikit mungkin bergantung pada override per-model.
 */
export function pickProviderNpm(orderedModels, fallback = '@ai-sdk/openai-compatible') {
  const counts = new Map()
  for (const m of orderedModels ?? []) {
    const api = m.api || 'chat'
    counts.set(api, (counts.get(api) ?? 0) + 1)
  }
  if (counts.size === 0) return fallback
  let topApi = 'chat'
  let topCount = -1
  for (const [api, count] of counts) {
    if (count > topCount) {
      topCount = count
      topApi = api
    }
  }
  return npmForApi(topApi)
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
