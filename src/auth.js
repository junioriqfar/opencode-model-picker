import { chmodSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { t } from './i18n.js'
import { ensureDir, opencodeAuthPath, writeFileAtomic } from './utils.js'

export function readAuth(lang = 'en', path = opencodeAuthPath()) {
  if (!existsSync(path)) return { auth: {}, path, exists: false }
  const raw = readFileSync(path, 'utf8')
  if (!raw.trim()) return { auth: {}, path, exists: true }
  let auth
  try {
    auth = JSON.parse(raw)
  } catch (err) {
    throw new Error(t(lang, 'errAuthParse', { path, msg: err.message }))
  }
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
    throw new Error(t(lang, 'errAuthFormat', { path }))
  }
  return { auth, path, exists: true }
}

export function getAuthEntry(providerKey, lang = 'en') {
  try {
    const { auth } = readAuth(lang)
    return auth[providerKey] ?? null
  } catch {
    return null
  }
}

export function getAuthApiKey(providerKey, lang = 'en') {
  const entry = getAuthEntry(providerKey, lang)
  return entry?.type === 'api' && typeof entry.key === 'string' ? entry.key : null
}

export function writeAuthApiKey(providerKey, apiKey, lang = 'en') {
  const { auth, path, exists } = readAuth(lang)
  let backupPath = null
  if (exists) {
    backupPath = `${path}.bak`
    copyFileSync(path, backupPath)
    try {
      chmodSync(backupPath, 0o600)
    } catch {}
  }
  const existing = auth[providerKey]
  auth[providerKey] =
    existing?.type === 'api'
      ? { ...existing, type: 'api', key: apiKey }
      : { type: 'api', key: apiKey }
  ensureDir(dirname(path))
  writeFileAtomic(path, JSON.stringify(auth, null, 2) + '\n', { mode: 0o600 })
  return { path, backupPath }
}

export function renameAuthKey(oldKey, newKey, lang = 'en') {
  const { auth, path, exists } = readAuth(lang)
  if (!exists || !auth[oldKey] || auth[newKey]) return false
  try {
    copyFileSync(path, `${path}.bak`)
    chmodSync(`${path}.bak`, 0o600)
  } catch {}
  auth[newKey] = auth[oldKey]
  delete auth[oldKey]
  writeFileAtomic(path, JSON.stringify(auth, null, 2) + '\n', { mode: 0o600 })
  return true
}
