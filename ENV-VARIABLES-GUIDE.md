# 🔐 Panduan Lengkap Environment Variables (costKu)

Dokumen ini berisi daftar lengkap variabel lingkungan (**Environment Variables**) yang harus dimasukkan ke masing-masing aplikasi untuk deployment di **Vercel** dan **Railway**.

---

## 📑 Daftar Isi
1. [🅰️ Frontend (Vercel)](#-1-frontend-vercel)
2. [🅱️ Backend API Express (Railway)](#-2-backend-api-express-railway)
3. [🅲 ML Microservice Flask (Railway - Opsional)](#-3-ml-microservice-flask-railway---opsional)
4. [💡 Cara Cepat Generate Secret Keys](#-4-cara-cepat-generate-secret-keys)

---

## 🅰️ 1. Frontend (Vercel)

* **Lokasi Pengisian**: Dashboard Vercel ➔ Pilih Proyek ➔ **Settings** ➔ **Environment Variables**
* **Root Directory**: `frontend`
* **Framework**: `Vite`

> [!IMPORTANT]
> Semua variabel frontend **WAJIB** berawalan `VITE_`. Nilai `VITE_BACKEND_URL` **TIDAK BOLEH** diakhiri tanda garis miring (`/`).

### Template Copy-Paste (Key & Value):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_BACKEND_URL=https://costku-production.up.railway.app
```

> [!NOTE]
> Nama domain di dashboard Railway adalah `costku` (project `overlooking-art`),
> jadi host backend-nya `costku-production.up.railway.app` — **bukan**
> `costku-backend-production...`. Selalu salin dari Railway ➔ Service ➔
> **Settings ➔ Networking ➔ Public Networking**.
>
> Kalau `VITE_BACKEND_URL` dibiarkan kosong, bundle Vercel akan memanggil
> `localhost:5000` dari browser pengunjung → request gagal / CORS error.
> Sebagai jaring pengaman, `frontend/vercel.json` sekarang juga mem-proxy
> `/api/*` ke domain Railway yang sama, jadi panggilan relatif `/api/...`
> tetap sampai ke backend tanpa bergantung pada env ini.

### Penjelasan Variabel:

| Variable | Contoh Nilai | Deskripsi & Sumber |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | URL proyek Supabase (*Supabase Dashboard ➔ Project Settings ➔ API*) |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Public Anon Key (*Supabase Dashboard ➔ Project Settings ➔ API*) |
| `VITE_BACKEND_URL` | `https://costku-production.up.railway.app` | Domain publik dari service backend di Railway |

---

## 🅱️ 2. Backend API Express (Railway)

* **Lokasi Pengisian**: Dashboard Railway ➔ Klik Service `costku-backend` ➔ Tab **Variables** (Bisa klik tombol **RAW Editor** untuk langsung paste semua sekaligus).
* **Root Directory**: `backend`
* **Target Port**: `5000`

### Template Copy-Paste (Siap Edit):

```env
# ── SERVER & APLIKASI ──
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://costku.vercel.app

# ── SUPABASE CREDENTIALS ──
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ── GOOGLE OAUTH 2.0 ──
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
GOOGLE_REDIRECT_URI=https://costku-production.up.railway.app/api/v1/auth/google/callback
OAUTH_STATE_SECRET=64_karakter_hex_acak_atau_samakan_dengan_otp_pepper

# ── OTP VERIFICATION (EMAIL) ──
OTP_LENGTH=6
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_REQUESTS_PER_HOUR_DEST=5
OTP_MAX_REQUESTS_PER_HOUR_IP=10
OTP_PEPPER=paste_64_karakter_hex_dari_crypto_randomBytes_disini
OTP_CHANNEL=EMAIL
UNVERIFIED_USER_TTL_DAYS=3
OTP_SEND_RETRY_ATTEMPTS=3
OTP_SEND_RETRY_BASE_DELAY_MS=1500

# ── SMTP EMAIL SERVICE ──
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=emailkamu@gmail.com
SMTP_PASS=app-password-gmail-16-karakter
OTP_EMAIL_FROM=emailkamu@gmail.com
OTP_EMAIL_FROM_NAME=costKu

# ── MIDTRANS PAYMENT GATEWAY ──
MIDTRANS_SERVER_KEY=SB-Mid-server-your_server_key
MIDTRANS_CLIENT_KEY=SB-Mid-client-your_client_key
MIDTRANS_IS_PRODUCTION=false

# ── INTEGRASI FLASK ML MICROSERVICE ──
# Set 'true' jika deploy Flask di Railway, atau 'false' jika hanya pakai Express rule-based
ENABLE_ML_CLASSIFIER=true
ML_SERVICE_URL=http://costku-ml.railway.internal:5001
INTERNAL_API_KEY=kunci_rahasia_internal_costku_2026_xyz
```

### Penjelasan Variabel Backend:

| Variable | Wajib? | Keterangan |
|---|---|---|
| `NODE_ENV` | Ya | `production` untuk mengaktifkan optimasi keamanan & menonaktifkan kode dummy OTP. |
| `FRONTEND_URL` | Ya | Domain Vercel Anda. Digunakan untuk izin CORS dan redirect sesi setelah login Google. |
| `SUPABASE_URL` | Ya | URL database Supabase. |
| `SUPABASE_ANON_KEY` | Ya | Kunci anonim publik Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sangat Wajib** | Diambil dari *Supabase ➔ Project Settings ➔ API ➔ service_role*. Wajib untuk membuat user baru & bypass RLS saat verifikasi OTP. |
| `GOOGLE_CLIENT_ID` | Ya | Client ID dari Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Ya | Client Secret dari Google Cloud Console. |
| `GOOGLE_REDIRECT_URI` | Ya | Harus sama persis dengan yang didaftarkan di Google Console: `https://<DOMAIN_RAILWAY>/api/v1/auth/google/callback`. |
| `OTP_PEPPER` | **Sangat Wajib** | Kunci rahasia HMAC untuk enkripsi hashing OTP di memori. |
| `OTP_CHANNEL` | Ya | `EMAIL` agar kode OTP dikirim via email sungguhan. |
| `SMTP_HOST` & `SMTP_PORT` | Ya | Host & port pengirim email (contoh: Gmail `smtp.gmail.com` port `587`, atau Resend / Mailgun). |
| `SMTP_USER` & `SMTP_PASS` | Ya | Kredensial email. Untuk Gmail, gunakan **App Password** 16 karakter (bukan password akun biasa). |
| `MIDTRANS_SERVER_KEY` | Ya | Dari Dashboard Midtrans -> *Access Keys*. |
| `MIDTRANS_CLIENT_KEY` | Ya | Dari Dashboard Midtrans -> *Access Keys*. |
| `MIDTRANS_IS_PRODUCTION` | Ya | `false` untuk Sandbox, `true` jika sudah akun Midtrans Production. |
| `ENABLE_ML_CLASSIFIER` | Opsional | `true` jika men-deploy Flask di Railway; `false` jika tidak ingin deploy Flask. |
| `ML_SERVICE_URL` | Opsional | Alamat internal Flask di Railway: `http://costku-ml.railway.internal:5001`. |
| `INTERNAL_API_KEY` | Opsional | Token otentikasi internal antara Express dan Flask (wajib sama persis). |

---

## 🅲 3. ML Microservice Flask (Railway - Opsional)

* **Lokasi Pengisian**: Dashboard Railway ➔ Klik Service `costku-ml` ➔ Tab **Variables**
* **Root Directory**: `ml-service`
* **Target Port**: `5001`
* **Networking**: Private Networking internal (`costku-ml.railway.internal`)

### Template Copy-Paste:

```env
PORT=5001
INTERNAL_API_KEY=kunci_rahasia_internal_costku_2026_xyz
```

### Penjelasan Variabel Flask:

| Variable | Wajib? | Keterangan |
|---|---|---|
| `PORT` | Ya | Isi `5001`. Port internal tempat Gunicorn Flask mendengarkan request. |
| `INTERNAL_API_KEY` | Ya | **Wajib sama persis** dengan nilai `INTERNAL_API_KEY` di service backend Express. Mencegah request asing yang tidak sah. |

---

## 💡 4. Cara Cepat Generate Secret Keys

Untuk menghasilkan nilai `OTP_PEPPER`, `OAUTH_STATE_SECRET`, atau `INTERNAL_API_KEY` yang aman dan memenuhi standar kriptografi, jalankan perintah ini di Command Prompt / PowerShell:

```bash
# Generate 64-karakter string hex acak:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Hasil contoh:
```
e9b207df8b64e1d5137ceb9708a38bdf21469e32f5d96850d510f845aefca113
```
Salin string tersebut dan masukkan ke variabel `OTP_PEPPER`.
