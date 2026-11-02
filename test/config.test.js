import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  loadAppConfig,
  loadRawAppConfig,
  saveAppConfig,
  ensureMachineEncryption,
  migrateFromPassword,
  DEFAULT_SETTINGS,
} from '../src/config.js'
import { KDF_DEFAULTS, deriveKey, encryptString } from '../src/crypto.js'
import { APP_NAME } from '../src/utils.js'

function withTempConfig(contents, fn) {
  const base = mkdtempSync(join(tmpdir(), 'omp-config-'))
  const prevXdg = process.env.XDG_CONFIG_HOME
  try {
    process.env.XDG_CONFIG_HOME = base
    const dir = join(base, APP_NAME)
    mkdirSync(dir, { recursive: true })
    if (contents !== undefined) writeFileSync(join(dir, 'config.json'), contents, 'utf8')
    return fn()
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    rmSync(base, { recursive: true, force: true })
  }
}

function configPath() {
  return join(process.env.XDG_CONFIG_HOME, APP_NAME, 'config.json')
}

function readRaw() {
  return JSON.parse(readFileSync(configPath(), 'utf8'))
}

function legacyPasswordConfig(password, apiKey = 'secret-key') {
  const salt = randomBytes(16).toString('base64')
  const kdf = { ...KDF_DEFAULTS }
  const key = deriveKey(password, salt, kdf)
  return {
    providers: [{ name: 'demo', baseURL: 'https://example.com/v1', apiKey: encryptString(apiKey, key) }],
    settings: {},
    security: {
      mode: 'password',
      kdf,
      salt,
      check: encryptString('opencode-model-picker:check', key),
    },
  }
}

test('default settings include sort = score', () => {
  assert.equal(DEFAULT_SETTINGS.sort, 'score')
})

test('missing/invalid sort normalizes to score', () => {
  assert.equal(withTempConfig(JSON.stringify({ settings: {} }), () => loadAppConfig().settings.sort), 'score')
  assert.equal(withTempConfig(JSON.stringify({ settings: { sort: 'bogus' } }), () => loadAppConfig().settings.sort), 'score')
})

test('valid sort name is preserved', () => {
  assert.equal(withTempConfig(JSON.stringify({ settings: { sort: 'name' } }), () => loadAppConfig().settings.sort), 'name')
})

test('defaults for credential storage and update check', () => {
  assert.equal(DEFAULT_SETTINGS.credentialStorage, 'auth')
  assert.equal(DEFAULT_SETTINGS.checkUpdates, true)
  withTempConfig(JSON.stringify({ settings: { credentialStorage: 'bogus', checkUpdates: 'yes' } }), () => {
    const settings = loadAppConfig().settings
    assert.equal(settings.credentialStorage, 'auth')
    assert.equal(settings.checkUpdates, true)
  })
})

test('saving a config encrypts provider keys automatically', () => {
  withTempConfig(undefined, () => {
    const cfg = {
      providers: [{ name: 'demo', baseURL: 'https://example.com/v1', apiKey: 'secret-key' }],
      settings: { ...DEFAULT_SETTINGS },
    }
    saveAppConfig(cfg)

    const raw = readRaw()
    assert.equal(raw.security.mode, 'machine')
    assert.ok(raw.security.salt)
    assert.match(raw.providers[0].apiKey, /^enc:v1:/)
    assert.notEqual(raw.providers[0].apiKey, 'secret-key')
    assert.equal(loadAppConfig().providers[0].apiKey, 'secret-key')
  })
})

test('ensureMachineEncryption migrates a legacy plaintext config', () => {
  withTempConfig(
    JSON.stringify({
      providers: [{ name: 'demo', baseURL: 'https://example.com/v1', apiKey: 'secret-key' }],
      settings: {},
    }),
    () => {
      const cfg = loadAppConfig()
      assert.equal(cfg.providers[0].apiKey, 'secret-key')
      assert.equal(ensureMachineEncryption(), true)

      const raw = readRaw()
      assert.equal(raw.security.mode, 'machine')
      assert.match(raw.providers[0].apiKey, /^enc:v1:/)
      assert.equal(loadAppConfig().providers[0].apiKey, 'secret-key')

      // Nothing left to migrate on the next run.
      assert.equal(ensureMachineEncryption(), false)
    },
  )
})

test('migrateFromPassword re-encrypts with the machine key', () => {
  withTempConfig(JSON.stringify(legacyPasswordConfig('old-password')), () => {
    assert.throws(() => loadAppConfig(), /LEGACY_PASSWORD_CONFIG/)
    assert.equal(migrateFromPassword('wrong-password'), false)
    assert.equal(loadRawAppConfig().security.mode, 'password')

    assert.equal(migrateFromPassword('old-password'), true)
    const raw = loadRawAppConfig()
    assert.equal(raw.security.mode, 'machine')
    assert.match(raw.providers[0].apiKey, /^enc:v1:/)
    assert.equal(loadAppConfig().providers[0].apiKey, 'secret-key')
  })
})

test('saveAppConfig writes atomically without temp leftovers', () => {
  withTempConfig(undefined, () => {
    const cfg = {
      providers: [{ name: 'demo', baseURL: 'https://example.com/v1', apiKey: 'secret' }],
      settings: { ...DEFAULT_SETTINGS },
    }
    saveAppConfig(cfg)

    const dir = join(process.env.XDG_CONFIG_HOME, APP_NAME)
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-'))
    assert.deepEqual(leftovers, [])
    assert.deepEqual(loadAppConfig().providers, cfg.providers)
  })
})
