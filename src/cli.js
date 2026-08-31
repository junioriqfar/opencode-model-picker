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
import { listModels, testModel, sleep } from './provider.js'
import { attachScores, sortByScore } from './scoring.js'
import {
  buildModelsBlock,
  writeOpencodeConfig,
  readOpencodeConfig,
  providerExists,
} from './opencode.js'
import { existsSync } from 'node:fs'
import { APP_NAME, appConfigPath } from './utils.js'
import { t, formatNumber, NUMBERING_STYLES } from './i18n.js'

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

    // Language
    {
      const langPick = await select({
        message: t(lang, 'languagePrompt'),
        options: [
          { value: 'en', label: t(lang, 'languageEn') },
          { value: 'id', label: t(lang, 'languageId') },
        ],
      })
      if (isCancel(langPick)) return handleCancel(lang)
      config.settings.language = langPick
      lang = langPick
      saveAppConfig(config)
      log.success(t(lang, 'languageUpdated', { lang: langPick === 'en' ? 'English' : 'Indonesia' }))
    }
    // Timeout
    {
      const picked = await text({
        message: t(lang, 'timeoutPromptSettings'),
        initialValue: String(config.settings.timeout),
        validate: (v) => {
          const n = Number(v)
          if (!Number.isInteger(n) || n < 1 || n > 300) return t(lang, 'timeoutValidation')
          return undefined
        },
      })
      if (isCancel(picked)) return handleCancel(lang)
      config.settings.timeout = Number(picked)
      saveAppConfig(config)
      log.success(t(lang, 'timeoutUpdated', { sec: config.settings.timeout }))
    }
    // Numbering
    {
      const picked = await select({
        message: t(lang, 'numberingPrompt'),
        options: Object.keys(NUMBERING_STYLES).map((k) => {
          const label = NUMBERING_STYLES[k].label[lang]
          const preview = `${formatNumber(0, k)}model-a | ${formatNumber(1, k)}model-b | ${formatNumber(9, k)}model-j`
          return { value: k, label: `${k} — ${label} ${pc.dim(`(${preview})`)}` }
        }),
      })
      if (isCancel(picked)) return handleCancel(lang)
      config.settings.numbering = picked
      saveAppConfig(config)
      log.success(t(lang, 'numberingUpdated', { style: picked }))
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
          { value: 'back', label: pc.green(t(lang, 'settingsBack')) },
        ],
      })
      if (isCancel(choice)) return
      if (choice === 'back') break

      if (choice === 'language') {
        const langPick = await select({
          message: t(lang, 'languagePrompt'),
          options: [
            { value: 'en', label: t(lang, 'languageEn') },
            { value: 'id', label: t(lang, 'languageId') },
          ],
        })
        if (isCancel(langPick)) continue
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
        if (isCancel(newTimeout)) continue
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
        if (isCancel(numberingChoice)) continue
        config.settings.numbering = numberingChoice
        saveAppConfig(config)
        log.success(t(lang, 'numberingUpdated', { style: numberingChoice }))
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
      if (isCancel(picked)) return handleCancel(lang)
      provider = { ...config.providers[picked] }
    } else {
      provider = await addNewProvider(config, lang)
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

  // ---------- 3. Pilih model untuk dicek ----------
  const mode = await select({
    message: t(lang, 'selectModePrompt', { count: models.length }),
    options: [
      { value: 'all', label: t(lang, 'selectAll', { count: models.length }) },
      { value: 'custom', label: t(lang, 'selectCustom') },
    ],
  })
  if (isCancel(mode)) return handleCancel(lang)

  let toTest
  if (mode === 'all') {
    toTest = models
  } else {
    const selected = await multiselect({
      message: t(lang, 'selectModels'),
      options: models.map((m) => ({ value: m.id, label: m.id })),
      required: false,
      maxItems: 40,
    })
    if (isCancel(selected)) return handleCancel(lang)
    if (selected.length === 0) {
      log.warn(t(lang, 'noProvider'))
      continue appLoop
    }
    toTest = models.filter((m) => selected.includes(m.id))
  }
  if (toTest.length === 0) {
    log.warn(t(lang, 'noProvider'))
    continue appLoop
  }

  // ---------- 4. Tes akses (timeout from Settings) ----------
  const timeoutMs = config.settings.timeout * 1000
  const results = []
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

  // ---------- 5. Rekap hasil ----------
  const okModels = results
    .filter((r) => r.result.ok)
    .map((r) => ({ ...r.model, _testResult: r.result }))
  const deadModels = results.filter((r) => !r.result.ok && r.result.dead)
  const warnModels = results.filter((r) => !r.result.ok && !r.result.dead)

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

  if (okModels.length === 0) {
    log.error(t(lang, 'noWorkingModel'))
    // kembali ke menu utama tanpa menutup aplikasi
    continue appLoop
  }

  // ---------- 6. Skor otomatis ----------
  let ranked = sortByScore(attachScores(okModels))

  // tampilkan ranking awal (tanpa perlu enter, langsung beri nomor)
  {
    const lines = ranked.map((m, i) => `  ${i + 1}. ${m.id} ${pc.dim(t(lang, 'scoreLabel', { score: m._score }))}`).join('\n')
    log.message(`${pc.bold(t(lang, 'rankingTitle'))}\n${lines}`)
  }

  // ---------- 7. Edit manual ----------
  const editManual = await confirm({
    message: t(lang, 'editOrderConfirm'),
    initialValue: false,
  })
  if (isCancel(editManual)) return handleCancel(lang)

  if (editManual) {
    ranked = await manualReorder(ranked, lang, config.settings.numbering)
  }

  // ---------- 8. Konfigurasi output ----------
  log.message(pc.bold(t(lang, 'configSettingsTitle')))

  const markPaid = await confirm({
    message: t(lang, 'markPaidConfirm'),
    initialValue: true,
  })
  if (isCancel(markPaid)) return handleCancel(lang)

  let paidIds = []
  if (markPaid) {
    const paidSel = await multiselect({
      message: t(lang, 'selectPaid'),
      options: ranked.map((m) => ({
        value: m.id,
        label: m.id,
      })),
      required: false,
    })
    if (isCancel(paidSel)) return handleCancel(lang)
    paidIds = paidSel ?? []
  }

  const providerKey = await text({
    message: t(lang, 'providerKeyPrompt'),
    initialValue: provider.name,
    validate: (v) => (v && v.trim() ? undefined : t(lang, 'required')),
  })
  if (isCancel(providerKey)) return handleCancel(lang)

  // Nama pendek: tanya sekali, bukan per model
  const autoShort = await confirm({
    message: t(lang, 'autoShortConfirm'),
    initialValue: true,
  })
  if (isCancel(autoShort)) return handleCancel(lang)

  const shortNames = {}
  if (autoShort) {
    for (const m of ranked) {
      shortNames[m.id] = m.id.split('/').pop()
    }
  } else {
    for (const m of ranked) {
      const short = await text({
        message: t(lang, 'shortNamePrompt', { id: m.id }),
        initialValue: m.id.split('/').pop(),
      })
      if (isCancel(short)) return handleCancel(lang)
      shortNames[m.id] = (short ?? '').trim() || m.id
    }
  }

  const ordered = ranked.map((m) => ({ id: m.id, shortName: shortNames[m.id], vision: m.capabilities.vision }))

  const modelsBlock = buildModelsBlock(ordered, { paidIds, markPaid, numbering: config.settings.numbering })
  const providerBlock = {
    npm: '@ai-sdk/openai-compatible',
    name: provider.name,
    options: {
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
    },
    models: modelsBlock,
  }

  // ---------- 9. Preview & simpan ----------
  const { path: ocPath } = readOpencodeConfig(lang)
  log.info(t(lang, 'targetConfig', { path: ocPath }))

  log.message(pc.bold(t(lang, 'listToWrite')))
  ordered.forEach((m, i) => {
    const prefix = formatNumber(i, config.settings.numbering)
    const isPaid = paidIds.includes(m.id)
    const paidSuffix = markPaid && isPaid ? ' (PAID)' : ''
    log.message(`  ${pc.cyan(`${prefix}${m.shortName}${paidSuffix}`)}  ${pc.dim('← ' + m.id)}`)
  })

  const preview = JSON.stringify(providerBlock, null, 2)
  log.message(pc.bold(t(lang, 'previewBlock')))
  log.message(pc.dim(preview))

  const key = providerKey.trim()
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
  if (isCancel(save)) return handleCancel(lang)

    if (save) {
      writeOpencodeConfig(key, providerBlock, lang)
      outro(pc.green(t(lang, 'savedRestart')))
    } else {
      outro(pc.yellow(t(lang, 'saveCancelled')))
    }

    // ---------- Akhir proses: tanya apakah ingin mengulang ----------
    {
      const again = await confirm({
        message: `${t(lang, 'repeatPrompt')} ${pc.dim(`(${t(lang, 'repeatHint')})`)}`,
        initialValue: false,
      })
      if (isCancel(again)) return handleCancel(lang)
      if (again) {
        // tampilkan pemisah lalu kembali ke menu utama (appLoop)
        log.message(pc.dim('─'.repeat(40)))
        continue appLoop
      }
      break appLoop
    }
  }
}

async function addNewProvider(config, lang) {
  const baseURL = await text({
    message: t(lang, 'baseUrlPrompt'),
    placeholder: t(lang, 'baseUrlPlaceholder'),
    validate: (v) => (v && v.trim() ? undefined : t(lang, 'baseUrlRequired')),
  })
  if (isCancel(baseURL)) return handleCancel(lang)

  const apiKey = await password({
    message: t(lang, 'apiKeyPrompt'),
    validate: (v) => (v && v.trim() ? undefined : t(lang, 'apiKeyRequired')),
  })
  if (isCancel(apiKey)) return handleCancel(lang)

  const name = await text({
    message: t(lang, 'providerNamePrompt'),
    placeholder: t(lang, 'providerNamePlaceholder'),
    validate: (v) => (v && v.trim() ? undefined : t(lang, 'providerNameRequired')),
  })
  if (isCancel(name)) return handleCancel(lang)

  const provider = { name: name.trim(), baseURL: baseURL.trim(), apiKey: apiKey.trim() }
  upsertProvider(config, provider)
  saveAppConfig(config)
  return provider
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
    if (isCancel(pick)) return handleCancel(lang)
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
    if (isCancel(action)) return handleCancel(lang)

    if (action === 'back') continue

    if (action === 'rename') {
      const name = await text({
        message: t(lang, 'newName'),
        initialValue: config.providers[idx].name,
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'providerNameRequired')),
      })
      if (isCancel(name)) return handleCancel(lang)
      updateProvider(config, idx, { name: name.trim() })
      saveAppConfig(config)
      log.success(t(lang, 'renamedTo', { name: name.trim() }))
    } else if (action === 'url') {
      const url = await text({
        message: t(lang, 'newUrl'),
        initialValue: config.providers[idx].baseURL,
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'baseUrlRequired')),
      })
      if (isCancel(url)) return handleCancel(lang)
      updateProvider(config, idx, { baseURL: url.trim() })
      saveAppConfig(config)
      log.success(t(lang, 'urlUpdated'))
    } else if (action === 'apikey') {
      const key = await password({
        message: t(lang, 'newApiKey'),
        validate: (v) => (v && v.trim() ? undefined : t(lang, 'apiKeyRequired')),
      })
      if (isCancel(key)) return handleCancel(lang)
      updateProvider(config, idx, { apiKey: key.trim() })
      saveAppConfig(config)
      log.success(t(lang, 'apiKeyUpdated'))
    } else if (action === 'delete') {
      const ok = await confirm({
        message: t(lang, 'deleteConfirm', { name: config.providers[idx].name }),
        initialValue: false,
      })
      if (isCancel(ok)) return handleCancel(lang)
      if (ok) {
        deleteProvider(config, idx)
        saveAppConfig(config)
        log.success(t(lang, 'providerDeleted'))
      }
    }
    config = loadAppConfig()
  }
}

async function manualReorder(models, lang, numbering) {
  const list = [...models]
  while (true) {
    {
      const lines = list.map((m, i) => `  ${i + 1}. ${m.id} ${pc.dim(t(lang, 'scoreLabel', { score: m._score }))}`).join('\n')
      log.message(`${pc.bold(t(lang, 'currentOrder'))}\n${lines}`)
    }

    const action = await select({
      message: t(lang, 'pickToMove'),
      options: [
        ...list.map((m, i) => ({ value: `move:${i}`, label: t(lang, 'moveLabel', { id: m.id }) })),
        { value: 'done', label: pc.green(t(lang, 'doneContinue')) },
      ],
    })
    if (isCancel(action)) return handleCancel(lang)
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
    if (isCancel(target)) return handleCancel(lang)

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
