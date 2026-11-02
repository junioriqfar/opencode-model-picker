import { readFileSync } from 'node:fs'
import { appConfigPath, ensureConfigDir, writeFileAtomic } from './utils.js'
import {
  createMachineSecurity,
  decryptString,
  encryptString,
  getMachineKey,
  isEncrypted,
  verifySecurity,
} from './crypto.js'

export const DEFAULT_SETTINGS = {
  language: 'en',
  timeout: 15,
  numbering: '01.',
  sort: 'score',
  credentialStorage: 'auth',
  checkUpdates: true,
}

export const DEFAULT_CONFIG = {
  providers: [],
  settings: { ...DEFAULT_SETTINGS },
  security: { mode: 'none' },
}

function readParsedConfig() {
  try {
    const raw = readFileSync(appConfigPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeConfig(parsed) {
  const merged = { ...DEFAULT_CONFIG, ...parsed }
  // deep merge settings with defaults (handle old configs)
  merged.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
  if (!['en', 'id'].includes(merged.settings.language)) merged.settings.language = DEFAULT_SETTINGS.language
  if (!Number.isInteger(merged.settings.timeout) || merged.settings.timeout < 1 || merged.settings.timeout > 300) {
    merged.settings.timeout = DEFAULT_SETTINGS.timeout
  }
  if (!['01.', '1.', '001.', '01 -', 'none'].includes(merged.settings.numbering)) {
    merged.settings.numbering = DEFAULT_SETTINGS.numbering
  }
  if (!['score', 'name'].includes(merged.settings.sort)) {
    merged.settings.sort = DEFAULT_SETTINGS.sort
  }
  if (!['auth', 'config'].includes(merged.settings.credentialStorage)) {
    merged.settings.credentialStorage = DEFAULT_SETTINGS.credentialStorage
  }
  if (typeof merged.settings.checkUpdates !== 'boolean') {
    merged.settings.checkUpdates = DEFAULT_SETTINGS.checkUpdates
  }
  if (!Array.isArray(merged.providers)) merged.providers = []
  if (!merged.security || typeof merged.security !== 'object' || Array.isArray(merged.security)) {
    merged.security = { mode: 'none' }
  }
  if (!['none', 'machine', 'password'].includes(merged.security.mode)) {
    merged.security = { mode: 'none' }
  }
  return merged
}

export function loadRawAppConfig() {
  const parsed = readParsedConfig()
  if (!parsed) return { ...DEFAULT_CONFIG, providers: [], settings: { ...DEFAULT_SETTINGS }, security: { mode: 'none' } }
  return normalizeConfig(parsed)
}

export function loadAppConfig() {
  const parsed = readParsedConfig()
  if (!parsed) return { ...DEFAULT_CONFIG, providers: [], settings: { ...DEFAULT_SETTINGS }, security: { mode: 'none' } }
  const merged = normalizeConfig(parsed)
  if (merged.security.mode === 'password') throw new Error('LEGACY_PASSWORD_CONFIG')
  if (merged.security.mode === 'machine') {
    const key = getMachineKey(merged.security)
    merged.providers = merged.providers.map((provider) => {
      if (!provider || typeof provider !== 'object') return provider
      if (typeof provider.apiKey === 'string' && isEncrypted(provider.apiKey)) {
        return { ...provider, apiKey: decryptString(provider.apiKey, key) }
      }
      return provider
    })
  }
  return merged
}

export function saveAppConfig(config) {
  if (!config.security || config.security.mode === 'none') {
    config.security = createMachineSecurity().security
  }
  if (config.security.mode === 'password') throw new Error('LEGACY_PASSWORD_CONFIG')
  const key = getMachineKey(config.security)
  const providers = (Array.isArray(config.providers) ? config.providers : []).map((provider) => {
    if (!provider || typeof provider !== 'object') return provider
    if (typeof provider.apiKey === 'string' && provider.apiKey && !isEncrypted(provider.apiKey)) {
      return { ...provider, apiKey: encryptString(provider.apiKey, key) }
    }
    return provider
  })
  ensureConfigDir()
  const out = { ...config, providers }
  writeFileAtomic(appConfigPath(), JSON.stringify(out, null, 2) + '\n', { mode: 0o600 })
}

// Encrypt plaintext keys left by older versions on startup.
export function ensureMachineEncryption() {
  const raw = loadRawAppConfig()
  const hasPlain = raw.providers.some(
    (provider) => provider && typeof provider.apiKey === 'string' && provider.apiKey && !isEncrypted(provider.apiKey),
  )
  if (!hasPlain) return false
  if (raw.security?.mode === 'password') throw new Error('LEGACY_PASSWORD_CONFIG')
  saveAppConfig(raw)
  return true
}

// One-time migration for configs created by the short-lived master-password
// version. After this succeeds the config is machine-encrypted and no future
// password is needed.
export function migrateFromPassword(password) {
  const raw = loadRawAppConfig()
  if (raw.security?.mode !== 'password') return true
  const key = verifySecurity(raw.security, password)
  if (!key) return false
  const providers = raw.providers.map((provider) => {
    if (!provider || typeof provider !== 'object') return provider
    if (typeof provider.apiKey === 'string' && isEncrypted(provider.apiKey)) {
      return { ...provider, apiKey: decryptString(provider.apiKey, key) }
    }
    return provider
  })
  const { security } = createMachineSecurity()
  saveAppConfig({ ...raw, providers, security })
  return true
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
