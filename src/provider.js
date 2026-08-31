import { t } from './i18n.js'

function oneLine(str, max = 120) {
  if (!str) return ''
  return String(str).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

const TEST_MESSAGE = 'Say hi'
const TEST_MAX_TOKENS = 16
const TEST_TIMEOUT = 15000

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeModelURL(baseURL) {
  let url = baseURL.trim()
  url = url.replace(/\/+$/, '')
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
      headers: { Authorization: `Bearer ${apiKey}` },
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

export async function testModel({
  baseURL,
  apiKey,
  model,
  timeoutMs = TEST_TIMEOUT,
  retryOn429 = true,
  lang = 'en',
}) {
  const url = `${normalizeModelURL(baseURL)}/chat/completions`

  const attempt = async () => {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: TEST_MESSAGE }],
            max_tokens: TEST_MAX_TOKENS,
            stream: false,
          }),
        },
        timeoutMs,
      )
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
          message: 'Respons kosong (mungkin token habis untuk reasoning)',
          warning: true,
          detail: oneLine(text, 200),
        }
      }
      return { ok: true, status: res.status, message: 'OK', warning: false, detail: null }
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          ok: false,
          status: 'timeout',
          error: 'timeout',
          message: t(lang, 'errTimeout', { sec: Math.round(timeoutMs / 1000) }),
          dead: false,
        }
      }
      return {
        ok: false,
        status: 'network',
        error: 'network',
        message: t(lang, 'errNetwork', { msg: oneLine(err.message ?? t(lang, 'errUnknown'), 100) }),
        dead: false,
      }
    }
  }

  let result = await attempt()
  if (!result.ok && result.error === 'ratelimit' && retryOn429) {
    await sleep(1500)
    result = await attempt()
  }
  return result
}

function classifyError(model, status, json, text, lang = 'en') {
  let detail = json?.error?.message ?? text ?? ''
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
