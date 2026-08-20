import { readFileSync, writeFileSync } from 'node:fs'
import { opencodeConfigPath, parseJsonc, stripJsoncComments } from './utils.js'

export function readOpencodeConfig() {
  const path = opencodeConfigPath()
  const raw = readFileSafe(path)
  if (raw === null) {
    return { config: {}, path, exists: false }
  }
  try {
    const config = parseJsonc(raw)
    return { config, path, exists: true }
  } catch (err) {
    throw new Error(
      `Gagal memparsing ${path}: ${err.message}\nPerbaiki file tersebut terlebih dahulu.`,
    )
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
 * @param {Array} orderedModels - array {id, displayName}
 * @param {boolean} paidMode - label PAID
 * @param {Array<string>} paidIds - daftar model yang ditandai PAID
 */
export function buildModelsBlock(orderedModels, { paidIds = [], markPaid = false } = {}) {
  const models = {}
  orderedModels.forEach((m, i) => {
    const number = String(i + 1).padStart(2, '0')
    const isPaid = paidIds.includes(m.id)
    const paidSuffix = markPaid && isPaid ? ' (PAID)' : ''
    models[m.id] = {
      name: `${number}. ${m.shortName}${paidSuffix}`,
      modalities: {
        input: m.vision ? ['text', 'image'] : ['text'],
        output: ['text'],
      },
    }
  })
  return models
}

export function providerExists(providerKey) {
  const { config } = readOpencodeConfig()
  return !!(config.provider && config.provider[providerKey])
}

export function writeOpencodeConfig(providerKey, providerBlock) {
  const { config, path, exists } = readOpencodeConfig()
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

export function previewConfig(providerKey, providerBlock) {
  const { config } = readOpencodeConfig()
  if (!config.provider) config.provider = {}
  const existing = config.provider[providerKey]
  config.provider[providerKey] = {
    ...(existing ?? {}),
    ...providerBlock,
  }
  return JSON.stringify(config, null, 2)
}
