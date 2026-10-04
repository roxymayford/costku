# 🚀 Panduan & Rencana Deployment: Vercel + Railway (costKu)

Dokumen ini berisi panduan langkah demi langkah untuk men-deploy aplikasi **costKu** ke lingkungan produksi:
- **Frontend (React 19 + Vite + Tailwind CSS v4)**: Di-deploy ke **Vercel**
- **Backend (Express + TypeScript + Node.js 20)**: Di-deploy ke **Railway**
- **ML Microservice (Opsional - Python Flask + scikit-learn)**: Di-deploy sebagai service pendukung di **Railway**
- **Integrasi Cloud**: Supabase, Google OAuth 2.0, dan Midtrans Payment Gateway.

---

## 🏗️ 1. Arsitektur Produksi

```
[ Pengguna / Browser ]
         │
         ├───► [ Vercel ] (Frontend SPA: https://costku.vercel.app)
         │        │
         │        ├─── (API Requests / CORS) ─────────────┐
         │        │                                       │
         │        ▼                                       ▼
         │   [ Supabase Cloud ]               [ Railway ] (Backend API)
         │   - Auth Client                     https://costku-backend.up.railway.app
         │   - PostgreSQL Database                        │
         │                                                ├─► [ Supabase Admin API ]
         │                                                ├─► [ Midtrans Snap/Webhook ]
         │                                                ├─► [ Google OAuth 2.0 ]
         │                                                └─► [ ML Service ] (Opsional)
```

---

## 📋 2. Urutan Eksekusi Deployment (Recommended Order)

Agar tidak bolak-balik mengubah URL, ikuti urutan berikut:
1. **Langkah 1**: Deploy Backend di Railway ➔ Dapatkan domain publik Railway (misal: `https://costku-backend.up.railway.app`).
2. **Langkah 2**: Deploy Frontend di Vercel ➔ Masukkan URL Railway tadi ke `VITE_BACKEND_URL` ➔ Dapatkan domain Vercel (misal: `https://costku.vercel.app`).
3. **Langkah 3**: Update `FRONTEND_URL` di Railway dengan domain Vercel.
4. **Langkah 4**: Sinkronkan URL di Google Cloud Console, Supabase Dashboard, dan Midtrans Dashboard.
5. **Langkah 5**: Jalankan Health Check & End-to-End Testing.

---

## 🛠️ 3. Deploy Backend ke Railway

Railway sangat ideal untuk backend Express karena mendukung proses latar belakang (*background cron jobs* untuk auto-debit & OTP cleanup), persistent connection, dan dynamic port routing.

### A. Persiapan Repositori di Railway
1. Buka [railway.app](https://railway.app/) dan login.
2. Klik **New Project** ➔ **Deploy from GitHub repo** ➔ Pilih repositori `costku`.
3. Setelah service dibuat, klik service tersebut, lalu buka tab **Settings**:
   - **Root Directory**: Ubah menjadi `/backend`.
   - **Build Command** (jika memakai Nixpacks): `npm run build`
   - **Start Command**: `npm start` (atau biarkan Railway mendeteksi otomatis dari `Dockerfile`/`package.json`).
4. Buka tab **Networking** ➔ Klik **Generate Domain** untuk mendapatkan URL publik (domain final costKu: `costku-backend.up.railway.app`).

### B. Konfigurasi Environment Variables di Railway
Buka tab **Variables** pada service backend dan masukkan variabel berikut:

| Variabel | Nilai / Contoh | Keterangan |
|---|---|---|
| `NODE_ENV` | `production` | Mengaktifkan mode produksi |
| `PORT` | *(Disediakan otomatis oleh Railway)* | Express otomatis membaca `process.env.PORT` |
| `FRONTEND_URL` | `https://costku.vercel.app` | URL domain frontend Vercel (untuk CORS & Redirect OAuth) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | URL proyek Supabase Anda |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | Anon/public key Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | **Wajib** untuk manajemen admin pengguna & OTP di database |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | Dari Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxx` | Dari Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://<DOMAIN_RAILWAY>/api/v1/auth/google/callback` | Callback URL OAuth |
| `OTP_PEPPER` | *(64-karakter string hex acak)* | Kunci HMAC OTP. Buat via: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OTP_CHANNEL` | `EMAIL` | Pengiriman OTP via email |
| `SMTP_HOST` | `smtp.gmail.com` / `smtp.resend.com` | Host SMTP provider Anda |
| `SMTP_PORT` | `587` | Port SMTP (TLS) |
| `SMTP_SECURE` | `false` | Port 587 menggunakan `false` (STARTTLS) |
| `SMTP_USER` | `email-kamu@gmail.com` | User / email SMTP |
| `SMTP_PASS` | `app-password-rahasia` | App Password (misal: Google App Password) |
| `OTP_EMAIL_FROM` | `no-reply@costku.id` / `email-kamu@gmail.com` | Alamat pengirim |
| `OTP_EMAIL_FROM_NAME` | `costKu` | Nama pengirim |
| `MIDTRANS_SERVER_KEY` | `Mid-server-xxxx` (Prod) / `SB-Mid-server-xxxx` | Server Key Midtrans |
| `MIDTRANS_CLIENT_KEY` | `Mid-client-xxxx` (Prod) / `SB-Mid-client-xxxx` | Client Key Midtrans |
| `MIDTRANS_IS_PRODUCTION` | `false` (Sandbox) atau `true` (Production) | Status lingkungan Midtrans |
| `ENABLE_ML_CLASSIFIER` | `false` *(jika tanpa Python)* atau `true` | Jika `false`, backend memakai NLP rule-based berkecepatan tinggi tanpa dependensi Python |

---

## ⚡ 4. Deploy Frontend ke Vercel

Vercel adalah platform terbaik untuk aplikasi Vite React SPA dengan CDN global berkecepatan tinggi.

### A. Konfigurasi Proyek di Vercel
1. Buka [vercel.com](https://vercel.com/) dan login.
2. Klik **Add New...** ➔ **Project** ➔ Impor repositori `costku`.
3. Di halaman **Configure Project**:
   - **Framework Preset**: Pilih `Vite` (biasanya terdeteksi otomatis).
   - **Root Directory**: Klik **Edit** dan pilih folder `frontend`.
   - **Build and Output Settings**:
     - *Build Command*: `npm run build`
     - *Output Directory*: `dist`
     - *Install Command*: `npm install`
4. Buka accordion **Environment Variables** dan tambahkan:

| Name | Value | Deskripsi |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | URL Supabase Anda |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase Anon Key publik |
| `VITE_BACKEND_URL` | `https://<DOMAIN_RAILWAY>` | URL publik Backend Railway (domain final costKu: `https://costku-backend.up.railway.app`, **tanpa** garis miring `/` di ujung) |

5. Klik tombol **Deploy**.

> [!NOTE]
> File `frontend/vercel.json` sudah dibuat di repositori dengan aturan *rewrite* `/(.*)` ke `/index.html`. Ini memastikan routing SPA (halaman `/dashboard`, `/login`, `/auth/callback`, dll.) tidak mengalami 404 ketika di-refresh langsung oleh pengguna.

---

## 🔗 5. Sinkronisasi Layanan Pihak Ketiga

Setelah kedua URL (Vercel & Railway) aktif, update pengaturan pihak ketiga:

### A. Google Cloud Console (OAuth 2.0)
Buka [Google Cloud Console](https://console.cloud.google.com/) ➔ **APIs & Services** ➔ **Credentials** ➔ Pilih OAuth 2.0 Client ID:
1. **Authorized JavaScript origins**:
   - Tambahkan: `https://<DOMAIN_VERCEL>` (misal: `https://costku.vercel.app`)
2. **Authorized redirect URIs**:
   - Tambahkan: `https://<DOMAIN_RAILWAY>/api/v1/auth/google/callback`
3. Klik **Save**.

### B. Supabase Dashboard
Buka [Supabase Dashboard](https://supabase.com/dashboard) ➔ Pilih Proyek Anda:
1. **Authentication** ➔ **URL Configuration**:
   - **Site URL**: Masukkan `https://<DOMAIN_VERCEL>`
   - **Redirect URLs**:
     - `https://<DOMAIN_VERCEL>/**`
     - `https://<DOMAIN_RAILWAY>/**`
2. Klik **Save**.

### C. Midtrans Dashboard
Buka [Midtrans Dashboard](https://dashboard.midtrans.com/) (atau Sandbox):
1. **Settings** ➔ **Configuration**:
   - **Payment Notification URL**: `https://<DOMAIN_RAILWAY>/api/midtrans/webhook`
   - **Finish Redirect URL**: `https://<DOMAIN_VERCEL>/subscription`
   - **Unfinish Redirect URL**: `https://<DOMAIN_VERCEL>/subscription`
   - **Error Redirect URL**: `https://<DOMAIN_VERCEL>/subscription`
2. Klik **Save**.

---

## 🤖 6. (Opsional) Menjalankan ML Service di Railway

Jika Anda ingin mengaktifkan *machine learning classifier* Python di Railway:
1. Di proyek Railway yang sama, klik **+ New** ➔ **GitHub Repo** ➔ Pilih repositori `costku` lagi.
2. Di service kedua ini, beri nama `costku-ml`.
3. Ubah **Settings**:
   - **Root Directory**: `/ml-service`
   - Railway otomatis membaca `ml-service/Dockerfile` atau `requirements.txt`.
4. Tambahkan Variable di service `costku-ml`:
   - `PORT`: `5001`
   - `INTERNAL_API_KEY`: *(isi string rahasia yang sama dengan backend)*
5. Buka tab **Networking** ➔ Generate Private Domain (misal: `costku-ml.railway.internal`).
6. Di service `backend`, update variabel:
   - `ENABLE_ML_CLASSIFIER`: `true`
   - `ML_SERVICE_URL`: `http://costku-ml.railway.internal:5001`
   - `INTERNAL_API_KEY`: *(isi string rahasia yang sama)*

> [!TIP]
> Jika tidak ingin menambah beban server / biaya, biarkan `ENABLE_ML_CLASSIFIER=false` di Backend. Backend costKu sudah memiliki fallback mesin parsing rule-based lokal berbahasa Indonesia yang sangat cepat dan akurat.

---

## 🧪 7. Checklist Verifikasi & Testing Pasca Deploy

Lakukan pemeriksaan berikut setelah deploy selesai:
- [ ] **Health Check Backend**: Kunjungi `https://<DOMAIN_RAILWAY>/api/health` ➔ pastikan respons JSON menampilkan `"status": "ok"` dan `supabaseConnected: true`.
- [ ] **Akses Frontend**: Buka `https://<DOMAIN_VERCEL>` ➔ pastikan antarmuka termuat sempurna tanpa error visual atau font hilang.
- [ ] **SPA Route Refresh**: Kunjungi `https://<DOMAIN_VERCEL>/login` lalu tekan F5 (reload) ➔ pastikan halaman tidak error 404.
- [ ] **Registrasi OTP**: Coba daftar akun baru dengan email asli ➔ pastikan email kode OTP masuk ke inbox/spam dan verifikasi berhasil.
- [ ] **Google Login**: Klik "Masuk dengan Google" ➔ pastikan dialihkan ke halaman akun Google dan kembali ke Dashboard costKu dengan sesi aktif.
- [ ] **Midtrans Snap**: Buka halaman Langganan ➔ pastikan status langganan dan integrasi pembayaran berfungsi sesuai mode yang dikonfigurasi.
