# opencode-model-picker

<p align="center">
  <a href="./README.md">🇬🇧 English</a> | <a href="./README.id.md">🇮🇩 Indonesia</a>
</p>

Ambil daftar model dari provider OpenAI-compatible (mis. 9Router), cek aksesibilitasnya, urutkan berdasarkan kemampuan coding, lalu simpan ke konfigurasi OpenCode.

Cross-platform: macOS, Windows, Linux.

## Instalasi

```bash
cd opencode-model-picker
npm install
```

## Cara pakai

```bash
npm start
# atau
node src/cli.js
```

## Build executable (Windows, macOS, Linux)

Menggunakan [@yao-pkg/pkg](https://github.com/yao-pkg/pkg) — menghasilkan satu file executable tanpa perlu Node.js terpasang di mesin target.

```bash
npm run build         # build semua (macOS x64, Windows x64, Linux x64)
npm run build:macos   # hanya macOS x64
npm run build:win     # hanya Windows x64 (.exe)
npm run build:linux   # hanya Linux x64
```

Hasil di folder `dist/`:

```
dist/
├── opencode-model-picker-macos-x64
├── opencode-model-picker-win-x64.exe
└── opencode-model-picker-linux-x64
```

Catatan arm64:
- Build **macOS arm64 (Apple Silicon)** memerlukan mesin Apple Silicon (atau Rosetta terpasang) karena pkg menjalankan binary target untuk verifikasi: `npm run build:macos:arm64`.
- Komputer Intel (x64) hanya bisa menghasilkan binary x64 untuk macOS/Windows/Linux.

## Pengaturan Awal

Saat tidak ada file konfigurasi (`~/.config/opencode-model-picker/config.json` belum ada), aplikasi menampilkan **wizard pengaturan awal** dan meminta semua setting berurutan:
1. **Bahasa** — `English` / `Indonesia`
2. **Timeout default** — 1–300 detik
3. **Gaya penomoran** — `01.` / `1.` / `001.` / `01 -` / `none`

Semua pengaturan langsung disimpan dan dipakai untuk sesi saat itu.

## Alur

1. **Aksi awal** — pilih antara *Gunakan provider tersimpan*, *Kelola provider tersimpan* (ubah nama/base URL/API key, hapus — opsi paling bawah adalah **Kembali** hijau), *Tambah provider baru*, *Pengaturan*, atau *Keluar*.
2. **Ambil model** — aplikasi memanggil `GET {baseURL}/v1/models`. Jika gagal, error ditampilkan dan kembali ke menu utama (tidak menutup aplikasi).
3. **Pilih model** — setelah daftar ditemukan, pilih **Pilih semua (X model)** untuk tes semua model, atau **Custom** untuk memilih model tertentu via multiselect (spasi untuk pilih, enter untuk lanjut). Jika Custom tanpa pilihan, kembali ke menu utama.
4. **Tes akses** — setiap model diuji dengan request kecil menggunakan timeout dari **Pengaturan → Timeout default** (awal **15 detik**, bisa diubah 1–300 detik, tersimpan di settings). Spinner tetap satu baris per model (`model-id ✓/✗ — pesan singkat`), disanitasi ke satu baris dan dipotong (menangani bungkusan OpenRouter `Provider returned error` dengan mengekstrak pesan inner). Rate-limit dicoba ulang sekali otomatis. Terdapat jeda 500ms antar model untuk mengurangi burst rate-limit.
5. **Rekap** — menampilkan `✓ X berfungsi  ✗ Y mati/EOL/tidak ada  ! Z gagal sementara` dan daftar tiap model mati/warn di baris tunggal. Jika **0 berfungsi**, tampilkan `Tidak ada model yang berfungsi...` dan kembali ke menu utama, bukan keluar.
6. **Skor otomatis** — model yang berfungsi diurutkan berdasarkan skor kemampuan coding (reasoning, tools, konteks, heuristik nama). Ranking ditampilkan sebagai satu blok non-interaktif bernomor, tanpa perlu enter:
   ```
   Ranking awal (skor otomatis):
     1. nvidia/minimaxai/minimax-m3 (skor 85)
     2. gemini/gemini-3-flash-preview (skor 80)
   ```
7. **Edit manual** — opsional urutkan ulang via `Pilih model yang ingin dipindahkan → Pindah ke posisi (1-N)`. Urutan saat ini juga tampil sebagai `1. id (skor 85)` dalam satu blok.
8. **Nama tampilan** — pilih nama pendek otomatis (ambil bagian terakhir ID) atau isi manual per model. Nomor urut dibuat otomatis dari posisi menggunakan **Pengaturan → Gaya penomoran** (mis. `01.`, `1.`, `001.`, `01 -`, atau `tanpa nomor`).
9. **Preview** — daftar nama + blok konfigurasi ditampilkan untuk dicek sebelum disimpan.
10. **Simpan** — tulis ke `~/.config/opencode/opencode.jsonc` (macOS/Linux) atau `%APPDATA%\opencode\` (Windows), dengan merge aman yang mempertahankan konfigurasi lain. Jika nama provider **sudah ada**, aplikasi memberi peringatan bahwa semua model lama di provider tersebut akan dihapus dan diganti dengan daftar saat ini.
11. **Ulang** — setelah simpan/batal, aplikasi bertanya **Apakah ingin mengulang?** (`Jika ya, akan kembali ke menu utama.`). Jika **Ya**, loop kembali ke *Aksi awal*; jika **Tidak**, keluar.

## Pengaturan

Tersedia di menu utama → **Pengaturan** (tombol **Kembali** sengaja hijau):

- **Bahasa** — ganti antara `English` dan `Indonesia`. Semua prompt, pesan, dan error mengikuti bahasa yang dipilih.
- **Timeout default** — timeout per model dalam detik (1–300) yang dipakai saat pengetesan. Tidak ada prompt per-run; ubah di Pengaturan.
- **Gaya penomoran** — bagaimana nama model diberi prefix di OpenCode:
  - `01.` → `01. model`, `02. model` (2 digit, default)
  - `1.` → `1. model`, `2. model`
  - `001.` → `001. model`, `002. model` (3 digit)
  - `01 -` → `01 - model`, `02 - model`
  - `none` → `model` (tanpa prefix)

Pengaturan disimpan di `~/.config/opencode-model-picker/config.json` bersama provider tersimpan dan mendukung migrasi dari config lama.

## Struktur

```
src/
├── cli.js        # alur interaktif (@clack/prompts) + i18n + pengaturan + outer loop (tidak auto-close) + spinner satu baris
├── i18n.js       # terjemahan (en/id) + gaya penomoran
├── provider.js   # GET /v1/models + test /v1/chat/completions + sanitasi satu baris + ekstrak inner error OpenRouter
├── scoring.js    # skor otomatis kemampuan coding
├── config.js     # simpan/muat config aplikasi (~/.config/opencode-model-picker/) + settings (language/timeout/numbering)
├── opencode.js   # merge aman ke opencode.jsonc (mendukung penomoran)
└── utils.js      # path cross-platform, parser JSONC
```

## Catatan

- Config aplikasi (provider tersimpan + pengaturan) disimpan di `~/.config/opencode-model-picker/config.json` (API key plain text — jaga file ini).
- Spinner tes dipaksa satu baris per model (newline diringkas, dipotong 80 char) agar tidak spam terminal pada error verbose (mis. `openrouter/google/lyria-3-pro-preview`).
- Jika tidak ada model yang berfungsi atau fetch gagal, aplikasi kembali ke menu utama, bukan keluar.
- Setelah menulis ke opencode, **restart opencode** lalu pilih model via `/models`.
