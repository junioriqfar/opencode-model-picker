import { readFileSync, writeFileSync } from 'node:fs'
import { appConfigPath, ensureConfigDir } from './utils.js'

export const DEFAULT_CONFIG = {
  providers: [],
}

export function loadAppConfig() {
  try {
    const raw = readFileSync(appConfigPath(), 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
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
