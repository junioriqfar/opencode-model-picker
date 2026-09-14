import { homedir } from 'node:os'
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export const APP_NAME = 'opencode-model-picker'

export function configDir() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
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

// Ikuti perilaku opencode: config global ada di xdgConfig/opencode, dan
// OPENCODE_CONFIG_DIR bisa menimpanya. Lihat opencode/packages/core/src/global.ts
// (Global.Path.config) dan opencode/packages/opencode/src/config/config.ts.
export function opencodeConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'opencode')
}

// opencode.globalConfigFile() memilih file global pertama yang ada dari daftar ini,
// dan memakai yang pertama (opencode.jsonc) bila belum ada satu pun.
export const OPENCODE_CONFIG_FILES = ['opencode.jsonc', 'opencode.json', 'config.json']

export function opencodeConfigPath() {
  const dir = opencodeConfigDir()
  for (const file of OPENCODE_CONFIG_FILES) {
    const full = join(dir, file)
    if (existsSync(full)) return full
  }
  return join(dir, OPENCODE_CONFIG_FILES[0])
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

// Buang koma terakhir sebelum "}" atau "]" (aman terhadap string).
// JSON.parse menolak trailing comma, padahal contoh resmi opencode.jsonc memakainya.
export function stripTrailingCommas(src) {
  let out = ''
  let inString = false
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (inString) {
      out += c
      if (c === '\\' && i + 1 < src.length) {
        out += src[i + 1]
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
    if (c === ',') {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (j < src.length && (src[j] === '}' || src[j] === ']')) {
        i++
        continue
      }
    }
    out += c
    i++
  }
  return out
}

export function parseJsonc(src) {
  return JSON.parse(stripTrailingCommas(stripJsoncComments(src)))
}

export function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function writeFileAtomic(path, content) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, content, 'utf8')
  try {
    renameSync(tmp, path)
  } catch {
    // Windows: rename ke file yang sudah ada bisa gagal -> fallback tulis langsung.
    writeFileSync(path, content, 'utf8')
    try {
      unlinkSync(tmp)
    } catch {}
  }
}
