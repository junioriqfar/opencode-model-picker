import { homedir } from 'node:os'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const APP_NAME = 'opencode-model-picker'

export function configDir() {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
      : join(homedir(), '.config')
  return join(base, APP_NAME)
}

export function appConfigPath() {
  return join(configDir(), 'config.json')
}

export function ensureConfigDir() {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function opencodeConfigPath() {
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(base, 'opencode', 'opencode.jsonc')
  }
  return join(homedir(), '.config', 'opencode', 'opencode.jsonc')
}

export function stripJsoncComments(src) {
  let out = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false
        out += c
      }
      i++
      continue
    }
    if (inBlockComment) {
      if (c === '*' && n === '/') {
        inBlockComment = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (inString) {
      out += c
      if (c === '\\' && n !== undefined) {
        out += n
        i += 2
        continue
      }
      if (c === '"') inString = false
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === '/' && n === '/') {
      inLineComment = true
      i += 2
      continue
    }
    if (c === '/' && n === '*') {
      inBlockComment = true
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

export function parseJsonc(src) {
  return JSON.parse(stripJsoncComments(src))
}

export function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function writeFileAtomic(path, content) {
  writeFileSync(path, content, 'utf8')
}
