import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getAuthApiKey,
  readAuth,
  renameAuthKey,
  writeAuthApiKey,
} from '../src/auth.js'
import { opencodeAuthPath } from '../src/utils.js'

function withTempData(fn) {
  const base = mkdtempSync(join(tmpdir(), 'omp-auth-'))
  const prev = process.env.XDG_DATA_HOME
  process.env.XDG_DATA_HOME = base
  try {
    mkdirSync(join(base, 'opencode'), { recursive: true })
    return fn()
  } finally {
    if (prev === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = prev
    rmSync(base, { recursive: true, force: true })
  }
}

test('opencodeAuthPath follows XDG_DATA_HOME', () => {
  withTempData(() => {
    assert.equal(opencodeAuthPath(), join(process.env.XDG_DATA_HOME, 'opencode', 'auth.json'))
  })
})

test('writeAuthApiKey creates auth.json with mode 0600', () => {
  withTempData(() => {
    const res = writeAuthApiKey('demo', 'secret-key')
    assert.equal(res.path, opencodeAuthPath())
    assert.equal(res.backupPath, null)

    const raw = JSON.parse(readFileSync(res.path, 'utf8'))
    assert.deepEqual(raw.demo, { type: 'api', key: 'secret-key' })
    if (process.platform !== 'win32') {
      assert.equal(statSync(res.path).mode & 0o777, 0o600)
    }
  })
})

test('writeAuthApiKey preserves other entries and creates a backup', () => {
  withTempData(() => {
    const path = opencodeAuthPath()
    const original = {
      ollama: { type: 'api', key: 'ollama-key' },
      github: { type: 'oauth', refresh: 'r', access: 'a', expires: 1 },
    }
    writeFileSync(path, JSON.stringify(original), 'utf8')

    const res = writeAuthApiKey('demo', 'new-key')
    assert.equal(res.backupPath, `${path}.bak`)
    assert.equal(readFileSync(res.backupPath, 'utf8'), JSON.stringify(original))

    const raw = JSON.parse(readFileSync(path, 'utf8'))
    assert.deepEqual(raw.ollama, original.ollama)
    assert.deepEqual(raw.github, original.github)
    assert.deepEqual(raw.demo, { type: 'api', key: 'new-key' })
  })
})

test('writeAuthApiKey keeps metadata on an existing api entry', () => {
  withTempData(() => {
    writeFileSync(
      opencodeAuthPath(),
      JSON.stringify({ demo: { type: 'api', key: 'old', metadata: { region: 'eu' } } }),
      'utf8',
    )
    writeAuthApiKey('demo', 'new')
    const raw = JSON.parse(readFileSync(opencodeAuthPath(), 'utf8'))
    assert.deepEqual(raw.demo, { type: 'api', key: 'new', metadata: { region: 'eu' } })
  })
})

test('getAuthApiKey only returns api entries', () => {
  withTempData(() => {
    writeFileSync(
      opencodeAuthPath(),
      JSON.stringify({
        demo: { type: 'api', key: 'demo-key' },
        oauth: { type: 'oauth', refresh: 'r', access: 'a', expires: 1 },
      }),
      'utf8',
    )
    assert.equal(getAuthApiKey('demo'), 'demo-key')
    assert.equal(getAuthApiKey('oauth'), null)
    assert.equal(getAuthApiKey('missing'), null)
  })
})

test('renameAuthKey moves an entry without overwriting an existing one', () => {
  withTempData(() => {
    writeFileSync(
      opencodeAuthPath(),
      JSON.stringify({ old: { type: 'api', key: 'k' } }),
      'utf8',
    )
    assert.equal(renameAuthKey('old', 'new'), true)
    assert.deepEqual(readAuth().auth, { new: { type: 'api', key: 'k' } })
    assert.equal(renameAuthKey('new', 'old'), true)

    writeFileSync(
      opencodeAuthPath(),
      JSON.stringify({ old: { type: 'api', key: 'a' }, new: { type: 'api', key: 'b' } }),
      'utf8',
    )
    assert.equal(renameAuthKey('old', 'new'), false)
  })
})

test('readAuth rejects invalid JSON and non-object content', () => {
  withTempData(() => {
    writeFileSync(opencodeAuthPath(), '{broken', 'utf8')
    assert.throws(() => readAuth('en'), /Failed to parse/)
    writeFileSync(opencodeAuthPath(), '[]', 'utf8')
    assert.throws(() => readAuth('en'), /Unrecognized auth.json format/)
  })
})

test('readAuth returns an empty object when the file is missing', () => {
  withTempData(() => {
    const res = readAuth()
    assert.equal(res.exists, false)
    assert.deepEqual(res.auth, {})
  })
})
