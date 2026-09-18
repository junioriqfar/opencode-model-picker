import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAppConfig, DEFAULT_SETTINGS } from '../src/config.js'
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
