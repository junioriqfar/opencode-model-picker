import { VERSION } from './version.js'

const REPO = 'junioriqfar/opencode-model-picker'
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_URL = `https://github.com/${REPO}/releases`

function parseVersion(value) {
  const raw = String(value ?? '').trim().replace(/^v/i, '')
  const [core, ...rest] = raw.split('-')
  const pre = rest.join('-')
  const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0)
  while (nums.length < 3) nums.push(0)
  return { nums, pre }
}

export function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (left.nums[i] !== right.nums[i]) return left.nums[i] > right.nums[i] ? 1 : -1
  }
  if (!left.pre && right.pre) return 1
  if (left.pre && !right.pre) return -1
  if (left.pre === right.pre) return 0
  return left.pre > right.pre ? 1 : -1
}

export function isUpdateAvailable(latest, current = VERSION) {
  return compareVersions(latest, current) > 0
}

export async function fetchLatestRelease({ timeoutMs = 2500, current = VERSION } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(LATEST_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `opencode-model-picker/${current}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    })
    if (res.status === 404) return { ok: false, error: 'norelease' }
    if (res.status === 403 || res.status === 429) return { ok: false, error: 'ratelimit' }
    if (!res.ok) return { ok: false, error: 'http', status: res.status }
    const data = await res.json()
    const version = String(data?.tag_name ?? '').replace(/^v/i, '')
    if (!version) return { ok: false, error: 'badresponse' }
    return {
      ok: true,
      version,
      current,
      url: data.html_url ?? RELEASES_URL,
      publishedAt: data.published_at ?? null,
      update: isUpdateAvailable(version, current),
    }
  } catch (err) {
    const reason = err?.name === 'AbortError' ? 'timeout' : 'network'
    return { ok: false, error: reason }
  } finally {
    clearTimeout(timer)
  }
}
