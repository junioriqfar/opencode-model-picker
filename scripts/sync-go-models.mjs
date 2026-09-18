#!/usr/bin/env node
// Regenerate src/go-models.js from models.dev (provider "opencode-go").
// Usage: npm run sync:models
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const res = await fetch('https://models.dev/api.json')
if (!res.ok) throw new Error(`Failed to fetch models.dev: HTTP ${res.status}`)
const data = await res.json()
const provider = data['opencode-go']
if (!provider?.models) throw new Error('Provider "opencode-go" not found on models.dev')

const ids = Object.keys(provider.models).sort()
const lines = [
  '// Snapshot metadata model OpenCode Go dari models.dev (provider "opencode-go").',
  '// Dipakai agar OpenCode otomatis membuat model variants (butuh capabilities.reasoning',
  '// + limit.output; lihat ProviderTransform.variants di source opencode).',
  '// Sumber: https://models.dev/api.json — regenerasi dengan `npm run sync:models`.',
  '',
  'export const GO_MODEL_FALLBACK = { context: 131072, output: 8192, reasoning: true, input: ["text"] }',
  '',
  'export const GO_MODEL_META = {',
]

for (const id of ids) {
  const m = provider.models[id]
  const context = Number(m.limit?.context) || null
  const output = Number(m.limit?.output) || null
  const reasoning = m.reasoning !== false
  const input = Array.isArray(m.modalities?.input)
    ? m.modalities.input.filter((x) => typeof x === 'string')
    : ['text']
  lines.push(
    `  ${JSON.stringify(id)}: { context: ${context}, output: ${output}, reasoning: ${reasoning}, input: ${JSON.stringify(input)} },`,
  )
}

lines.push(
  '}',
  '',
  'export function getGoModelMeta(id) {',
  '  const meta = GO_MODEL_META[id]',
  '  if (!meta) return GO_MODEL_FALLBACK',
  '  return {',
  '    context: meta.context ?? GO_MODEL_FALLBACK.context,',
  '    output: meta.output ?? GO_MODEL_FALLBACK.output,',
  '    reasoning: meta.reasoning !== false,',
  '    input: Array.isArray(meta.input) && meta.input.length > 0 ? meta.input : GO_MODEL_FALLBACK.input,',
  '  }',
  '}',
  '',
)

writeFileSync(join(root, 'src', 'go-models.js'), lines.join('\n'))
console.log(`Wrote src/go-models.js (${ids.length} models)`)
