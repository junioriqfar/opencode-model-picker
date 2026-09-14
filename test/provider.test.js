import test from 'node:test'
import assert from 'node:assert/strict'
import { listModels, testModel, isOpencodeZen } from '../src/provider.js'

const GO = 'https://opencode.ai/zen/go/v1'
const OPENAI = 'https://api.openai.com/v1'
const ANTHROPIC = 'https://api.minimax.io/anthropic'

function jsonRes(status, obj) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(obj),
    json: async () => obj,
  }
}

async function withFetch(impl, fn) {
  const prev = globalThis.fetch
  globalThis.fetch = impl
  try {
    return await fn()
  } finally {
    globalThis.fetch = prev
  }
}

test('isOpencodeZen detects Go/Zen hosts', () => {
  assert.equal(isOpencodeZen(GO), true)
  assert.equal(isOpencodeZen('https://opencode.ai/zen/v1'), true)
  assert.equal(isOpencodeZen(OPENAI), false)
  assert.equal(isOpencodeZen(ANTHROPIC), false)
})

test('Go requests send x-opencode-session, client and user agent', async () => {
  let seen
  await withFetch(
    async (url, opts) => {
      seen = opts.headers
      return jsonRes(200, { choices: [{ message: { content: 'hi' } }] })
    },
    () => testModel({ baseURL: GO, apiKey: 'k', model: 'kimi-k3', timeoutMs: 3000 }),
  )
  assert.match(seen['x-opencode-session'], /^omp-/)
  assert.equal(seen['x-opencode-client'], 'opencode-model-picker')
  assert.match(seen['User-Agent'], /^opencode-model-picker\//)
})

test('non-Go requests do not send session header', async () => {
  let seen
  await withFetch(
    async (url, opts) => {
      seen = opts.headers
      return jsonRes(200, { choices: [{ message: { content: 'hi' } }] })
    },
    () => testModel({ baseURL: OPENAI, apiKey: 'k', model: 'gpt-4o', timeoutMs: 3000 }),
  )
  assert.equal('x-opencode-session' in seen, false)
})

test('Go minimax is tested via /messages', async () => {
  const calls = []
  const result = await withFetch(
    async (url) => {
      calls.push(url)
      if (url.endsWith('/messages')) return jsonRes(200, { content: [{ type: 'text', text: 'hi' }] })
      return jsonRes(400, { error: { message: 'InvalidRequest wrong endpoint' } })
    },
    () => testModel({ baseURL: GO, apiKey: 'k', model: 'minimax-m3', timeoutMs: 3000 }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.api, 'messages')
  assert.ok(calls[0].endsWith('/messages'))
})

test('MissingSessionID is classified as session, not dead', async () => {
  const result = await withFetch(
    async () =>
      jsonRes(400, {
        type: 'MissingSessionID',
        message: 'Error from provider (Console Go): Request is missing x-opencode-session and cannot be routed efficiently.',
      }),
    () => testModel({ baseURL: GO, apiKey: 'k', model: 'kimi-k3', timeoutMs: 3000, lang: 'en' }),
  )
  assert.equal(result.error, 'session')
  assert.equal(result.dead, false)
})

test('Anthropic-compatible base URL uses /messages directly', async () => {
  const calls = []
  const result = await withFetch(
    async (url) => {
      calls.push(url)
      if (url.endsWith('/messages')) return jsonRes(200, { content: [{ type: 'text', text: 'hi' }] })
      return jsonRes(404, { error: { message: 'not here' } })
    },
    () => testModel({ baseURL: ANTHROPIC, apiKey: 'k', model: 'MiniMax-M3', timeoutMs: 3000 }),
  )
  assert.equal(result.api, 'messages')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].endsWith('/anthropic/v1/messages'))
})

test('endpoint mismatch falls back to /messages', async () => {
  const calls = []
  const result = await withFetch(
    async (url) => {
      calls.push(url)
      if (url.endsWith('/messages')) return jsonRes(200, { content: [{ type: 'text', text: 'hi' }] })
      return jsonRes(404, { error: { message: 'no such endpoint /chat/completions' } })
    },
    () => testModel({ baseURL: 'https://proxy.example.com/v1', apiKey: 'k', model: 'claude-x', timeoutMs: 3000 }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.api, 'messages')
  assert.equal(calls.length, 2)
})

test('dead model does not trigger endpoint fallback', async () => {
  let count = 0
  const result = await withFetch(
    async () => {
      count++
      return jsonRes(404, { error: { message: 'The model dead-model does not exist' } })
    },
    () => testModel({ baseURL: OPENAI, apiKey: 'k', model: 'dead-model', timeoutMs: 3000, lang: 'en' }),
  )
  assert.equal(result.error, 'notfound')
  assert.equal(count, 1)
})

test('chat retries with max_completion_tokens when max_tokens unsupported', async () => {
  const bodies = []
  const result = await withFetch(
    async (url, opts) => {
      const body = JSON.parse(opts.body)
      bodies.push(body)
      if (body.max_tokens !== undefined) {
        return jsonRes(400, {
          error: { message: "Unsupported parameter: 'max_tokens' is not supported. Use 'max_completion_tokens'." },
        })
      }
      return jsonRes(200, { choices: [{ message: { content: 'hi' } }] })
    },
    () => testModel({ baseURL: OPENAI, apiKey: 'k', model: 'gpt-5.6', timeoutMs: 3000 }),
  )
  assert.equal(result.ok, true)
  assert.equal(bodies.length, 2)
  assert.equal(bodies[0].max_tokens, 16)
  assert.equal(bodies[1].max_completion_tokens, 16)
})

test('listModels normalizes capabilities from architecture/supported_parameters', async () => {
  const result = await withFetch(
    async () =>
      jsonRes(200, {
        data: [
          {
            id: 'vendor/coder-1',
            context_length: 200000,
            architecture: { input_modalities: ['text', 'image'], modality: 'text+image->text' },
            supported_parameters: ['tools', 'reasoning'],
          },
        ],
      }),
    () => listModels({ baseURL: OPENAI, apiKey: 'k' }),
  )
  assert.equal(result.length, 1)
  const m = result[0]
  assert.equal(m.capabilities.vision, true)
  assert.equal(m.capabilities.tools, true)
  assert.equal(m.capabilities.reasoning, true)
  assert.equal(m.contextLength, 200000)
})
