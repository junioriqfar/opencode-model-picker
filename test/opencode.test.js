import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildModelsBlock,
  pickProviderNpm,
  npmForApi,
  writeOpencodeConfig,
  readOpencodeConfig,
} from '../src/opencode.js'

test('npmForApi maps endpoint to AI SDK package', () => {
  assert.equal(npmForApi('chat'), '@ai-sdk/openai-compatible')
  assert.equal(npmForApi('messages'), '@ai-sdk/anthropic')
  assert.equal(npmForApi('responses'), '@ai-sdk/openai')
})

test('pickProviderNpm picks the majority endpoint package', () => {
  assert.equal(pickProviderNpm([{ api: 'chat' }, { api: 'chat' }, { api: 'messages' }]), '@ai-sdk/openai-compatible')
  assert.equal(pickProviderNpm([{ api: 'messages' }, { api: 'messages' }]), '@ai-sdk/anthropic')
  assert.equal(pickProviderNpm([{ api: 'responses' }]), '@ai-sdk/openai')
  // Tanpa info api -> fallback
  assert.equal(pickProviderNpm([]), '@ai-sdk/openai-compatible')
})

test('buildModelsBlock applies numbering, modalities and minority npm override', () => {
  const ordered = [
    { id: 'minimax-m3', shortName: 'minimax-m3', vision: false, api: 'messages' },
    { id: 'kimi-k3', shortName: 'kimi-k3', vision: true, api: 'chat' },
    { id: 'glm-5.3', shortName: 'glm-5.3', vision: false, api: 'chat' },
  ]
  const defaultNpm = pickProviderNpm(ordered) // chat mayoritas
  const block = buildModelsBlock(ordered, { numbering: '01.', defaultNpm, markPaid: true, paidIds: ['kimi-k3'] })

  assert.equal(block['minimax-m3'].name, '01. minimax-m3')
  assert.equal(block['kimi-k3'].name, '02. kimi-k3 (PAID)')
  assert.deepEqual(block['kimi-k3'].modalities.input, ['text', 'image'])
  assert.deepEqual(block['glm-5.3'].modalities.input, ['text'])
  // Minoritas (messages) dapat override, mayoritas (chat) tidak
  assert.equal(block['minimax-m3'].provider.npm, '@ai-sdk/anthropic')
  assert.equal(block['kimi-k3'].provider, undefined)
  assert.equal(block['glm-5.3'].provider, undefined)
})

test('writeOpencodeConfig backs up, preserves others and writes atomically', () => {
  const base = mkdtempSync(join(tmpdir(), 'omp-opencode-'))
  const prevXdg = process.env.XDG_CONFIG_HOME
  const prevDir = process.env.OPENCODE_CONFIG_DIR
  try {
    process.env.XDG_CONFIG_HOME = base
    delete process.env.OPENCODE_CONFIG_DIR
    const dir = join(base, 'opencode')
    mkdirSync(dir, { recursive: true })
    const target = join(dir, 'opencode.jsonc')
    const original = [
      '{',
      '  // komentar',
      '  "autoupdate": true,',
      '  "provider": {',
      '    "other": { "npm": "@ai-sdk/openai-compatible", "models": { "x": { "name": "x" } } },',
      '  },',
      '}',
    ].join('\n')
    writeFileSync(target, original)

    const res = writeOpencodeConfig(
      'go',
      { npm: '@ai-sdk/openai-compatible', models: { 'kimi-k3': { name: '01. kimi-k3' } } },
      'en',
    )

    assert.ok(res.backupPath, 'backup path returned')
    assert.equal(readFileSync(res.backupPath, 'utf8'), original, 'backup matches original')

    const cfg = readOpencodeConfig('en').config
    assert.equal(cfg.autoupdate, true)
    assert.ok(cfg.provider.other, 'other provider preserved')
    assert.ok(cfg.provider.go.models['kimi-k3'])

    // Tidak ada file sementara yang tertinggal
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-'))
    assert.deepEqual(leftovers, [])
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    if (prevDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = prevDir
    rmSync(base, { recursive: true, force: true })
  }
})
