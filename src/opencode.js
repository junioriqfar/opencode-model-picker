import { readFileSync, writeFileSync } from 'node:fs'
import { opencodeConfigPath, parseJsonc, stripJsoncComments } from './utils.js'
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
 * @param {Array} orderedModels - array {id, shortName, vision}
 * @param {Object} opts
 * @param {Array<string>} opts.paidIds - daftar model yang ditandai PAID
 * @param {boolean} opts.markPaid - label PAID
 * @param {string} opts.numbering - gaya penomoran: '01.', '1.', '001.', '01 -', 'none'
 */
export function buildModelsBlock(orderedModels, { paidIds = [], markPaid = false, numbering = '01.' } = {}) {
  const models = {}
  orderedModels.forEach((m, i) => {
    const prefix = formatNumber(i, numbering)
    const isPaid = paidIds.includes(m.id)
    const paidSuffix = markPaid && isPaid ? ' (PAID)' : ''
    models[m.id] = {
      name: `${prefix}${m.shortName}${paidSuffix}`,
      modalities: {
        input: m.vision ? ['text', 'image'] : ['text'],
        output: ['text'],
      },
    }
  })
  return models
}

export function providerExists(providerKey, lang = 'en') {
  const { config } = readOpencodeConfig(lang)
  return !!(config.provider && config.provider[providerKey])
}

export function writeOpencodeConfig(providerKey, providerBlock, lang = 'en') {
  const { config, path, exists } = readOpencodeConfig(lang)
  if (!config.provider) config.provider = {}

  // simpan opsi provider lain jika ada
  const existing = config.provider[providerKey]
  config.provider[providerKey] = {
    ...(existing ?? {}),
    ...providerBlock,
  }

  const out = JSON.stringify(config, null, 2) + '\n'
  writeFileSync(path, out, 'utf8')
  return path
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
