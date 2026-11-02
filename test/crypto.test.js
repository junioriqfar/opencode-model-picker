import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  KDF_DEFAULTS,
  createMachineSecurity,
  decryptString,
  deriveKey,
  encryptString,
  getMachineKey,
  isEncrypted,
  machineKey,
  verifySecurity,
} from '../src/crypto.js'

test('encryptString/decryptString round-trip and plaintext passthrough', () => {
  const { key } = createMachineSecurity('test-machine-secret')
  const encrypted = encryptString('sk-secret-token', key)
  assert.equal(isEncrypted(encrypted), true)
  assert.match(encrypted, /^enc:v1:/)
  assert.notEqual(encrypted, 'sk-secret-token')
  assert.equal(decryptString(encrypted, key), 'sk-secret-token')
  assert.equal(decryptString('plain-token', key), 'plain-token')
  assert.equal(isEncrypted('plain-token'), false)
})

test('machine keys are deterministic per secret and salt', () => {
  const { security, key } = createMachineSecurity('test-machine-secret')
  assert.equal(security.mode, 'machine')
  assert.ok(security.salt)
  assert.deepEqual(machineKey(security, 'test-machine-secret'), key)
  assert.notDeepEqual(machineKey(security, 'another-machine'), key)

  const local = createMachineSecurity()
  assert.deepEqual(getMachineKey(local.security), local.key)
})

test('decryptString rejects a key from a different machine secret', () => {
  const { security, key } = createMachineSecurity('test-machine-secret')
  const encrypted = encryptString('secret', key)
  const otherKey = machineKey(security, 'another-machine')
  assert.throws(() => decryptString(encrypted, otherKey))
})

test('decryptString rejects tampered ciphertext', () => {
  const { key } = createMachineSecurity('test-machine-secret')
  const encrypted = encryptString('secret', key)
  const raw = Buffer.from(encrypted.slice('enc:v1:'.length), 'base64')
  raw[raw.length - 1] ^= 0xff
  const tampered = `enc:v1:${raw.toString('base64')}`
  assert.throws(() => decryptString(tampered, key))
})

test('verifySecurity still reads legacy master-password configs for migration', () => {
  const salt = randomBytes(16).toString('base64')
  const kdf = { ...KDF_DEFAULTS }
  const key = deriveKey('old-password', salt, kdf)
  const security = {
    mode: 'password',
    kdf,
    salt,
    check: encryptString('opencode-model-picker:check', key),
  }
  assert.deepEqual(verifySecurity(security, 'old-password'), key)
  assert.equal(verifySecurity(security, 'wrong-password'), null)
})
