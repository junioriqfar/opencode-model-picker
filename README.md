# opencode-model-picker

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

## Alur

1. **Provider** — pilih provider tersimpan atau masukkan `baseURL` + `apiKey` baru.
2. **Ambil model** — aplikasi memanggil `GET {baseURL}/v1/models`.
3. **Pilih model** — tandai model yang ingin dicek (bisa semua).
4. **Atur timeout** — batas waktu menunggu response tiap model, default **15 detik** (bisa diubah 1–300 detik).
5. **Tes akses** — setiap model diuji dengan request kecil. Model yang mati (410 end-of-life, 404 tidak ditemukan, timeout, rate-limit, respons HTML) dideteksi otomatis; rate-limit dicoba ulang sekali otomatis. Terdapat jeda 500ms antar model untuk mengurangi burst rate-limit (terpisah dari pengaturan timeout).
6. **Skor otomatis** — model yang berfungsi diurutkan berdasarkan skor kemampuan coding (reasoning, tools, konteks, heuristik nama).
7. **Edit manual** — ubah urutan sesuai keinginan.
8. **Nama tampilan** — pilih nama pendek otomatis (ambil bagian terakhir ID) atau isi manual per model. Nomor urut dibuat otomatis dari posisi (`01.`, `02.`, ...).
9. **Preview** — daftar nama + blok konfigurasi ditampilkan untuk dicek sebelum disimpan.
10. **Simpan** — tulis ke `~/.config/opencode/opencode.jsonc` (macOS/Linux) atau `%APPDATA%\opencode\` (Windows), dengan merge aman yang mempertahankan konfigurasi lain.

## Struktur

```
src/
├── cli.js        # alur interaktif (@clack/prompts)
├── provider.js   # GET /v1/models + test /v1/chat/completions
├── scoring.js    # skor otomatis kemampuan coding
├── config.js     # simpan/muat config aplikasi (~/.config/opencode-model-picker/)
├── opencode.js   # merge aman ke opencode.jsonc
└── utils.js      # path cross-platform, parser JSONC
```

## Catatan

- Config aplikasi (provider tersimpan) disimpan di `~/.config/opencode-model-picker/config.json` (API key plain text — jaga file ini).
- Setelah menulis ke opencode, **restart opencode** lalu pilih model via `/models`.
