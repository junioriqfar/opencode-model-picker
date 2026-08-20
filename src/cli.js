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
import { loadAppConfig, saveAppConfig, upsertProvider } from './config.js'
import { listModels, testModel, sleep } from './provider.js'
import { attachScores, sortByScore } from './scoring.js'
import {
  buildModelsBlock,
  writeOpencodeConfig,
  readOpencodeConfig,
} from './opencode.js'
import { APP_NAME } from './utils.js'

async function main() {
  intro(pc.bold(pc.cyan(` ${APP_NAME} — ambil, tes & urutkan model untuk OpenCode`)))

  const config = loadAppConfig()

  // ---------- 1. Provider ----------
  const useExisting =
    config.providers.length > 0 &&
    (await confirm({
      message: `Gunakan provider tersimpan (${config.providers
        .map((p) => p.name)
        .join(', ')})?`,
      initialValue: true,
    }))
  if (isCancel(useExisting)) return handleCancel()

  let provider
  if (useExisting) {
    const names = config.providers.map((p, i) => ({
      value: i,
      label: `${p.name} — ${p.baseURL}`,
    }))
    const picked = await select({
      message: 'Pilih provider:',
      options: names,
    })
    if (isCancel(picked)) return handleCancel()
    provider = { ...config.providers[picked] }
  } else {
    const baseURL = await text({
      message: 'Base URL provider (mis. https://9router.penjualanku.web.id/v1):',
      placeholder: 'https://...',
      validate: (v) => (v && v.trim() ? undefined : 'Base URL wajib diisi'),
    })
    if (isCancel(baseURL)) return handleCancel()

    const apiKey = await password({
      message: 'API key provider:',
      validate: (v) => (v && v.trim() ? undefined : 'API key wajib diisi'),
    })
    if (isCancel(apiKey)) return handleCancel()

    const name = await text({
      message: 'Nama provider untuk opencode (mis. 9Router, DeepSeek, MyAPI):',
      placeholder: '9Router',
      validate: (v) => (v && v.trim() ? undefined : 'Nama wajib diisi'),
    })
    if (isCancel(name)) return handleCancel()

    provider = { name: name.trim(), baseURL: baseURL.trim(), apiKey: apiKey.trim() }
    upsertProvider(config, provider)
    saveAppConfig(config)
  }

  // ---------- 2. Ambil model ----------
  const s = spinner()
  s.start('Mengambil daftar model...')
  let models
  try {
    models = await listModels({ baseURL: provider.baseURL, apiKey: provider.apiKey })
    s.stop(`Ditemukan ${models.length} model.`)
  } catch (err) {
    s.stop('Gagal mengambil model.')
    cancel(err.message)
    return
  }

  // ---------- 3. Pilih model untuk dicek ----------
  const selected = await multiselect({
    message: 'Pilih model yang akan dicek (spasi untuk pilih, enter untuk lanjut):',
    options: models.map((m) => ({ value: m.id, label: m.id })),
    required: false,
    maxItems: 40,
  })
  if (isCancel(selected)) return handleCancel()

  const toTest = selected.length > 0 ? models.filter((m) => selected.includes(m.id)) : models
  if (toTest.length === 0) {
    cancel('Tidak ada model dipilih.')
    return
  }

  // ---------- 3b. Pengaturan tes ----------
  const timeoutSec = await text({
    message: 'Timeout per model (detik):',
    initialValue: '15',
    validate: (v) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > 300)
        return 'Masukkan angka bulat antara 1-300'
      return undefined
    },
  })
  if (isCancel(timeoutSec)) return handleCancel()
  const timeoutMs = Number(timeoutSec) * 1000

  // ---------- 4. Tes akses ----------
  const results = []
  s.start('Mengecek akses model (mungkin butuh beberapa saat)...')
  for (let i = 0; i < toTest.length; i++) {
    const m = toTest[i]
    const r = await testModel({
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      model: m.id,
      timeoutMs,
    })
    results.push({ model: m, result: r })
    if (r.ok) s.message(`${m.id} ${pc.green('✓')}`)
    else s.message(`${m.id} ${pc.red('✗')} — ${r.message ?? 'Error tak dikenal'}`)
    if (i < toTest.length - 1) await sleep(500)
  }
  s.stop('Pengecekan selesai.')

  // ---------- 5. Rekap hasil ----------
  const okModels = results
    .filter((r) => r.result.ok)
    .map((r) => ({ ...r.model, _testResult: r.result }))
  const deadModels = results.filter((r) => !r.result.ok && r.result.dead)
  const warnModels = results.filter((r) => !r.result.ok && !r.result.dead)

  log.info(
    `${pc.green(`✓ ${okModels.length} berfungsi`)}  ${pc.red(
      `✗ ${deadModels.length} mati/EOL/tidak ada`,
    )}  ${pc.yellow(`! ${warnModels.length} gagal sementara (timeout/rate-limit)`)}`,
  )

  if (warnModels.length > 0) {
    log.warn(
      warnModels
        .map((r) => `  ! ${r.model.id} — ${r.result.message ?? 'Error tak dikenal'}`)
        .join('\n'),
    )
  }
  if (deadModels.length > 0) {
    log.error(
      deadModels
        .map((r) => `  ✗ ${r.model.id} — ${r.result.message ?? 'Error tak dikenal'}`)
        .join('\n'),
    )
  }

  if (okModels.length === 0) {
    cancel('Tidak ada model yang berfungsi. Periksa baseURL/apiKey atau coba model lain.')
    return
  }

  // ---------- 6. Skor otomatis ----------
  let ranked = sortByScore(attachScores(okModels))

  // tampilkan ranking awal
  log.message(pc.bold('Ranking awal (skor otomatis):'))
  ranked.forEach((m, i) => {
    log.message(`  ${String(i + 1).padStart(2, '0')}. ${m.id} ${pc.dim(`(skor ${m._score})`)}`)
  })

  // ---------- 7. Edit manual ----------
  const editManual = await confirm({
    message: 'Edit urutan secara manual?',
    initialValue: false,
  })
  if (isCancel(editManual)) return handleCancel()

  if (editManual) {
    ranked = await manualReorder(ranked)
  }

  // ---------- 8. Konfigurasi output ----------
  log.message(pc.bold('Pengaturan konfigurasi:'))

  const markPaid = await confirm({
    message: 'Tandai model berbayar dengan label (PAID)?',
    initialValue: true,
  })
  if (isCancel(markPaid)) return handleCancel()

  let paidIds = []
  if (markPaid) {
    const paidSel = await multiselect({
      message: 'Pilih model yang PAID (spasi untuk pilih):',
      options: ranked.map((m) => ({
        value: m.id,
        label: m.id,
      })),
      required: false,
    })
    if (isCancel(paidSel)) return handleCancel()
    paidIds = paidSel ?? []
  }

  const providerKey = await text({
    message: 'Key provider di opencode (mis. 9Router, DeepSeek):',
    initialValue: provider.name,
    validate: (v) => (v && v.trim() ? undefined : 'Wajib diisi'),
  })
  if (isCancel(providerKey)) return handleCancel()

  // Nama pendek: tanya sekali, bukan per model
  const autoShort = await confirm({
    message: 'Gunakan nama pendek otomatis (ambil bagian terakhir ID, mis. minimax-m3)?',
    initialValue: true,
  })
  if (isCancel(autoShort)) return handleCancel()

  const shortNames = {}
  if (autoShort) {
    for (const m of ranked) {
      shortNames[m.id] = m.id.split('/').pop()
    }
  } else {
    for (const m of ranked) {
      const short = await text({
        message: `Nama pendek untuk "${m.id}" (kosongkan untuk memakai ID asli):`,
        initialValue: m.id.split('/').pop(),
      })
      if (isCancel(short)) return handleCancel()
      shortNames[m.id] = (short ?? '').trim() || m.id
    }
  }

  const ordered = ranked.map((m) => ({ id: m.id, shortName: shortNames[m.id], vision: m.capabilities.vision }))

  const modelsBlock = buildModelsBlock(ordered, { paidIds, markPaid })
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
  const { path: ocPath } = readOpencodeConfig()
  log.info(`Target config: ${ocPath}`)

  log.message(pc.bold('Daftar nama yang akan ditulis:'))
  ordered.forEach((m, i) => {
    const number = String(i + 1).padStart(2, '0')
    const isPaid = paidIds.includes(m.id)
    const paidSuffix = markPaid && isPaid ? ' (PAID)' : ''
    log.message(`  ${pc.cyan(`${number}. ${m.shortName}${paidSuffix}`)}  ${pc.dim('← ' + m.id)}`)
  })

  const preview = JSON.stringify(providerBlock, null, 2)
  log.message(pc.bold('Preview blok provider yang akan ditulis:'))
  log.message(pc.dim(preview))

  const save = await confirm({
    message: 'Simpan ke konfigurasi opencode?',
    initialValue: true,
  })
  if (isCancel(save)) return handleCancel()

  if (save) {
    writeOpencodeConfig(providerKey.trim(), providerBlock)
    outro(
      pc.green(
        `Tersimpan! Restart opencode, lalu pilih model via /models.`,
      ),
    )
  } else {
    outro(pc.yellow('Batal disimpan.'))
  }
}

async function manualReorder(models) {
  const list = [...models]
  while (true) {
    log.message(pc.bold('Urutan saat ini:'))
    list.forEach((m, i) => {
      log.message(
        `  ${String(i + 1).padStart(2, '0')}. ${m.id} ${pc.dim(`(skor ${m._score})`)}`,
      )
    })

    const action = await select({
      message: 'Pilih model yang ingin dipindahkan (atau selesai):',
      options: [
        ...list.map((m, i) => ({ value: `move:${i}`, label: `Pindah: ${m.id}` })),
        { value: 'done', label: pc.green('Selesai — lanjut') },
      ],
    })
    if (isCancel(action)) return handleCancel()
    if (action === 'done') break

    const idx = Number(action.split(':')[1])
    const target = await text({
      message: `Pindah "${list[idx].id}" ke posisi berapa? (1-${list.length})`,
      validate: (v) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1 || n > list.length)
          return `Masukkan angka 1-${list.length}`
        return undefined
      },
    })
    if (isCancel(target)) return handleCancel()

    const pos = Number(target) - 1
    const [item] = list.splice(idx, 1)
    list.splice(pos, 0, item)
  }
  return list
}

function handleCancel() {
  cancel('Dibatalkan.')
  process.exit(0)
}

main().catch((err) => {
  cancel(err.message ?? 'Terjadi kesalahan')
  process.exit(1)
})
