export const SUPPORTED_LANGUAGES = ['en', 'id']
export const DEFAULT_LANGUAGE = 'en'

export const NUMBERING_STYLES = {
  '01.': { label: { en: '01. name (padded 2 digits)', id: '01. nama (2 digit)' }, format: (i) => `${String(i + 1).padStart(2, '0')}. ` },
  '1.': { label: { en: '1. name (no padding)', id: '1. nama (tanpa padding)' }, format: (i) => `${i + 1}. ` },
  '001.': { label: { en: '001. name (padded 3 digits)', id: '001. nama (3 digit)' }, format: (i) => `${String(i + 1).padStart(3, '0')}. ` },
  '01 -': { label: { en: '01 - name (dash separator)', id: '01 - nama (pemisah dash)' }, format: (i) => `${String(i + 1).padStart(2, '0')} - ` },
  'none': { label: { en: 'No numbering', id: 'Tanpa nomor' }, format: () => '' },
}

export function formatNumber(index, style = '01.') {
  const s = NUMBERING_STYLES[style] ?? NUMBERING_STYLES['01.']
  return s.format(index)
}

export const translations = {
  en: {
    // intro / outro
    intro: 'fetch, test & rank models for OpenCode',
    outroDone: 'Done.',
    cancelled: 'Cancelled.',
    errorOccurred: 'An error occurred',
    savedRestart: 'Saved! Restart opencode, then select model via /models.',
    saveCancelled: 'Save cancelled.',

    // main menu
    actionUse: 'Use saved provider',
    actionManage: 'Manage saved providers',
    actionNew: 'Add new provider',
    actionSettings: 'Settings',
    actionExit: 'Exit',
    chooseAction: 'Choose action:',
    chooseProvider: 'Choose provider:',
    noProvider: 'No models selected.',

    // fetch
    fetchingModels: 'Fetching model list...',
    foundModels: 'Found {count} models.',
    failedFetch: 'Failed to fetch models.',

    // select models
    selectModePrompt: 'Found {count} models. How do you want to select?',
    selectAll: 'Select all ({count} models)',
    selectCustom: 'Custom selection',
    selectModels: 'Select models to test (space to select, enter to continue):',
    timeoutPrompt: 'Timeout per model (seconds):',
    timeoutValidation: 'Enter an integer between 1-300',
    checkingModels: 'Testing model access (this may take a while)...',
    checkDone: 'Check complete.',

    // recap
    recapOk: '✓ {count} working',
    recapDead: '✗ {count} dead/EOL/not found',
    recapWarn: '! {count} temporary failure (timeout/rate-limit)',
    noWorkingModel: 'No working models. Check baseURL/apiKey or try other models.',
    rankingTitle: 'Initial ranking (auto score):',
    scoreLabel: '(score {score})',
    editOrderConfirm: 'Edit order manually?',
    configSettingsTitle: 'Configuration settings:',

    // paid
    markPaidConfirm: 'Mark paid models with (PAID) label?',
    selectPaid: 'Select PAID models (space to select):',

    // provider key / short name
    providerKeyPrompt: 'Provider key in opencode (e.g. 9Router, DeepSeek):',
    required: 'Required',
    autoShortConfirm: 'Use auto short name (take last segment of ID, e.g. minimax-m3)?',
    shortNamePrompt: 'Short name for "{id}" (leave empty to use original ID):',

    // preview & save
    targetConfig: 'Target config: {path}',
    listToWrite: 'Names to be written:',
    previewBlock: 'Preview provider block to be written:',
    providerExistsWarn: 'Provider "{key}" already exists in opencode.jsonc. Saving will DELETE all existing models for that provider and replace them with the current list.',
    replaceConfirm: 'Replace provider "{key}" (delete {oldCount} old models) and write {newCount} new models?',
    saveConfirm: 'Save to opencode config?',

    // add provider
    baseUrlPrompt: 'Provider base URL (e.g. https://9router.com/v1):',
    baseUrlPlaceholder: 'https://...',
    baseUrlRequired: 'Base URL is required',
    apiKeyPrompt: 'Provider API key:',
    apiKeyRequired: 'API key is required',
    providerNamePrompt: 'Provider name for opencode (e.g. 9Router, DeepSeek, MyAPI):',
    providerNamePlaceholder: '9Router',
    providerNameRequired: 'Name is required',

    // manage providers
    managePick: 'Select provider to manage:',
    manageDone: 'Done',
    manageFor: 'Manage "{name}":',
    rename: 'Edit name',
    editUrl: 'Edit base URL',
    editApiKey: 'Edit API key',
    deleteProvider: 'Delete provider',
    back: 'Back',
    newName: 'New name:',
    renamedTo: 'Name changed to "{name}"',
    newUrl: 'New base URL:',
    urlUpdated: 'Base URL updated',
    newApiKey: 'New API key:',
    apiKeyUpdated: 'API key updated',
    deleteConfirm: 'Delete provider "{name}"?',
    providerDeleted: 'Provider deleted',

    // manual reorder
    currentOrder: 'Current order:',
    pickToMove: 'Select model to move (or done):',
    moveLabel: 'Move: {id}',
    doneContinue: 'Done — continue',
    moveToPosition: 'Move "{id}" to position (1-{len}):',
    positionValidation: 'Enter a number 1-{len}',

    // settings
    settingsTitle: 'Settings',
    settingsLanguage: 'Language',
    settingsTimeout: 'Default timeout',
    settingsNumbering: 'Numbering style',
    settingsBack: 'Back',
    languagePrompt: 'Select language:',
    languageEn: 'English',
    languageId: 'Indonesia',
    languageUpdated: 'Language set to {lang}',
    timeoutPromptSettings: 'Default timeout per model (1-300 seconds):',
    timeoutUpdated: 'Default timeout set to {sec} seconds',
    numberingPrompt: 'Select numbering style:',
    numberingUpdated: 'Numbering style set to "{style}"',
    numberingPreview: 'Preview: {preview}',
    pressEnterToContinue: 'Press enter to continue',
    firstRunTitle: 'First run — initial setup',
    firstRunDesc: 'No config file found. Please configure initial settings first.',
    repeatPrompt: 'Do you want to run again?',
    repeatHint: 'If yes, you will return to the main menu.',

    // provider errors
    errFetchModels: 'Failed to fetch model list (HTTP {status}): {body}',
    errModelFormat: 'Unrecognized /v1/models response format (data is not an array)',
    errHtmlResponse: 'Server returned an HTML page (not API JSON)',
    errTimeout: 'Timeout after {sec} seconds',
    errNetwork: 'Network error: {msg}',
    errEol: 'End-of-life / no longer available',
    errNotFound: 'Model not found',
    errAuth: 'Invalid API key / no access',
    errRateLimit: 'Rate limited (temporary)',
    errParseConfig: 'Failed to parse {path}: {msg}\nPlease fix the file first.',
    errUnknown: 'Unknown error',
  },
  id: {
    intro: 'ambil, tes & urutkan model untuk OpenCode',
    outroDone: 'Selesai.',
    cancelled: 'Dibatalkan.',
    errorOccurred: 'Terjadi kesalahan',
    savedRestart: 'Tersimpan! Restart opencode, lalu pilih model via /models.',
    saveCancelled: 'Batal disimpan.',

    actionUse: 'Gunakan provider tersimpan',
    actionManage: 'Kelola provider tersimpan',
    actionNew: 'Tambah provider baru',
    actionSettings: 'Pengaturan',
    actionExit: 'Keluar',
    chooseAction: 'Pilih aksi:',
    chooseProvider: 'Pilih provider:',
    noProvider: 'Tidak ada model dipilih.',

    fetchingModels: 'Mengambil daftar model...',
    foundModels: 'Ditemukan {count} model.',
    failedFetch: 'Gagal mengambil model.',

    selectModePrompt: 'Ditemukan {count} model. Bagaimana ingin memilih?',
    selectAll: 'Pilih semua ({count} model)',
    selectCustom: 'Pilih custom',
    selectModels: 'Pilih model yang akan dicek (spasi untuk pilih, enter untuk lanjut):',
    timeoutPrompt: 'Timeout per model (detik):',
    timeoutValidation: 'Masukkan angka bulat antara 1-300',
    checkingModels: 'Mengecek akses model (mungkin butuh beberapa saat)...',
    checkDone: 'Pengecekan selesai.',

    recapOk: '✓ {count} berfungsi',
    recapDead: '✗ {count} mati/EOL/tidak ada',
    recapWarn: '! {count} gagal sementara (timeout/rate-limit)',
    noWorkingModel: 'Tidak ada model yang berfungsi. Periksa baseURL/apiKey atau coba model lain.',
    rankingTitle: 'Ranking awal (skor otomatis):',
    scoreLabel: '(skor {score})',
    editOrderConfirm: 'Edit urutan secara manual?',
    configSettingsTitle: 'Pengaturan konfigurasi:',

    markPaidConfirm: 'Tandai model berbayar dengan label (PAID)?',
    selectPaid: 'Pilih model yang PAID (spasi untuk pilih):',

    providerKeyPrompt: 'Key provider di opencode (mis. 9Router, DeepSeek):',
    required: 'Wajib diisi',
    autoShortConfirm: 'Gunakan nama pendek otomatis (ambil bagian terakhir ID, mis. minimax-m3)?',
    shortNamePrompt: 'Nama pendek untuk "{id}" (kosongkan untuk memakai ID asli):',

    targetConfig: 'Target config: {path}',
    listToWrite: 'Daftar nama yang akan ditulis:',
    previewBlock: 'Preview blok provider yang akan ditulis:',
    providerExistsWarn: 'Provider "{key}" sudah ada di opencode.jsonc. Menyimpan akan MENGHAPUS semua model yang ada di provider tersebut dan menggantinya dengan daftar saat ini.',
    replaceConfirm: 'Ganti provider "{key}" (hapus {oldCount} model lama) dan tulis {newCount} model baru?',
    saveConfirm: 'Simpan ke konfigurasi opencode?',

    baseUrlPrompt: 'Base URL provider (mis. https://9router.com/v1):',
    baseUrlPlaceholder: 'https://...',
    baseUrlRequired: 'Base URL wajib diisi',
    apiKeyPrompt: 'API key provider:',
    apiKeyRequired: 'API key wajib diisi',
    providerNamePrompt: 'Nama provider untuk opencode (mis. 9Router, DeepSeek, MyAPI):',
    providerNamePlaceholder: '9Router',
    providerNameRequired: 'Nama wajib diisi',

    managePick: 'Pilih provider untuk dikelola:',
    manageDone: 'Selesai',
    manageFor: 'Kelola "{name}":',
    rename: 'Ubah nama',
    editUrl: 'Ubah base URL',
    editApiKey: 'Ubah API key',
    deleteProvider: 'Hapus provider',
    back: 'Kembali',
    newName: 'Nama baru:',
    renamedTo: 'Nama diubah menjadi "{name}"',
    newUrl: 'Base URL baru:',
    urlUpdated: 'Base URL diperbarui',
    newApiKey: 'API key baru:',
    apiKeyUpdated: 'API key diperbarui',
    deleteConfirm: 'Hapus provider "{name}"?',
    providerDeleted: 'Provider dihapus',

    currentOrder: 'Urutan saat ini:',
    pickToMove: 'Pilih model yang ingin dipindahkan (atau selesai):',
    moveLabel: 'Pindah: {id}',
    doneContinue: 'Selesai — lanjut',
    moveToPosition: 'Pindah "{id}" ke posisi berapa? (1-{len}):',
    positionValidation: 'Masukkan angka 1-{len}',

    settingsTitle: 'Pengaturan',
    settingsLanguage: 'Bahasa',
    settingsTimeout: 'Timeout default',
    settingsNumbering: 'Gaya penomoran',
    settingsBack: 'Kembali',
    languagePrompt: 'Pilih bahasa:',
    languageEn: 'English',
    languageId: 'Indonesia',
    languageUpdated: 'Bahasa diubah menjadi {lang}',
    timeoutPromptSettings: 'Timeout default per model (1-300 detik):',
    timeoutUpdated: 'Timeout default diubah menjadi {sec} detik',
    numberingPrompt: 'Pilih gaya penomoran:',
    numberingUpdated: 'Gaya penomoran diubah menjadi "{style}"',
    numberingPreview: 'Preview: {preview}',
    pressEnterToContinue: 'Tekan enter untuk lanjut',
    firstRunTitle: 'Pengaturan awal — konfigurasi pertama',
    firstRunDesc: 'Tidak ada file konfigurasi ditemukan. Silakan atur pengaturan awal terlebih dahulu.',
    repeatPrompt: 'Apakah ingin mengulang?',
    repeatHint: 'Jika ya, akan kembali ke menu utama.',

    errFetchModels: 'Gagal mengambil daftar model (HTTP {status}): {body}',
    errModelFormat: 'Format respons /v1/models tidak dikenali (bukan array data)',
    errHtmlResponse: 'Server mengembalikan halaman HTML (bukan API JSON)',
    errTimeout: 'Timeout setelah {sec} detik',
    errNetwork: 'Network error: {msg}',
    errEol: 'End-of-life / tidak tersedia lagi',
    errNotFound: 'Model tidak ditemukan',
    errAuth: 'API key tidak valid / tidak punya akses',
    errRateLimit: 'Rate limited (sementara)',
    errParseConfig: 'Gagal memparsing {path}: {msg}\nPerbaiki file tersebut terlebih dahulu.',
    errUnknown: 'Error tak dikenal',
  },
}

export function t(lang, key, params = {}) {
  const dict = translations[lang] ?? translations[DEFAULT_LANGUAGE]
  let str = dict[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key
  for (const [k, v] of Object.entries(params)) {
    str = str.replaceAll(`{${k}}`, String(v))
  }
  return str
}

export function getTranslator(lang) {
  return (key, params) => t(lang, key, params)
}
