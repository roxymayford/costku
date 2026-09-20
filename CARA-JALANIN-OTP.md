# Cara Menjalankan OTP — FATrack / Kontor

Panduan langkah demi langkah untuk mencoba alur registrasi + verifikasi OTP,
dari kondisi paling sederhana (tanpa setup apa pun) sampai siap produksi.

---

## 0. Ringkas: alur yang akan Anda lihat

```
[Frontend]  /auth  (mode Register)
     │  user isi nama + email + password
     ▼
POST /api/v1/auth/register
     │  backend buat user (status PENDING_VERIFICATION)
     │  backend generate kode OTP 6 digit, simpan hash-nya
     │  backend kirim kode (email atau console)
     ▼
[Frontend]  redirect ke  /verify-otp
     │  simpan { userId, email, expiresAt } di sessionStorage
     ▼
POST /api/v1/auth/register/verify-otp
     │  kode benar  → status ACTIVE + accessToken + refreshToken
     ▼
[Frontend]  redirect ke  /onboarding
```

**Endpoint penting**

| Method | Path | Fungsi |
|--------|------|--------|
| `GET`  | `/api/health` | Cek server hidup + konfigurasi OTP aktif |
| `POST` | `/api/v1/auth/register` | Daftar + kirim OTP |
| `POST` | `/api/v1/auth/register/verify-otp` | Verifikasi kode |
| `POST` | `/api/v1/auth/register/resend-otp` | Kirim ulang (cooldown 60 detik) |
| `GET`  | `/api/v1/auth/register/status/:userId` | Cek status akun |
| `GET`  | `/api/v1/auth/otp/diagnostics` | Lihat mode storage & delivery |

> Catatan: router juga ter-mount di `/api/auth/...`, jadi kedua prefix itu valid.

---

## 1. Jalankan paling cepat (mode console, tanpa setup)

Cocok untuk mencoba alurnya sekarang juga. **Kode OTP tidak dikirim ke email —
hanya dicetak di terminal backend.**

### Langkah

**Terminal 1 — backend**
```bash
cd "C:/Users/SANRIO/Downloads/Finace Advisor/backend"
npm install          # pertama kali saja
npm run dev
```

**Terminal 2 — frontend**
```bash
cd "C:/Users/SANRIO/Downloads/Finace Advisor/frontend"
npm install          # pertama kali saja
npm run dev          # jalan di http://localhost:5173
```

Dari root project bisa juga:
```bash
npm run dev:backend     # terminal 1
npm run dev:frontend    # terminal 2
```

**Buka browser** → `http://localhost:5173/auth` → pilih mode **Register** →
isi data → Anda akan diarahkan ke `/verify-otp`.

**Ambil kodenya dari terminal backend.** Kode dicetak dalam kotak seperti ini:

```
┌──────────────────────────────────────────────────────────────
│  OTP DEV DELIVERY (tidak dikirim ke pengguna)
│  channel     : EMAIL
│  destination : budi@example.com
│  message     : Kode verifikasi Anda: 481920. Berlaku 5 menit.
│  expires in  : 5 menit
└──────────────────────────────────────────────────────────────
```

Ketik `481920` di halaman verify-OTP. Selesai.

### Mau kode yang tetap (tidak berubah tiap kali)?

Buka `backend/.env`, hapus tanda `#` pada baris ini:

```env
OTP_DEV_FIXED_CODE=123456
```

Restart backend. Sekarang kodenya **selalu `123456`** selama `NODE_ENV` bukan
`production`. Sangat memudahkan saat testing berulang.

---

## 2. Kirim OTP ke email sungguhan (SMTP)

Tambahkan kredensial SMTP ke `backend/.env` lalu restart backend:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=emailanda@gmail.com
SMTP_PASS=app-password-16-digit
OTP_EMAIL_FROM=no-reply@fatrack.id
OTP_EMAIL_FROM_NAME=FATrack
```

`isSmtpConfigured()` butuh **ketiganya**: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`.
Kalau salah satu kosong, sistem otomatis kembali ke mode console.

### Pakai Gmail

`SMTP_PASS` **bukan** password Gmail Anda, tapi **App Password**:

1. Aktifkan 2-Step Verification di akun Google.
2. Buka <https://myaccount.google.com/apppasswords>
3. Buat App Password baru → salin 16 karakter ke `SMTP_PASS`.

### Alternatif untuk testing: Mailtrap

Mailtrap menangkap email di kotak masuk palsu, jadi Anda tidak perlu akun email
sungguhan:

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=<dari dashboard Mailtrap>
SMTP_PASS=<dari dashboard Mailtrap>
```

### Cek sudah aktif atau belum

Setelah restart, buka:
```bash
curl http://localhost:5000/api/health
```

Cari bagian `delivery`:
```json
"delivery": {
  "configuredChannel": "EMAIL",
  "effectiveSender": "EMAIL",     ← harus EMAIL, bukan CONSOLE
  "smtpConfigured": true
}
```

Kalau masih `"effectiveSender": "CONSOLE"` dan `smtpConfigured: false`, berarti
ada env yang belum terbaca — pastikan backend sudah di-restart.

---

## 3. Simpan user & OTP ke Supabase (persisten)

Tanpa langkah ini, **semua user hilang saat backend di-restart** karena
disimpan di memori.

### 3a. Jalankan migrasi

Buka **Supabase Dashboard → SQL Editor**, tempel seluruh isi file
`backend/supabase/otp_schema.sql`, lalu **Run**.

Skrip ini membuat:
- tabel `public.profiles` — menyimpan status akun (`PENDING_VERIFICATION` / `ACTIVE`)
- tabel `public.otp_codes` — menyimpan hash OTP, expiry, attempts
- indeks, RLS, trigger profil otomatis, dan RPC pembersihan berkala

### 3b. Isi service role key

Ambil dari **Supabase Dashboard → Project Settings → API → `service_role`**.
Masukkan ke `backend/.env`:

```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

> ⚠️ Key ini **melewati semua RLS**. Jangan pernah ditaruh di frontend,
> jangan di-commit ke git.

Restart backend, lalu cek:
```bash
curl http://localhost:5000/api/v1/auth/otp/diagnostics
```

```json
"storage": {
  "serviceRoleKeyPresent": true,
  "mode": "supabase",             ← harus "supabase"
  "note": "..."                   ← hilang kalau sudah benar
}
```

Sekarang user tersimpan di `auth.users` dan OTP di `otp_codes`.

---

## 4. Kalau nanti dipakai lebih dari satu server → Redis

Secara default pembatas laju (cooldown & kuota per jam) disimpan di memori
proses. Kalau backend dijalankan di beberapa instance, batasnya tidak akan
sinkron. Isi `REDIS_URL` untuk memperbaikinya:

```env
REDIS_URL=redis://localhost:6379
```

Cek hasilnya di `/api/health`:
```json
"otp": { "rateLimiterBackend": "redis" }
```

Redis **opsional** — kalau `REDIS_URL` kosong, sistem tetap jalan dengan
limiter in-memory (aman untuk satu instance).

---

## 5. Ringkasan env yang penting

| Variabel | Wajib? | Fungsi | Default |
|----------|--------|--------|---------|
| `OTP_PEPPER` | **ya, di production** | Pepper HMAC untuk hash kode | — |
| `OTP_LENGTH` | tidak | Panjang kode | `6` |
| `OTP_TTL_SECONDS` | tidak | Masa berlaku kode | `300` (5 menit) |
| `OTP_MAX_ATTEMPTS` | tidak | Percobaan sebelum kode hangus | `5` |
| `OTP_RESEND_COOLDOWN_SECONDS` | tidak | Jeda minimum kirim ulang | `60` |
| `OTP_MAX_REQUESTS_PER_HOUR_DEST` | tidak | Kuota per jam per tujuan | `5` |
| `OTP_MAX_REQUESTS_PER_HOUR_IP` | tidak | Kuota per jam per IP | `10` |
| `OTP_CHANNEL` | tidak | `EMAIL` \| `SMS` \| `WHATSAPP` | `EMAIL` |
| `OTP_DEV_FIXED_CODE` | tidak | Pin kode di lokal | kosong |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | untuk email nyata | Kredensial SMTP | kosong |
| `SUPABASE_SERVICE_ROLE_KEY` | untuk persisten | Akses `auth.users` + tabel | kosong |
| `REDIS_URL` | tidak | Limiter terdistribusi | kosong |

Buat pepper yang kuat:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 6. Kalau ada masalah

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| Kode tidak muncul di terminal | `effectiveSender` = EMAIL tapi SMTP gagal | Cek `SMTP_*`, atau kosongkan `SMTP_HOST` untuk kembali ke console |
| `"effectiveSender": "CONSOLE"` padahal SMTP sudah diisi | Env belum terbaca | Pastikan `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` **ketiganya** terisi, lalu restart backend |
| Registrasi bilang sukses tapi user hilang setelah restart | `storage.mode` = `local-degraded` | Isi `SUPABASE_SERVICE_ROLE_KEY` + jalankan migrasi (§3) |
| `Could not find the table 'public.profiles'` di log | Migrasi belum dijalankan | Jalankan `backend/supabase/otp_schema.sql` |
| `OTP_RESEND_COOLDOWN` terus muncul | Cooldown 60 detik masih berjalan | Tunggu, atau turunkan `OTP_RESEND_COOLDOWN_SECONDS` untuk testing |
| `OTP_MAX_ATTEMPTS` padahal kode benar | 5 percobaan sudah habis | Klik **Kirim ulang** untuk dapat kode baru |
| `OTP_RATE_LIMITED` | Kuota per jam habis | Naikkan `OTP_MAX_REQUESTS_PER_HOUR_*` untuk testing |
| Halaman `/verify-otp` balik ke `/auth` | `sessionStorage` kosong (buka tab baru / refresh setelah tutup browser) | Daftar ulang — data verifikasi memang sengaja disimpan per-sesi |
| CORS error di browser | Frontend tidak bisa menjangkau backend | Pastikan backend jalan di port 5000, dan `VITE_BACKEND_URL` benar |

### Cek cepat server hidup

```bash
curl http://localhost:5000/api/health
```

Yang perlu diperhatikan:
```json
{
  "features": { "otpVerification": true },
  "otp": {
    "length": 6, "ttlSeconds": 300, "maxAttempts": 5,
    "resendCooldownSeconds": 60, "channel": "EMAIL",
    "rateLimiterBackend": "memory",          ← "redis" kalau REDIS_URL diisi
    "storageBackend": "memory-no-service-role",
    "delivery": { "effectiveSender": "CONSOLE", "smtpConfigured": false }
  }
}
```

---

## 7. Uji lewat terminal (tanpa browser)

Berguna untuk memastikan backend benar sebelum menyentuh frontend.

> **Penting:** contoh di bawah memakai kode `123456`. Itu **hanya berhasil kalau
> `OTP_DEV_FIXED_CODE=123456` diaktifkan** (lihat §1). Kalau baris itu masih
> dikomentari, kode aslinya acak — ambil dari kotak `OTP DEV DELIVERY` di
> terminal backend.

```bash
# 1. Daftar
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Budi","email":"budi@example.com","password":"Rahasia123!"}'
# → {"userId":"...","status":"PENDING_VERIFICATION","otp":{...}}
#   Simpan userId-nya.

# 2. Kirim kode salah
curl -X POST http://localhost:5000/api/v1/auth/register/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<userId>","code":"000000"}'
# → {"error":{"code":"OTP_INVALID","remainingAttempts":4}}

# 3. Kirim kode benar
#    (123456 kalau OTP_DEV_FIXED_CODE aktif — kalau tidak, lihat terminal backend)
curl -X POST http://localhost:5000/api/v1/auth/register/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<userId>","code":"123456"}'
# → {"status":"ACTIVE","accessToken":"...","refreshToken":"..."}
```

Kalau `OTP_DEV_FIXED_CODE` belum aktif dan ingin tetap lewat terminal, ambil
kodenya dari log:

```bash
# Terminal lain, sambil backend jalan — cetak kode terakhir yang dikirim
grep "message     :" <log-backend> | tail -1
```

---

## 8. Menjalankan test

```bash
cd backend
npm run test:otp     # test unit crypto + service OTP (36 test)
npm test             # semua test di folder test/
```

---

## 9. Checklist sebelum production

- [ ] `OTP_PEPPER` diisi dengan secret acak 32 byte (load dari secret manager)
- [ ] `NODE_ENV=production` (mematikan `OTP_DEV_FIXED_CODE` dan mode console)
- [ ] `SMTP_*` diisi dengan penyedia email sungguhan
- [ ] `SUPABASE_SERVICE_ROLE_KEY` diisi, migrasi `otp_schema.sql` sudah dijalankan
- [ ] `REDIS_URL` diisi kalau backend multi-instance
- [ ] `storage.mode` = `supabase` dan `effectiveSender` = `EMAIL` di `/api/health`
- [ ] Job pembersihan harian jalan (lihat log `[Cleanup] Daily OTP cleanup job scheduled.`)
