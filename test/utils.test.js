import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  stripJsoncComments,
  stripTrailingCommas,
  parseJsonc,
  opencodeConfigDir,
  opencodeConfigPath,
} from '../src/utils.js'

test('stripJsoncComments removes line and block comments', () => {
  const src = `{
    // line comment
    "a": 1, /* block
    comment */
    "b": 2
  }`
  const out = stripJsoncComments(src)
  assert.doesNotMatch(out, /comment/)
  assert.deepEqual(JSON.parse(out), { a: 1, b: 2 })
})

test('stripJsoncComments keeps // and /* inside strings', () => {
  const src = '{ "url": "https://x/y", "glob": "a/*/b" }'
  assert.deepEqual(JSON.parse(stripJsoncComments(src)), { url: 'https://x/y', glob: 'a/*/b' })
})

test('stripTrailingCommas removes trailing commas but keeps string content', () => {
  const src = '{ "s": "a,} b,]", "n": [1,2,], }'
  const parsed = JSON.parse(stripTrailingCommas(src))
  assert.equal(parsed.s, 'a,} b,]')
  assert.deepEqual(parsed.n, [1, 2])
})

test('parseJsonc handles comments + trailing commas (opencode.jsonc sample)', () => {
  const src = `{
    // global config
    "$schema": "https://opencode.ai/config.json",
    "provider": {
      "anthropic": { "options": { "timeout": 600000 } },
    },
  }`
  assert.deepEqual(parseJsonc(src).provider.anthropic.options, { timeout: 600000 })
})

test('opencodeConfigPath follows opencode precedence', () => {
  const base = mkdtempSync(join(tmpdir(), 'omp-utils-'))
  const prevXdg = process.env.XDG_CONFIG_HOME
  const prevDir = process.env.OPENCODE_CONFIG_DIR
  try {
    process.env.XDG_CONFIG_HOME = base
    delete process.env.OPENCODE_CONFIG_DIR
    const dir = join(base, 'opencode')
    mkdirSync(dir, { recursive: true })

    // Belum ada file -> default opencode.jsonc
    assert.equal(opencodeConfigPath(), join(dir, 'opencode.jsonc'))

    // Hanya opencode.json -> pilih itu
    writeFileSync(join(dir, 'opencode.json'), '{}')
    assert.equal(opencodeConfigPath(), join(dir, 'opencode.json'))

    // opencode.jsonc ikut ada -> jsonc lebih diprioritaskan
    writeFileSync(join(dir, 'opencode.jsonc'), '{}')
    assert.equal(opencodeConfigPath(), join(dir, 'opencode.jsonc'))

    // OPENCODE_CONFIG_DIR menimpa
    process.env.OPENCODE_CONFIG_DIR = join(base, 'custom')
    assert.equal(opencodeConfigDir(), join(base, 'custom'))
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    if (prevDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = prevDir
    rmSync(base, { recursive: true, force: true })
  }
})
