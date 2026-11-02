import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, fetchLatestRelease, isUpdateAvailable } from '../src/update.js'

function jsonRes(status, obj) {
  return {
    ok: status >= 200 && status < 300,
    status,
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

test('compareVersions handles v prefix, numeric segments and prerelease', () => {
  assert.equal(compareVersions('1.5.0', 'v1.4.0'), 1)
  assert.equal(compareVersions('v1.5.0', '1.5.0'), 0)
  assert.equal(compareVersions('1.4.9', '1.5.0'), -1)
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareVersions('2.0.0', '2.0.0-beta.1'), 1)
  assert.equal(compareVersions('2.0.0-beta.1', '2.0.0-beta.2'), -1)
})

test('isUpdateAvailable compares against the current version', () => {
  assert.equal(isUpdateAvailable('1.5.0', '1.4.0'), true)
  assert.equal(isUpdateAvailable('1.5.0', '1.5.0'), false)
  assert.equal(isUpdateAvailable('1.4.0', '1.5.0'), false)
})

test('fetchLatestRelease returns release info and update flag', async () => {
  let seenUrl
  let seenHeaders
  const result = await withFetch(
    async (url, opts) => {
      seenUrl = url
      seenHeaders = opts.headers
      return jsonRes(200, {
        tag_name: 'v1.6.0',
        html_url: 'https://github.com/example/releases/tag/v1.6.0',
        published_at: '2026-12-01T00:00:00Z',
      })
    },
    () => fetchLatestRelease({ current: '1.5.0' }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.version, '1.6.0')
  assert.equal(result.update, true)
  assert.equal(result.url, 'https://github.com/example/releases/tag/v1.6.0')
  assert.match(seenUrl, /repos\/junioriqfar\/opencode-model-picker\/releases\/latest$/)
  assert.equal(seenHeaders.Accept, 'application/vnd.github+json')
  assert.match(seenHeaders['User-Agent'], /^opencode-model-picker\//)
})

test('fetchLatestRelease reports no update when release is older', async () => {
  const result = await withFetch(
    async () => jsonRes(200, { tag_name: 'v1.4.0', html_url: 'https://example.com' }),
    () => fetchLatestRelease({ current: '1.5.0' }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.update, false)
})

test('fetchLatestRelease classifies HTTP errors', async () => {
  const notFound = await withFetch(
    async () => jsonRes(404, {}),
    () => fetchLatestRelease(),
  )
  assert.equal(notFound.error, 'norelease')

  const rateLimited = await withFetch(
    async () => jsonRes(403, {}),
    () => fetchLatestRelease(),
  )
  assert.equal(rateLimited.error, 'ratelimit')

  const http = await withFetch(
    async () => jsonRes(500, {}),
    () => fetchLatestRelease(),
  )
  assert.equal(http.error, 'http')
  assert.equal(http.status, 500)
})

test('fetchLatestRelease reports network and timeout failures', async () => {
  const network = await withFetch(
    async () => {
      throw new Error('offline')
    },
    () => fetchLatestRelease(),
  )
  assert.equal(network.error, 'network')

  const timeout = await withFetch(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      }),
    () => fetchLatestRelease({ timeoutMs: 20 }),
  )
  assert.equal(timeout.error, 'timeout')
})
