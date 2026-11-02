import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scryptSync } from 'node:crypto'
import { homedir, userInfo } from 'node:os'

export const ENC_PREFIX = 'enc:v1:'
export const KDF_DEFAULTS = { N: 32768, r: 8, p: 1, keyLen: 32 }
const CHECK_PLAINTEXT = 'opencode-model-picker:check'
const MAXMEM = 128 * 1024 * 1024
const MACHINE_INFO = 'opencode-model-picker/credentials'

let cachedSalt = null
let cachedKey = null

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

export function machineSecret() {
  let username = 'unknown'
  try {
    username = userInfo().username
  } catch {}
  return [username, homedir(), process.platform, process.arch].join('\0')
}

export function machineKey(security, secret = machineSecret()) {
  const salt = Buffer.from(String(security?.salt ?? ''), 'base64')
  const key = hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, Buffer.from(MACHINE_INFO), 32)
  return Buffer.from(key)
}

export function getMachineKey(security) {
  if (security?.salt === cachedSalt && cachedKey !== null) return cachedKey
  cachedKey = machineKey(security)
  cachedSalt = security?.salt ?? null
  return cachedKey
}

// Salt acak + kunci turunan identitas mesin/user. Tidak ada password yang
// disimpan; ini menyamarkan isi config, bukan proteksi terhadap attacker
// yang sudah punya akses ke akun user di mesin yang sama.
export function createMachineSecurity(secret = machineSecret()) {
  const security = { mode: 'machine', salt: randomBytes(16).toString('base64') }
  return { security, key: machineKey(security, secret) }
}

export function encryptString(plaintext, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

export function decryptString(value, key) {
  if (!isEncrypted(value)) return value
  const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
  if (raw.length <= 28) throw new Error('Invalid encrypted value')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ciphertext = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

// Hanya dipakai untuk migrasi config lama yang sempat memakai master password.
export function deriveKey(password, saltBase64, params = {}) {
  const kdf = { ...KDF_DEFAULTS, ...params }
  const salt = Buffer.from(String(saltBase64 ?? ''), 'base64')
  return scryptSync(String(password), salt, kdf.keyLen, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: MAXMEM,
  })
}

export function verifySecurity(security, password) {
  if (!security || security.mode !== 'password' || !security.salt || !security.check) return null
  try {
    const key = deriveKey(password, security.salt, security.kdf)
    if (decryptString(security.check, key) !== CHECK_PLAINTEXT) return null
    return key
  } catch {
    return null
  }
}
