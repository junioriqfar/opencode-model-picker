const TEST_MESSAGE = 'Say hi'
const TEST_MAX_TOKENS = 16
const TEST_TIMEOUT = 60000

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

export async function listModels({ baseURL, apiKey }) {
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
    throw new Error(
      `Gagal mengambil daftar model (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`,
    )
  }
  const data = await res.json()
  if (!Array.isArray(data?.data)) {
    throw new Error('Format respons /v1/models tidak dikenali (bukan array data)')
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

export async function testModel({ baseURL, apiKey, model, timeoutMs = TEST_TIMEOUT }) {
  const url = `${normalizeModelURL(baseURL)}/chat/completions`
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
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }

    if (!res.ok) {
      return classifyError(model, res.status, json, text)
    }

    const content = json?.choices?.[0]?.message?.content ?? null
    if (content === null || content === undefined) {
      return {
        ok: true,
        status: res.status,
        warning: 'Respons kosong (mungkin token habis untuk reasoning)',
        detail: text.slice(0, 200),
      }
    }
    return { ok: true, status: res.status, warning: null, detail: null }
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        status: 'timeout',
        error: 'timeout',
        message: `Timeout setelah ${timeoutMs / 1000}s`,
        dead: false,
      }
    }
    return {
      ok: false,
      status: 'network',
      error: err.message,
      message: `Network error: ${err.message}`,
      dead: false,
    }
  }
}

function classifyError(model, status, json, text) {
  const detail = json?.error?.message ?? text ?? ''
  const lower = detail.toLowerCase()

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
      message: 'End-of-life / tidak tersedia lagi',
      detail: detail.slice(0, 200),
      dead: true,
    }
  }
  if (notFound || isInvalidModel) {
    return {
      ok: false,
      status,
      error: 'notfound',
      message: 'Model tidak ditemukan',
      detail: detail.slice(0, 200),
      dead: true,
    }
  }
  if (isAuth) {
    return {
      ok: false,
      status,
      error: 'auth',
      message: 'API key tidak valid / tidak punya akses',
      detail: detail.slice(0, 200),
      dead: true,
    }
  }
  if (isRateLimit) {
    return {
      ok: false,
      status,
      error: 'ratelimit',
      message: 'Rate limited (sementara)',
      detail: detail.slice(0, 200),
      dead: false,
    }
  }
  return {
    ok: false,
    status,
    error: 'error',
    message: detail.slice(0, 200) || `HTTP ${status}`,
    detail: detail.slice(0, 200),
    dead: false,
  }
}
