import { t } from './i18n.js'
import { randomUUID } from 'node:crypto'

function oneLine(str, max = 120) {
  if (!str) return ''
  return String(str).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

const TEST_MESSAGE = 'Say hi'
const TEST_MAX_TOKENS = 16
const TEST_TIMEOUT = 15000
const PICKER_USER_AGENT = 'opencode-model-picker/1.2.2'
const PICKER_CLIENT_NAME = 'opencode-model-picker'

// Stable session id per process. OpenCode Go (since 2026-09-06) requires a
// stable `x-opencode-session` header per conversation for routing + prompt
// caching. Without it every /chat/completions (and /messages, /responses)
// fails with 400 MissingSessionID:
// "Error from provider (Console Go): Request is missing x-opencode-session..."
let _cachedSessionId = null
export function getPickerSessionId() {
  if (!_cachedSessionId) {
    try {
      _cachedSessionId = `omp-${randomUUID()}`
    } catch {
      _cachedSessionId = `omp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }
  }
  return _cachedSessionId
}

export function isOpencodeZen(baseURL) {
  const u = String(baseURL ?? '').toLowerCase()
  return u.includes('opencode.ai') && (u.includes('/zen') || u.includes('/go/'))
}

function buildApiHeaders(apiKey, baseURL, extra = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': PICKER_USER_AGENT,
    ...extra,
  }
  if (isOpencodeZen(baseURL)) {
    // Required by OpenCode Go/Zen, see https://opencode.ai/docs/go/#where-can-i-use-it
    headers['x-opencode-session'] = getPickerSessionId()
    headers['x-opencode-client'] = PICKER_CLIENT_NAME
  }
  return headers
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeModelURL(baseURL) {
  let url = baseURL.trim()
  url = url.replace(/\/+$/, '')
  // Kalau user paste full endpoint (mis. .../v1/chat/completions), strip ke .../v1
  for (const suffix of ['/chat/completions', '/responses', '/messages', '/models']) {
    if (url.toLowerCase().endsWith(suffix)) {
      url = url.slice(0, -suffix.length).replace(/\/+$/, '')
      break
    }
  }
  if (url.endsWith('/v1')) return url
  return url + '/v1'
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

export async function listModels({ baseURL, apiKey, lang = 'en' }) {
  const url = `${normalizeModelURL(baseURL)}/models`
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: buildApiHeaders(apiKey, baseURL, { Accept: 'application/json' }),
    },
    30000,
  )
  if (!res.ok) {
    const body = oneLine(await res.text(), 120)
    throw new Error(t(lang, 'errFetchModels', { status: res.status, body }))
  }
  const data = await res.json()
  if (!Array.isArray(data?.data)) {
    throw new Error(t(lang, 'errModelFormat'))
  }
  return data.data.map((m) => normalizeModel(m))
}

function normalizeModel(m) {
  return {
    id: m.id,
    ownedBy: m.owned_by ?? null,
    contextLength: m.context_length ?? m.contextWindow ?? null,
    maxOutput: m.max_completion_tokens ?? m.maxOutput ?? null,
    capabilities: {
      vision: !!m.capabilities?.vision,
      tools: !!m.capabilities?.tools,
      reasoning: !!m.capabilities?.reasoning,
      audioInput: !!m.capabilities?.audioInput,
      audioOutput: !!m.capabilities?.audioOutput,
      videoInput: !!m.capabilities?.videoInput,
      imageOutput: !!m.capabilities?.imageOutput,
      search: !!m.capabilities?.search,
      pdf: !!m.capabilities?.pdf,
    },
  }
}

function looksLikeHtml(text) {
  const t = (text ?? '').trim().toLowerCase()
  return (
    t.startsWith('<!doctype') ||
    t.startsWith('<html') ||
    t.startsWith('<?xml') ||
    t.includes('content-type') && t.includes('text/html')
  )
}

async function parseJsonBody(res) {
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  let json = null
  if (contentType.includes('application/json') || text.trim().startsWith('{')) {
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
  }
  return { json, text }
}

function timeoutResult(timeoutMs, lang) {
  return {
    ok: false,
    status: 'timeout',
    error: 'timeout',
    message: t(lang, 'errTimeout', { sec: Math.round(timeoutMs / 1000) }),
    dead: false,
  }
}

function networkResult(err, lang) {
  return {
    ok: false,
    status: 'network',
    error: 'network',
    message: t(lang, 'errNetwork', { msg: oneLine(err.message ?? t(lang, 'errUnknown'), 100) }),
    dead: false,
  }
}

async function attemptChat({ baseURL, apiKey, model, timeoutMs, lang, tokenParam = 'max_tokens' }) {
  const url = `${normalizeModelURL(baseURL)}/chat/completions`
  const body = {
    model,
    messages: [{ role: 'user', content: TEST_MESSAGE }],
    stream: false,
  }
  // Reasoning model (mis. gpt-5/o-series) menolak `max_tokens` dan minta
  // `max_completion_tokens`. Nilainya diisi oleh pemanggil via tokenParam.
  body[tokenParam] = TEST_MAX_TOKENS
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: buildApiHeaders(apiKey, baseURL),
        body: JSON.stringify(body),
      },
      timeoutMs,
    )
    const { json, text } = await parseJsonBody(res)

    if (looksLikeHtml(text)) {
      return {
        ok: false,
        status: res.status,
        error: 'html',
        message: t(lang, 'errHtmlResponse'),
        detail: oneLine(text, 200),
        dead: false,
      }
    }

    if (!res.ok) {
      return classifyError(model, res.status, json, text, lang)
    }

    // Respons 200 tapi bentuknya error (mis. {"error":{...}})
    if (json && json.error && !json.choices) {
      return classifyError(model, 200, json, text, lang)
    }

    const content = json?.choices?.[0]?.message?.content ?? null
    if (content === null || content === undefined) {
      return {
        ok: true,
        status: res.status,
        api: 'chat',
        message: 'Respons kosong (mungkin token habis untuk reasoning)',
        warning: true,
        detail: oneLine(text, 200),
      }
    }
    return { ok: true, status: res.status, api: 'chat', message: 'OK', warning: false, detail: null }
  } catch (err) {
    if (err.name === 'AbortError') return timeoutResult(timeoutMs, lang)
    return networkResult(err, lang)
  }
}

// OpenCode Go serves MiniMax/Qwen via Anthropic Messages:
// POST {base}/messages  (sdk: @ai-sdk/anthropic)
// https://opencode.ai/docs/go/#endpoints
async function attemptMessages({ baseURL, apiKey, model, timeoutMs, lang }) {
  const url = `${normalizeModelURL(baseURL)}/messages`
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          ...buildApiHeaders(apiKey, baseURL, { 'anthropic-version': '2023-06-01' }),
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: TEST_MAX_TOKENS,
          messages: [{ role: 'user', content: TEST_MESSAGE }],
        }),
      },
      timeoutMs,
    )
    const { json, text } = await parseJsonBody(res)

    if (looksLikeHtml(text)) {
      return {
        ok: false,
        status: res.status,
        error: 'html',
        message: t(lang, 'errHtmlResponse'),
        detail: oneLine(text, 200),
        dead: false,
      }
    }
    if (!res.ok) {
      return classifyError(model, res.status, json, text, lang)
    }
    if (json && json.error && !json.content) {
      return classifyError(model, 200, json, text, lang)
    }
    // Anthropic shape: { content: [{ type:'text', text:'...' }], ... }
    const blocks = json?.content
    const hasContent =
      (Array.isArray(blocks) && blocks.length > 0) ||
      typeof json?.output_text === 'string' ||
      typeof json?.completion === 'string'
    if (!hasContent) {
      return {
        ok: true,
        status: res.status,
        api: 'messages',
        message: 'Respons kosong (mungkin token habis untuk reasoning)',
        warning: true,
        detail: oneLine(text, 200),
      }
    }
    return { ok: true, status: res.status, api: 'messages', message: 'OK', warning: false, detail: null }
  } catch (err) {
    if (err.name === 'AbortError') return timeoutResult(timeoutMs, lang)
    return networkResult(err, lang)
  }
}

// OpenCode Go serves Grok / GPT Luna / Muse Spark via Responses:
// POST {base}/responses  (sdk: @ai-sdk/openai)
async function attemptResponses({ baseURL, apiKey, model, timeoutMs, lang }) {
  const url = `${normalizeModelURL(baseURL)}/responses`
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: buildApiHeaders(apiKey, baseURL),
        body: JSON.stringify({
          model,
          input: TEST_MESSAGE,
          max_output_tokens: TEST_MAX_TOKENS,
        }),
      },
      timeoutMs,
    )
    const { json, text } = await parseJsonBody(res)

    if (looksLikeHtml(text)) {
      return {
        ok: false,
        status: res.status,
        error: 'html',
        message: t(lang, 'errHtmlResponse'),
        detail: oneLine(text, 200),
        dead: false,
      }
    }
    if (!res.ok) {
      return classifyError(model, res.status, json, text, lang)
    }
    if (json && json.error && !json.output && !json.choices) {
      return classifyError(model, 200, json, text, lang)
    }
    return { ok: true, status: res.status, api: 'responses', message: 'OK', warning: false, detail: null }
  } catch (err) {
    if (err.name === 'AbortError') return timeoutResult(timeoutMs, lang)
    return networkResult(err, lang)
  }
}

// Tebak endpoint Go yang benar dari nama model (lihat tabel di https://opencode.ai/docs/go/#endpoints)
// sehingga minimax/qwen langsung dites via /messages dan muse-spark/grok/luna via /responses.
function guessGoApi(modelId) {
  const id = String(modelId ?? '').toLowerCase()
  if (id.includes('minimax') || id.includes('qwen')) return 'messages'
  if (id.includes('muse-spark') || id.includes('muse_spark') || id.includes('grok') || id.includes('luna')) {
    return 'responses'
  }
  return 'chat'
}

// Tebak endpoint untuk provider non-Go dari bentuk baseURL.
// Anthropic-compatible (mis. https://api.minimax.io/anthropic) memakai /messages.
function guessProviderApi(baseURL) {
  const u = String(baseURL ?? '').toLowerCase()
  if (u.includes('/anthropic') || u.endsWith('/messages')) return 'messages'
  if (u.includes('/responses')) return 'responses'
  return 'chat'
}

function shouldTryOtherGoEndpoints(result) {
  // Timeout / network / rate-limit / auth / payment / session / html:
  // coba endpoint lain tidak akan membantu (atau sudah di-retry).
  if (!result || result.ok) return false
  return !['timeout', 'network', 'ratelimit', 'auth', 'payment', 'session', 'html'].includes(result.error)
}

// Cukup coba endpoint lain untuk non-Go kalau errornya memang menandakan
// endpoint/route salah (bukan model hilang atau error auth).
function isEndpointMismatch(result) {
  if (!result || result.ok) return false
  if (!['badrequest', 'notfound'].includes(result.error)) return false
  // Hanya periksa pesan mentah dari provider (bukan pesan terjemahan),
  // supaya "Model not found" hasil klasifikasi tidak disalahartikan.
  const msg = String(result.detail ?? '').toLowerCase()
  if (msg.includes('model not found') || msg.includes('model does not exist')) return false
  return (
    msg.includes('not supported') ||
    msg.includes('unsupported') ||
    msg.includes('endpoint') ||
    msg.includes('route') ||
    msg.includes('404 page') ||
    msg.includes('no such') ||
    msg.includes('method not allowed') ||
    msg.includes('invalid url') ||
    msg.includes('unknown path')
  )
}

// Reasoning model menolak `max_tokens`; deteksi agar bisa retry dengan
// `max_completion_tokens`.
function isTokenParamError(result) {
  if (!result || result.ok || result.error !== 'badrequest') return false
  const msg = `${result.message ?? ''} ${result.detail ?? ''}`.toLowerCase()
  const mentionsToken =
    msg.includes('max_tokens') || msg.includes('max_completion_tokens') || msg.includes('max_output_tokens')
  const looksUnsupported =
    msg.includes('unsupported') ||
    msg.includes('not supported') ||
    msg.includes('unknown') ||
    msg.includes('invalid') ||
    msg.includes('unrecognized') ||
    msg.includes('unexpected')
  return mentionsToken && looksUnsupported
}

export async function testModel({
  baseURL,
  apiKey,
  model,
  timeoutMs = TEST_TIMEOUT,
  retryOn429 = true,
  lang = 'en',
}) {
  const call = {
    chat: (opts = {}) => attemptChat({ baseURL, apiKey, model, timeoutMs, lang, ...opts }),
    messages: () => attemptMessages({ baseURL, apiKey, model, timeoutMs, lang }),
    responses: () => attemptResponses({ baseURL, apiKey, model, timeoutMs, lang }),
  }

  const run = async (api) => {
    let result = await call[api]()
    // Parameter token salah -> coba `max_completion_tokens` (khusus chat).
    if (api === 'chat' && isTokenParamError(result)) {
      const retry = await call.chat({ tokenParam: 'max_completion_tokens' })
      if (retry.ok) return retry
      result = retry
    }
    if (!result.ok && result.error === 'ratelimit' && retryOn429) {
      await sleep(1500)
      result = await call[api]()
    }
    return result
  }

  if (isOpencodeZen(baseURL)) {
    // OpenCode Go/Zen: coba endpoint tebakan dulu, fallback ke 2 lainnya.
    const first = guessGoApi(model)
    const order = [first, ...['chat', 'messages', 'responses'].filter((a) => a !== first)]
    let firstResult = null
    for (const api of order) {
      const result = await run(api)
      if (result.ok) return result
      if (api === first) firstResult = result
      // Missing session header: semua endpoint akan gagal sama -> langsung kembalikan.
      if (result.error === 'session') return result
      // Error non-fallback (timeout/network/auth/dll) pada endpoint tebakan: jangan tebak lain.
      if (!shouldTryOtherGoEndpoints(result) && api === first) return result
    }
    // Semua endpoint gagal: kembalikan hasil endpoint tebakan (pesan paling relevan).
    return firstResult ?? (await run(first))
  }

  // Provider biasa: mulai dari endpoint sesuai hint baseURL (/anthropic -> messages).
  const first = guessProviderApi(baseURL)
  const result = await run(first)
  if (result.ok) return result
  if (!isEndpointMismatch(result)) return result

  // Endpoint/route salah -> coba satu alternatif yang paling mungkin.
  const alt = first === 'chat' ? 'messages' : 'chat'
  const altResult = await run(alt)
  return altResult.ok ? altResult : result
}

function classifyError(model, status, json, text, lang = 'en') {
  let detail = ''
  if (typeof json?.error === 'string') detail = json.error
  else detail = json?.error?.message ?? json?.message ?? text ?? ''
  // OpenCode Go MissingSessionID shape: {"type":"MissingSessionID","message":"Error from provider..."}
  const errType = String(json?.type ?? json?.error?.type ?? '').toLowerCase()
  let lower = detail.toLowerCase()

  // OpenRouter wraps provider errors: {"error":{"message":"Provider returned error","metadata":{"raw":"{\n  \"error\":...}"}}}
  // Extract inner message for a more useful single-line display
  let effectiveDetail = detail
  let effectiveLower = lower
  if (lower === 'provider returned error' && json?.error?.metadata?.raw) {
    try {
      const inner = JSON.parse(json.error.metadata.raw)
      const innerMsg = inner?.error?.message ?? inner?.error?.details?.[0]?.reason ?? inner?.message
      if (innerMsg && typeof innerMsg === 'string') {
        effectiveDetail = innerMsg
        effectiveLower = innerMsg.toLowerCase()
      } else {
        effectiveDetail = oneLine(json.error.metadata.raw, 200)
        effectiveLower = effectiveDetail.toLowerCase()
      }
    } catch {
      effectiveDetail = oneLine(json.error.metadata.raw, 200)
      effectiveLower = effectiveDetail.toLowerCase()
    }
  } else {
    effectiveDetail = detail
    effectiveLower = lower
  }
  detail = effectiveDetail
  lower = effectiveLower

  // OpenCode Go sejak 2026-09-06 wajib kirim `x-opencode-session`.
  // Tanpa itu: 400 MissingSessionID. Ini BUKAN model mati — jangan tandai dead.
  // Tool versi baru sudah mengirim header otomatis, jadi kalau masih muncul
  // berarti tool belum update atau ada proxy yang strip header.
  const isMissingSession =
    errType.includes('missingsessionid') ||
    lower.includes('missingsessionid') ||
    lower.includes('x-opencode-session')
  if (isMissingSession) {
    return {
      ok: false,
      status,
      error: 'session',
      message: t(lang, 'errSession', { detail: oneLine(detail, 100) }),
      detail: oneLine(detail, 200),
      dead: false,
    }
  }

  const status410 = status === 410
  const isEOL =
    status410 ||
    lower.includes('end of life') ||
    lower.includes('end-of-life') ||
    lower.includes('has been deprecated') ||
    lower.includes('no longer available')

  const is404 = status === 404
  const notFound =
    is404 ||
    lower.includes('not found') ||
    lower.includes('not found for account') ||
    lower.includes('404 page not found')

  const isRateLimit = status === 429 || lower.includes('rate limit') || lower.includes('429')

  const isAuth = status === 401 || status === 403 || lower.includes('unauthorized')

  const isPayment =
    status === 402 ||
    lower.includes('payment required') ||
    lower.includes('requires a subscription') ||
    lower.includes('requires subscription') ||
    lower.includes('upgrade for') ||
    lower.includes('insufficient') ||
    lower.includes('quota exceeded') ||
    lower.includes('billing') ||
    lower.includes('subscription') // covers "this model requires a subscription"

  const isInvalidModel =
    lower.includes('model does not exist') ||
    lower.includes('invalid model') ||
    lower.includes('unknown model')

  if (isEOL) {
    return {
      ok: false,
      status,
      error: 'eol',
      message: t(lang, 'errEol'),
      detail: oneLine(detail, 200),
      dead: true,
    }
  }
  if (notFound || isInvalidModel) {
    return {
      ok: false,
      status,
      error: 'notfound',
      message: t(lang, 'errNotFound'),
      detail: oneLine(detail, 200),
      dead: true,
    }
  }
  if (isAuth) {
    return {
      ok: false,
      status,
      error: 'auth',
      message: t(lang, 'errAuth'),
      detail: oneLine(detail, 200),
      dead: true,
    }
  }
  if (isPayment) {
    return {
      ok: false,
      status,
      error: 'payment',
      message: t(lang, 'errPayment'),
      detail: oneLine(detail, 200),
      dead: true,
    }
  }
  const isBadRequest =
    status === 400 ||
    lower.includes('bad request') ||
    lower.includes('invalid argument') ||
    lower.includes('not supported') ||
    lower.includes('unsupported') ||
    lower.includes('provider returned error')
  if (isBadRequest) {
    return {
      ok: false,
      status,
      error: 'badrequest',
      message: oneLine(detail, 120) || t(lang, 'errBadRequest'),
      detail: oneLine(detail, 200),
      dead: true,
    }
  }
  if (isRateLimit) {
    return {
      ok: false,
      status,
      error: 'ratelimit',
      message: t(lang, 'errRateLimit'),
      detail: oneLine(detail, 200),
      dead: false,
    }
  }
  return {
    ok: false,
    status,
    error: 'error',
    message: oneLine(detail, 120) || `HTTP ${status}`,
    detail: oneLine(detail, 200),
    dead: false,
  }
}
