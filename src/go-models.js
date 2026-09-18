// Snapshot metadata model OpenCode Go dari models.dev (provider "opencode-go").
// Dipakai agar OpenCode otomatis membuat model variants (butuh capabilities.reasoning
// + limit.output; lihat ProviderTransform.variants di source opencode).
// Sumber: https://models.dev/api.json — regenerasi dengan `npm run sync:models`.

export const GO_MODEL_FALLBACK = { context: 131072, output: 8192, reasoning: true, input: ["text"] }

export const GO_MODEL_META = {
  "deepseek-v4-flash": { context: 1000000, output: 384000, reasoning: true, input: ["text"] },
  "deepseek-v4-flash-vision-exp": { context: 1000000, output: 384000, reasoning: true, input: ["text","image"] },
  "deepseek-v4-pro": { context: 1000000, output: 384000, reasoning: true, input: ["text"] },
  "deepseek-v4.1-flash": { context: 1000000, output: 384000, reasoning: true, input: ["text","image"] },
  "glm-5": { context: 202752, output: 32768, reasoning: true, input: ["text"] },
  "glm-5.1": { context: 202752, output: 32768, reasoning: true, input: ["text"] },
  "glm-5.2": { context: 1000000, output: 131072, reasoning: true, input: ["text"] },
  "glm-5.3": { context: 1000000, output: 131072, reasoning: true, input: ["text"] },
  "glm-5.3-flash": { context: 1000000, output: 131072, reasoning: true, input: ["text","image","video","pdf"] },
  "gpt-5.6-luna": { context: 1050000, output: 128000, reasoning: true, input: ["text","image","pdf"] },
  "grok-4.5": { context: 500000, output: 500000, reasoning: true, input: ["text","image"] },
  "grok-4.6": { context: 500000, output: 500000, reasoning: true, input: ["text","image"] },
  "hy3": { context: 256000, output: 128000, reasoning: true, input: ["text"] },
  "hy4-preview": { context: 1024000, output: 64000, reasoning: true, input: ["text"] },
  "kimi-k2.5": { context: 262144, output: 65536, reasoning: true, input: ["text","image","video"] },
  "kimi-k2.6": { context: 262144, output: 65536, reasoning: true, input: ["text","image","video"] },
  "kimi-k2.7-code": { context: 262144, output: 262144, reasoning: true, input: ["text","image","video"] },
  "kimi-k3": { context: 1048576, output: 131072, reasoning: true, input: ["text","image","video"] },
  "longcat-2.0": { context: 1000000, output: 131072, reasoning: true, input: ["text"] },
  "mimo-v2-omni": { context: 262144, output: 128000, reasoning: true, input: ["text","image","audio","pdf"] },
  "mimo-v2-pro": { context: 1048576, output: 128000, reasoning: true, input: ["text"] },
  "mimo-v2.5": { context: 1000000, output: 128000, reasoning: true, input: ["text","image","audio","video"] },
  "mimo-v2.5-pro": { context: 1048576, output: 128000, reasoning: true, input: ["text"] },
  "minimax-m2.5": { context: 204800, output: 65536, reasoning: true, input: ["text"] },
  "minimax-m2.7": { context: 204800, output: 131072, reasoning: true, input: ["text"] },
  "minimax-m3": { context: 1000000, output: 131072, reasoning: true, input: ["text","image","video"] },
  "muse-spark-1.2-contributor": { context: 1048576, output: 131072, reasoning: true, input: ["text","image","video","pdf","audio"] },
  "muse-spark-1.3-contributor": { context: 1048576, output: 131072, reasoning: true, input: ["text","image","video","pdf","audio"] },
  "omen-alpha": { context: 500000, output: 128000, reasoning: true, input: ["text","image"] },
  "ox-alpha-free": { context: 1000000, output: 131072, reasoning: true, input: ["text","image","video"] },
  "qwen3.5-plus": { context: 262144, output: 65536, reasoning: true, input: ["text","image","video"] },
  "qwen3.6-plus": { context: 1000000, output: 65536, reasoning: true, input: ["text","image","video"] },
  "qwen3.7-max": { context: 1000000, output: 65536, reasoning: true, input: ["text"] },
  "qwen3.7-plus": { context: 1000000, output: 65536, reasoning: true, input: ["text","image","video"] },
  "qwen3.8-flash": { context: 1000000, output: 131072, reasoning: true, input: ["text","image","video"] },
  "qwen3.8-max": { context: 1000000, output: 131072, reasoning: true, input: ["text","image","video"] },
}

export function getGoModelMeta(id) {
  const meta = GO_MODEL_META[id]
  if (!meta) return GO_MODEL_FALLBACK
  return {
    context: meta.context ?? GO_MODEL_FALLBACK.context,
    output: meta.output ?? GO_MODEL_FALLBACK.output,
    reasoning: meta.reasoning !== false,
    input: Array.isArray(meta.input) && meta.input.length > 0 ? meta.input : GO_MODEL_FALLBACK.input,
  }
}
