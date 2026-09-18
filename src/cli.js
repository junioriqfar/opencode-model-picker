#!/usr/bin/env node
import {
  intro,
  outro,
  text,
  password,
  select,
  multiselect,
  spinner,
  cancel,
  isCancel,
  log,
  confirm,
} from '@clack/prompts'
import pc from 'picocolors'
import {
  loadAppConfig,
  saveAppConfig,
  upsertProvider,
  updateProvider,
  deleteProvider,
} from './config.js'
import { listModels, testModel, sleep, isOpencodeZen, guessApi } from './provider.js'
import { attachScores, sortByScore, sortByName } from './scoring.js'
import {
  buildModelsBlock,
  buildProviderBlock,
  pickProviderNpm,
  writeOpencodeConfig,
  readOpencodeConfig,
  providerExists,
} from './opencode.js'
import { existsSync } from 'node:fs'
import { APP_NAME, appConfigPath } from './utils.js'
import { t, formatNumber, NUMBERING_STYLES } from './i18n.js'

const BACK = Symbol('back')

// @clack/prompts memetakan ESC dan Ctrl+C ke cancel yang sama.
// Listener ini mencatat nama tombol terakhir agar keduanya bisa dibedakan:
// ESC = kembali ke langkah sebelumnya, Ctrl+C = keluar.
let lastKeyName = null
if (process.stdin?.isTTY) {
  process.stdin.on('keypress', (str, key) => {
    if (key?.name) lastKeyName = key.name
    else if (str === '\x1b') lastKeyName = 'escape'
  })
}

function isBack(value) {
  return isCancel(value) && lastKeyName === 'escape'
}

function isQuit(value) {
  return isCancel(value) && lastKeyName !== 'escape'
}

function oneLine(str, max = 80) {
  return String(str ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function main() {
  let config = loadAppConfig()
  let lang = config.settings.language
  const tr = (key, params) => t(lang, key, params)

  intro(pc.bold(pc.cyan(` ${APP_NAME} — ${tr('intro')}`)))

  // ---------- First run: if no config file, prompt all settings ----------
  if (!existsSync(appConfigPath())) {
    log.message(pc.bold(t(lang, 'firstRunTitle')))
    log.info(t(lang, 'firstRunDesc'))

    // ESC = kembali ke langkah sebelumnya; Ctrl+C = keluar.
    const setupSteps = ['language', 'timeout', 'numbering', 'sort']
    for (let i = 0; i < setupSteps.length; ) {
      const step = setupSteps[i]

      if (step === 'language') {
        const langPick = await select({
          message: t(lang, 'languagePrompt'),
          options: [
            { value: 'en', label: t(lang, 'languageEn') },
            { value: 'id', label: t(lang, 'languageId') },
          ],
        })
        if (isCancel(langPick)) {
          if (isBack(langPick) && i > 0) {
            i--
            continue
          }
          return handleCancel(lang)
        }
        config.settings.language = langPick
        lang = langPick
        saveAppConfig(config)
        log.success(t(lang, 'languageUpdated', { lang: langPick === 'en' ? 'English' : 'Indonesia' }))
        i++
      } else if (step === 'timeout') {
        const picked = await text({
          message: t(lang, 'timeoutPromptSettings'),
          initialValue: String(config.settings.timeout),
          validate: (v) => {
            const n = Number(v)
            if (!Number.isInteger(n) || n < 1 || n > 300) return t(lang, 'timeoutValidation')
            return undefined
          },
        })
        if (isCancel(picked)) {
          if (isBack(picked)) {
            i--
            continue
          }
          return handleCancel(lang)
        }
        config.settings.timeout = Number(picked)
        saveAppConfig(config)
        log.success(t(lang, 'timeoutUpdated', { sec: config.settings.timeout }))
        i++
      } else if (step === 'numbering') {
        const picked = await select({
          message: t(lang, 'numberingPrompt'),
          options: Object.keys(NUMBERING_STYLES).map((k) => {
            const label = NUMBERING_STYLES[k].label[lang]
            const preview = `${formatNumber(0, k)}model-a | ${formatNumber(1, k)}model-b | ${formatNumber(9, k)}model-j`
            return { value: k, label: `${k} — ${label} ${pc.dim(`(${preview})`)}` }
          }),
        })
        if (isCancel(picked)) {
          if (isBack(picked)) {
            i--
            continue
          }
          return handleCancel(lang)
        }
        config.settings.numbering = picked
        saveAppConfig(config)
        log.success(t(lang, 'numberingUpdated', { style: picked }))
        i++
      } else if (step === 'sort') {
        const picked = await select({
          message: t(lang, 'sortPrompt'),
          options: [
            { value: 'score', label: t(lang, 'sortScore') },
            { value: 'name', label: t(lang, 'sortName') },
          ],
          initialValue: config.settings.sort,
        })
        if (isCancel(picked)) {
          if (isBack(picked)) {
            i--
            continue
          }
          return handleCancel(lang)
        }
        config.settings.sort = picked
        saveAppConfig(config)
        log.success(t(lang, 'sortUpdated', { sort: picked }))
        i++
      }
    }
    // reload to ensure consistency
    config = loadAppConfig()
    lang = config.settings.language
    log.message(pc.green(`${t(lang, 'firstRunTitle')} — ${t(lang, 'pressEnterToContinue')}`))
  }

  // settings handler defined as closure to mutate lang/config
  async function handleSettingsMenu() {
    while (true) {
      config = loadAppConfig()
      lang = config.settings.language
      const curLangLabel = lang === 'en' ? t(lang, 'languageEn') : t(lang, 'languageId')
      const timeout = config.settings.timeout
      const numbering = config.settings.numbering
      const numberingPreview = `${formatNumber(0, numbering)}example-model`

      const choice = await select({
        message: t(lang, 'settingsTitle'),
        options: [
          { value: 'language', label: `${t(lang, 'settingsLanguage')}: ${curLangLabel}` },
          { value: 'timeout', label: `${t(lang, 'settingsTimeout')}: ${timeout}s` },
          {
            value: 'numbering',
            label: `${t(lang, 'settingsNumbering')}: ${numbering} ${pc.dim(`(${t(lang, 'numberingPreview', { preview: numberingPreview })})`)}`,
          },
          {
            value: 'sort',
            label: `${t(lang, 'settingsSort')}: ${config.settings.sort === 'name' ? t(lang, 'sortName') : t(lang, 'sortScore')}`,
          },
          { value: 'back', label: pc.green(t(lang, 'settingsBack')) },
        ],
      })
      if (isCancel(choice)) {
        if (isBack(choice)) return
        return handleCancel(lang)
      }
      if (choice === 'back') break

      if (choice === 'language') {
        const langPick = await select({
          message: t(lang, 'languagePrompt'),
          options: [
            { value: 'en', label: t(lang, 'languageEn') },
            { value: 'id', label: t(lang, 'languageId') },
          ],
        })
        if (isCancel(langPick)) {
          if (isBack(langPick)) continue
          return handleCancel(lang)
        }
        config.settings.language = langPick
        saveAppConfig(config)
        lang = langPick
        log.success(t(lang, 'languageUpdated', { lang: langPick === 'en' ? 'English' : 'Indonesia' }))
      } else if (choice === 'timeout') {
        const newTimeout = await text({
          message: t(lang, 'timeoutPromptSettings'),
          initialValue: String(config.settings.timeout),
          validate: (v) => {
            const n = Number(v)
            if (!Number.isInteger(n) || n < 1 || n > 300) return t(lang, 'timeoutValidation')
            return undefined
          },
        })
        if (isCancel(newTimeout)) {
          if (isBack(newTimeout)) continue
          return handleCancel(lang)
        }
        config.settings.timeout = Number(newTimeout)
        saveAppConfig(config)
        log.success(t(lang, 'timeoutUpdated', { sec: config.settings.timeout }))
      } else if (choice === 'numbering') {
        const numberingChoice = await select({
          message: t(lang, 'numberingPrompt'),
          options: Object.keys(NUMBERING_STYLES).map((k) => {
            const styleLabel = NUMBERING_STYLES[k].label[lang]
            const preview = `${formatNumber(0, k)}model-a | ${formatNumber(1, k)}model-b | ${formatNumber(9, k)}model-j`
            return {
              value: k,
              label: `${k} — ${styleLabel} ${pc.dim(`(${preview})`)}`,
            }
          }),
        })
        if (isCancel(numberingChoice)) {
          if (isBack(numberingChoice)) continue
          return handleCancel(lang)
        }
        config.settings.numbering = numberingChoice
        saveAppConfig(config)
        log.success(t(lang, 'numberingUpdated', { style: numberingChoice }))
      } else if (choice === 'sort') {
        const sortChoice = await select({
          message: t(lang, 'sortPrompt'),
          options: [
            { value: 'score', label: t(lang, 'sortScore') },
            { value: 'name', label: t(lang, 'sortName') },
          ],
          initialValue: config.settings.sort,
        })
        if (isCancel(sortChoice)) {
          if (isBack(sortChoice)) continue
          return handleCancel(lang)
        }
        config.settings.sort = sortChoice
        saveAppConfig(config)
        log.success(t(lang, 'sortUpdated', { sort: sortChoice }))
      }
    }
  }

  appLoop: while (true) {
    // ---------- 1. Provider ----------
    let provider
    while (true) {
    config = loadAppConfig()
    lang = config.settings.language
    const hasSaved = config.providers.length > 0
    const options = []
    if (hasSaved) options.push({ value: 'use', label: t(lang, 'actionUse') })
    if (hasSaved) options.push({ value: 'manage', label: t(lang, 'actionManage') })
    options.push({ value: 'new', label: t(lang, 'actionNew') })
    options.push({ value: 'settings', label: t(lang, 'actionSettings') })
    if (hasSaved) options.push({ value: 'exit', label: pc.red(t(lang, 'actionExit')) })

    const startChoice = await select({
      message: t(lang, 'chooseAction'),
      options,
    })
    if (isCancel(startChoice)) return handleCancel(lang)
    if (startChoice === 'exit') {
      outro(pc.yellow(t(lang, 'outroDone')))
      return
    }
    if (startChoice === 'manage') {
      await manageProviders(lang)
      continue
    }
    if (startChoice === 'settings') {
      await handleSettingsMenu()
      // refresh intro? just continue loop (lang may have changed, re-show intro? keep simple)
      continue
    }

    if (startChoice === 'use') {
      const names = config.providers.map((p, i) => ({
        value: i,
        label: `${p.name} — ${p.baseURL}`,
      }))
      const picked = await select({
        message: t(lang, 'chooseProvider'),
        options: names,
      })
      if (isCancel(picked)) {
        // ESC = kembali ke menu utama; Ctrl+C = keluar.
        if (isBack(picked)) continue
        return handleCancel(lang)
      }
      provider = { ...config.providers[picked] }
    } else {
      const added = await addNewProvider(config, lang)
      if (added === BACK) continue
      provider = added
    }
    break
  }

  // ---------- 2. Ambil model ----------
  const s = spinner()
  s.start(t(lang, 'fetchingModels'))
  let models
  try {
    models = await listModels({ baseURL: provider.baseURL, apiKey: provider.apiKey, lang })
    s.stop(t(lang, 'foundModels', { count: models.length }))
  } catch (err) {
    s.stop(t(lang, 'failedFetch'))
    log.error(err.message)
    continue appLoop
  }

  // ---------- 3-9. Pilih model -> tes -> urutkan -> simpan ----------
  // ESC = kembali ke langkah sebelumnya, Ctrl+C = keluar.
  let step = 'mode'
  let mode = null
  let toTest = []
  let runTest = true
  let results = []
  let ranked = []
  let showScore = true
  let key = ''
  let shortNames = null

  while (true) {
    // ---------- 3. Pilih model ----------
    if (step === 'mode') {
      const picked = await select({
        message: t(lang, 'selectModePrompt', { count: models.length }),
        options: [
          { value: 'all', label: t(lang, 'selectAll', { count: models.length }) },
          { value: 'custom', label: t(lang, 'selectCustom') },
        ],
      })
      if (isCancel(picked)) {
        // ESC = kembali ke menu provider (refetch), Ctrl+C = keluar.
        if (isBack(picked)) continue appLoop
        return handleCancel(lang)
      }
      mode = picked
      if (mode === 'all') {
        toTest = models
        step = 'testConfirm'
      } else {
        step = 'custom'
      }
      continue
    }

    if (step === 'custom') {
      const selected = await multiselect({
        message: t(lang, 'selectModels'),
        options: models.map((m) => ({ value: m.id, label: m.id })),
        required: false,
        maxItems: 40,
      })
      if (isCancel(selected)) {
        if (isBack(selected)) {
          step = 'mode'
          continue
        }
        return handleCancel(lang)
      }
      if (selected.length === 0) {
        log.warn(t(lang, 'noProvider'))
        continue appLoop
      }
      toTest = models.filter((m) => selected.includes(m.id))
      step = 'testConfirm'
      continue
    }

    // ---------- 4. Tes akses (opsional) ----------
    if (step === 'testConfirm') {
      const picked = await confirm({
        message: t(lang, 'testModelsConfirm'),
        initialValue: true,
      })
      if (isCancel(picked)) {
        if (isBack(picked)) {
          step = mode === 'custom' ? 'custom' : 'mode'
          continue
        }
        return handleCancel(lang)
      }
      runTest = picked

      const timeoutMs = config.settings.timeout * 1000
      results = []
      if (!runTest) {
        // Lewati tes: pakai semua model terpilih tanpa hit per model.
        for (const m of toTest) {
          results.push({ model: m, result: { ok: true, api: guessApi(provider.baseURL, m.id), skipped: true } })
        }
        log.info(t(lang, 'testSkipped', { count: toTest.length }))
      } else {
        s.start(t(lang, 'checkingModels'))
        for (let i = 0; i < toTest.length; i++) {
          const m = toTest[i]
          const r = await testModel({
            baseURL: provider.baseURL,
            apiKey: provider.apiKey,
            model: m.id,
            timeoutMs,
            lang,
          })
          results.push({ model: m, result: r })
          if (r.ok) s.message(`${m.id} ${pc.green('✓')}`)
          else s.message(`${m.id} ${pc.red('✗')} — ${oneLine(r.message ?? t(lang, 'errUnknown'), 80)}`)
          if (i < toTest.length - 1) await sleep(500)
        }
        s.stop(t(lang, 'checkDone'))
      }

      // ---------- 5. Rekap hasil ----------
      const okModels = results
        .filter((r) => r.result.ok)
        .map((r) => ({ ...r.model, _testResult: r.result, api: r.result.api ?? 'chat' }))
      const deadModels = results.filter((r) => !r.result.ok && r.result.dead)
      const warnModels = results.filter((r) => !r.result.ok && !r.result.dead)

      if (runTest) {
        log.info(
          `${pc.green(t(lang, 'recapOk', { count: okModels.length }))}  ${pc.red(
            t(lang, 'recapDead', { count: deadModels.length }),
          )}  ${pc.yellow(t(lang, 'recapWarn', { count: warnModels.length }))}`,
        )
        if (warnModels.length > 0) {
          log.warn(
            warnModels
              .map((r) => `  ! ${r.model.id} — ${oneLine(r.result.message ?? t(lang, 'errUnknown'), 100)}`)
              .join('\n'),
          )
        }
        if (deadModels.length > 0) {
          log.error(
            deadModels
              .map((r) => `  ✗ ${r.model.id} — ${oneLine(r.result.message ?? t(lang, 'errUnknown'), 100)}`)
              .join('\n'),
          )
        }
      }

      if (okModels.length === 0) {
        log.error(t(lang, 'noWorkingModel'))
        continue appLoop
      }

      // ---------- 6. Urutkan model ----------
      const scored = attachScores(okModels)
      ranked = config.settings.sort === 'name' ? sortByName(scored) : sortByScore(scored)
      showScore = config.settings.sort !== 'name'
      step = 'editConfirm'
      continue
    }

    // ---------- 7. Ranking + edit manual ----------
    if (step === 'editConfirm') {
      const lines = ranked
        .map((m, i) => `  ${i + 1}. ${m.id}${showScore ? ' ' + pc.dim(t(lang, 'scoreLabel', { score: m._score })) : ''}`)
        .join('\n')
      log.message(`${pc.bold(t(lang, 'rankingTitle'))}\n${lines}`)

      const picked = await confirm({
        message: t(lang, 'editOrderConfirm'),
        initialValue: false,
      })
      if (isCancel(picked)) {
        if (isBack(picked)) {
          step = 'testConfirm'
          continue
        }
        return handleCancel(lang)
      }
      if (picked) {
        step = 'reorder'
        continue
      }
      step = 'providerKey'
      continue
    }

    if (step === 'reorder') {
      const reordered = await manualReorder(ranked, lang, config.settings.numbering, showScore)
      if (reordered === BACK) {
        step = 'editConfirm'
        continue
      }
      ranked = reordered
      step = 'providerKey'
      continue
    }

    // ---------- 8. Konfigurasi output ----------
    if (step === 'providerKey') {
      log.message(pc.bold(t(lang, 'configSettingsTitle')))
      const providerKey = await text({
        message: t(lang, 'providerKeyPrompt'),
        initialValue: key || provider.name,
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'required')),
      })
      if (isCancel(providerKey)) {
        if (isBack(providerKey)) {
          step = 'editConfirm'
          continue
        }
        return handleCancel(lang)
      }
      key = providerKey.trim()
      step = 'shortMode'
      continue
    }

    if (step === 'shortMode') {
      const picked = await confirm({
        message: t(lang, 'autoShortConfirm'),
        initialValue: true,
      })
      if (isCancel(picked)) {
        if (isBack(picked)) {
          step = 'providerKey'
          continue
        }
        return handleCancel(lang)
      }
      if (picked) {
        const map = {}
        for (const m of ranked) map[m.id] = m.id.split('/').pop()
        shortNames = map
        step = 'save'
      } else {
        shortNames = null
        step = 'shortNames'
      }
      continue
    }

    if (step === 'shortNames') {
      const map = {}
      let goBack = false
      for (const m of ranked) {
        const short = await text({
          message: t(lang, 'shortNamePrompt', { id: m.id }),
          initialValue: m.id.split('/').pop(),
        })
        if (isCancel(short)) {
          if (isBack(short)) {
            goBack = true
            break
          }
          return handleCancel(lang)
        }
        map[m.id] = (short ?? '').trim() || m.id
      }
      if (goBack) {
        step = 'shortMode'
        continue
      }
      shortNames = map
      step = 'save'
      continue
    }

    // ---------- 9. Preview & simpan ----------
    if (step === 'save') {
      const ordered = ranked.map((m) => ({
        id: m.id,
        shortName: shortNames[m.id],
        vision: m.capabilities.vision,
        api: m.api ?? m._testResult?.api ?? 'chat',
        contextLength: m.contextLength ?? null,
        maxOutput: m.maxOutput ?? null,
      }))

      const isGo = isOpencodeZen(provider.baseURL)
      const providerNpm = pickProviderNpm(ordered)
      const modelsBlock = buildModelsBlock(ordered, {
        numbering: config.settings.numbering,
        defaultNpm: providerNpm,
        go: isGo,
      })
      const providerBlock = buildProviderBlock({
        key,
        npm: providerNpm,
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        models: modelsBlock,
      })

      const { path: ocPath } = readOpencodeConfig(lang)
      log.info(t(lang, 'targetConfig', { path: ocPath }))

      log.message(pc.bold(t(lang, 'listToWrite')))
      ordered.forEach((m, i) => {
        const prefix = formatNumber(i, config.settings.numbering)
        log.message(`  ${pc.cyan(`${prefix}${m.shortName}`)}  ${pc.dim('← ' + m.id)}`)
      })

      if (isGo) log.info(t(lang, 'variantsHint'))

      const preview = JSON.stringify(providerBlock, null, 2)
      log.message(pc.bold(t(lang, 'previewBlock')))
      log.message(pc.dim(preview))

      const alreadyExists = providerExists(key, lang)
      if (alreadyExists) {
        log.warn(t(lang, 'providerExistsWarn', { key }))
      }

      const save = await confirm({
        message: alreadyExists
          ? t(lang, 'replaceConfirm', {
              key,
              oldCount: Object.keys(readOpencodeConfig(lang).config.provider?.[key]?.models ?? {}).length,
              newCount: ordered.length,
            })
          : t(lang, 'saveConfirm'),
        initialValue: true,
      })
      if (isCancel(save)) {
        if (isBack(save)) {
          step = 'shortMode'
          continue
        }
        return handleCancel(lang)
      }

      if (save) {
        const { backupPath } = writeOpencodeConfig(key, providerBlock, lang)
        if (backupPath) log.info(pc.dim(t(lang, 'backupCreated', { path: backupPath })))

        // Simpan perubahan provider key ke provider tersimpan supaya run
        // berikutnya memakai key yang sama (label menu ikut konsisten).
        if (key !== provider.name) {
          const idx = config.providers.findIndex(
            (p) => p.baseURL === provider.baseURL && p.apiKey === provider.apiKey && p.name === provider.name,
          )
          if (idx >= 0) {
            updateProvider(config, idx, { name: key })
            saveAppConfig(config)
          }
        }

        outro(pc.green(t(lang, 'savedRestart')))
      } else {
        outro(pc.yellow(t(lang, 'saveCancelled')))
      }
      step = 'repeat'
      continue
    }

    // ---------- Akhir proses: tanya apakah ingin mengulang ----------
    if (step === 'repeat') {
      const again = await confirm({
        message: `${t(lang, 'repeatPrompt')} ${pc.dim(`(${t(lang, 'repeatHint')})`)}`,
        initialValue: false,
      })
      if (isCancel(again)) {
        if (isBack(again)) continue appLoop
        return handleCancel(lang)
      }
      if (again) {
        // tampilkan pemisah lalu kembali ke menu utama (appLoop)
        log.message(pc.dim('─'.repeat(40)))
        continue appLoop
      }
      break
    }
  }
  }
}

async function addNewProvider(config, lang) {
  // ESC = kembali (keluar dari tambah provider), Ctrl+C = keluar aplikasi.
  let step = 'url'
  let baseURL = ''
  let apiKey = ''

  while (true) {
    if (step === 'url') {
      const value = await text({
        message: t(lang, 'baseUrlPrompt'),
        placeholder: t(lang, 'baseUrlPlaceholder'),
        initialValue: baseURL || undefined,
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'baseUrlRequired')),
      })
      if (isCancel(value)) {
        if (isBack(value)) return BACK
        return handleCancel(lang)
      }
      baseURL = value.trim()
      step = 'key'
      continue
    }

    if (step === 'key') {
      const value = await password({
        message: t(lang, 'apiKeyPrompt'),
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'apiKeyRequired')),
      })
      if (isCancel(value)) {
        if (isBack(value)) {
          step = 'url'
          continue
        }
        return handleCancel(lang)
      }
      apiKey = value.trim()
      step = 'name'
      continue
    }

    if (step === 'name') {
      const value = await text({
        message: t(lang, 'providerNamePrompt'),
        placeholder: t(lang, 'providerNamePlaceholder'),
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'providerNameRequired')),
      })
      if (isCancel(value)) {
        if (isBack(value)) {
          step = 'key'
          continue
        }
        return handleCancel(lang)
      }
      const provider = { name: value.trim(), baseURL, apiKey }
      upsertProvider(config, provider)
      saveAppConfig(config)
      return provider
    }
  }
}

async function manageProviders(lang) {
  let config = loadAppConfig()
  while (config.providers.length > 0) {
    const options = config.providers.map((p, i) => ({
      value: `edit:${i}`,
      label: `${p.name} — ${p.baseURL}`,
    }))
    options.push({ value: 'done', label: pc.green(t(lang, 'back')) })

    const pick = await select({
      message: t(lang, 'managePick'),
      options,
    })
    if (isCancel(pick)) {
      // ESC = kembali ke menu utama, Ctrl+C = keluar.
      if (isBack(pick)) return
      return handleCancel(lang)
    }
    if (pick === 'done') break

    const idx = Number(pick.split(':')[1])
    const action = await select({
      message: t(lang, 'manageFor', { name: config.providers[idx].name }),
      options: [
        { value: 'rename', label: t(lang, 'rename') },
        { value: 'url', label: t(lang, 'editUrl') },
        { value: 'apikey', label: t(lang, 'editApiKey') },
        { value: 'delete', label: pc.red(t(lang, 'deleteProvider')) },
        { value: 'back', label: pc.green(t(lang, 'back')) },
      ],
    })
    if (isCancel(action)) {
      // ESC = kembali ke daftar provider, Ctrl+C = keluar.
      if (isBack(action)) continue
      return handleCancel(lang)
    }

    if (action === 'back') continue

    if (action === 'rename') {
      const name = await text({
        message: t(lang, 'newName'),
        initialValue: config.providers[idx].name,
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'providerNameRequired')),
      })
      if (isCancel(name)) {
        if (isBack(name)) continue
        return handleCancel(lang)
      }
      updateProvider(config, idx, { name: name.trim() })
      saveAppConfig(config)
      log.success(t(lang, 'renamedTo', { name: name.trim() }))
    } else if (action === 'url') {
      const url = await text({
        message: t(lang, 'newUrl'),
        initialValue: config.providers[idx].baseURL,
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'baseUrlRequired')),
      })
      if (isCancel(url)) {
        if (isBack(url)) continue
        return handleCancel(lang)
      }
      updateProvider(config, idx, { baseURL: url.trim() })
      saveAppConfig(config)
      log.success(t(lang, 'urlUpdated'))
    } else if (action === 'apikey') {
      const key = await password({
        message: t(lang, 'newApiKey'),
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'apiKeyRequired')),
      })
      if (isCancel(key)) {
        if (isBack(key)) continue
        return handleCancel(lang)
      }
      updateProvider(config, idx, { apiKey: key.trim() })
      saveAppConfig(config)
      log.success(t(lang, 'apiKeyUpdated'))
    } else if (action === 'delete') {
      const ok = await confirm({
        message: t(lang, 'deleteConfirm', { name: config.providers[idx].name }),
        initialValue: false,
      })
      if (isCancel(ok)) {
        if (isBack(ok)) continue
        return handleCancel(lang)
      }
      if (ok) {
        deleteProvider(config, idx)
        saveAppConfig(config)
        log.success(t(lang, 'providerDeleted'))
      }
    }
    config = loadAppConfig()
  }
}

async function manualReorder(models, lang, numbering, showScore = true) {
  const list = [...models]
  while (true) {
    {
      const lines = list
        .map((m, i) => `  ${i + 1}. ${m.id}${showScore ? ' ' + pc.dim(t(lang, 'scoreLabel', { score: m._score })) : ''}`)
        .join('\n')
      log.message(`${pc.bold(t(lang, 'currentOrder'))}\n${lines}`)
    }

    const action = await select({
      message: t(lang, 'pickToMove'),
      options: [
        ...list.map((m, i) => ({ value: `move:${i}`, label: t(lang, 'moveLabel', { id: m.id }) })),
        { value: 'done', label: pc.green(t(lang, 'doneContinue')) },
      ],
    })
    if (isCancel(action)) {
      // ESC = kembali ke pertanyaan edit manual, Ctrl+C = keluar.
      if (isBack(action)) return BACK
      return handleCancel(lang)
    }
    if (action === 'done') break

    const idx = Number(action.split(':')[1])
    const target = await text({
      message: t(lang, 'moveToPosition', { id: list[idx].id, len: list.length }),
      validate: (v) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1 || n > list.length) return t(lang, 'positionValidation', { len: list.length })
        return undefined
      },
    })
    if (isCancel(target)) {
      // ESC = kembali ke daftar pilihan, Ctrl+C = keluar.
      if (isBack(target)) continue
      return handleCancel(lang)
    }

    const pos = Number(target) - 1
    const [item] = list.splice(idx, 1)
    list.splice(pos, 0, item)
  }
  return list
}

function handleCancel(lang = 'en') {
  cancel(t(lang, 'cancelled'))
  process.exit(0)
}

main().catch((err) => {
  // try to use saved language for error message
  let lang = 'en'
  try {
    lang = loadAppConfig().settings.language
  } catch {}
  cancel(err.message ?? t(lang, 'errorOccurred'))
  process.exit(1)
})
