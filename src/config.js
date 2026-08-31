import { readFileSync, writeFileSync } from 'node:fs'
import { appConfigPath, ensureConfigDir } from './utils.js'

export const DEFAULT_SETTINGS = {
  language: 'en',
  timeout: 15,
  numbering: '01.',
}

export const DEFAULT_CONFIG = {
  providers: [],
  settings: { ...DEFAULT_SETTINGS },
}

export function loadAppConfig() {
  try {
    const raw = readFileSync(appConfigPath(), 'utf8')
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULT_CONFIG, ...parsed }
    // deep merge settings with defaults (handle old configs)
    merged.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
    // normalize
    if (!['en', 'id'].includes(merged.settings.language)) merged.settings.language = DEFAULT_SETTINGS.language
    if (!Number.isInteger(merged.settings.timeout) || merged.settings.timeout < 1 || merged.settings.timeout > 300) {
      merged.settings.timeout = DEFAULT_SETTINGS.timeout
    }
    if (!['01.', '1.', '001.', '01 -', 'none'].includes(merged.settings.numbering)) {
      merged.settings.numbering = DEFAULT_SETTINGS.numbering
    }
    // ensure providers is array
    if (!Array.isArray(merged.providers)) merged.providers = []
    return merged
  } catch {
    return { providers: [], settings: { ...DEFAULT_SETTINGS } }
  }
}

export function saveAppConfig(config) {
  ensureConfigDir()
  writeFileSync(appConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf8')
}

export function upsertProvider(config, provider) {
  const idx = config.providers.findIndex(
    (p) =>
      p.baseURL === provider.baseURL &&
      p.apiKey === provider.apiKey &&
      p.name === provider.name,
  )
  if (idx >= 0) config.providers[idx] = provider
  else config.providers.push(provider)
  return config
}

export function updateProvider(config, index, patch) {
  if (index >= 0 && index < config.providers.length) {
    config.providers[index] = { ...config.providers[index], ...patch }
  }
  return config
}

export function deleteProvider(config, index) {
  if (index >= 0 && index < config.providers.length) {
    config.providers.splice(index, 1)
  }
  return config
}
