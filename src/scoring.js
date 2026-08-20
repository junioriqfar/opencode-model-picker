const CODE_KEYWORDS = [
  'coder',
  'coding',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-chat',
  'deepseek-reasoner',
  'glm',
  'kimi',
  'nemotron',
  'qwen',
  'gpt',
  'claude',
  'opencode',
  'llama',
  'gemma',
  'codestral',
  'moonshot',
  'minimax',
]

const NON_CODE_KEYWORDS = [
  'asr',
  'stt',
  'tts',
  'speech',
  'embed',
  'reward',
  'lyria',
  'clip',
  'video',
  'image-gen',
  'image-generation',
  'flux',
  'whisper',
  'tts',
  'rerank',
]

export function scoreModel(model) {
  const id = model.id.toLowerCase()
  const caps = model.capabilities
  let score = 0
  const reasons = []

  if (caps.reasoning) {
    score += 30
    reasons.push('reasoning +30')
  }
  if (caps.tools) {
    score += 20
    reasons.push('tools +20')
  }
  if (caps.pdf) {
    score += 5
    reasons.push('pdf +5')
  }

  if (model.contextLength != null) {
    if (model.contextLength >= 1000000) {
      score += 25
      reasons.push('context 1M+ +25')
    } else if (model.contextLength >= 200000) {
      score += 15
      reasons.push('context 200K+ +15')
    } else if (model.contextLength >= 64000) {
      score += 5
      reasons.push('context 64K+ +5')
    }
  }

  if (caps.vision) {
    score += 5
    reasons.push('vision +5')
  }

  const codeHit = CODE_KEYWORDS.filter((k) => id.includes(k))
  if (codeHit.length > 0) {
    score += 15
    reasons.push('nama-coder +15')
  }

  const nonCodeHit = NON_CODE_KEYWORDS.filter((k) => id.includes(k))
  if (nonCodeHit.length > 0) {
    score -= 30
    reasons.push(`bukan-coding -30 (${nonCodeHit.join(',')})`)
  }

  // model gratis yang dikenal baik untuk coding
  if (id.includes(':free')) {
    score += 3
    reasons.push('free +3')
  }

  return { score, reasons }
}

export function sortByScore(models) {
  return [...models].sort((a, b) => {
    const diff = b._score - a._score
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
}

export function attachScores(models) {
  return models.map((m) => {
    const { score, reasons } = scoreModel(m)
    return { ...m, _score: score, _reasons: reasons }
  })
}
