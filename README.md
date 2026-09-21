# costKu / Personal Finance Advisor

Aplikasi penasihat keuangan personal untuk first-jobber & pekerja muda Indonesia berbasis filosofi Swiss Design. Dilengkapi kalkulator Safe-to-Spend, alokasi 50/30/20 adaptif, plafon sewa kost maksimal 25%, dan rekomendasi belanja kebutuhan riil.

---

## 📋 Prasyarat Sistem

Pastikan perangkat Anda sudah terpasang:
- **Node.js** (v18 atau lebih baru) & **npm**
- **Docker** & **Docker Compose** (jika ingin menjalankan via Container)
- **Git**

---

## 🐳 Cara Menjalankan Menggunakan Docker Container

Docker Compose memudahkan deployment frontend dan backend dalam container terisolasi secara otomatis.

### 0. Siapkan Environment Variable (WAJIB, jangan dilewati)

Ada dua hal yang berbeda dan sering tertukar:

| Variabel | Kapan dibaca | Cara mengisi |
|---|---|---|
| `SUPABASE_*`, `GOOGLE_*`, `MIDTRANS_*`, `OTP_*` | **saat container jalan** | otomatis dari `backend/.env` (compose sudah pakai `env_file`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL` | **saat image di-build** | harus di-export ke shell atau ditaruh di `.env` root |

`VITE_*` di-inline oleh Vite ke dalam bundle pada waktu `npm run build`. Kalau nilainya kosong saat build:

- `isSupabaseConfigured` menjadi `false`
- URL `/api/v1/auth/google` ikut ter-*tree-shake* keluar dari bundle
- tombol **Masuk dengan Google** diam-diam jatuh ke identitas demo (tanpa error)

Jadi sebelum build, lakukan salah satu:

```bash
# Opsi A — export di shell (nilai diambil dari frontend/.env)
export VITE_SUPABASE_URL="https://xxxxxxxx.supabase.co"
export VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIs..."
```

```bash
# Opsi B — buat file .env di root repo (sebelah docker-compose.yml)
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_BACKEND_URL=http://localhost:5000
```

Kalau `VITE_SUPABASE_URL` belum di-set, `docker compose` akan langsung berhenti dengan pesan error yang jelas — lebih baik gagal di awal daripada jalan dengan auth yang diam-diam mati.

### 1. Jalankan Seluruh Container (Frontend & Backend)
Dari folder root proyek:
```bash
docker-compose up -d --build
```
> Flag `-d` menjalankan container di background (detached mode), sedangkan `--build` memastikan image dibangun ulang dengan source code terbaru.

> **Penting:** `--build` (atau `docker compose build`) harus dijalankan ulang setiap kali nilai `VITE_*` berubah, karena nilainya sudah "dibekukan" di dalam bundle. Mengubah `.env` lalu hanya restart container **tidak** akan mengubah apa pun.

### 2. Memeriksa Status Container
```bash
docker-compose ps
```
Pastikan kedua container berstatus `Up`:
- `costku_backend` (Port `5000`)
- `costku_frontend` (Port `80`)

### 3. Mengakses Aplikasi
- **Frontend App**: Buka browser di [http://localhost](http://localhost) (Port 80)
- **Backend API**: Buka browser / Postman di [http://localhost:5000](http://localhost:5000)

### 4. Melihat Log Container
Untuk memantau aktivitas atau debugging:
```bash
# Log seluruh service
docker-compose logs -f

# Log frontend saja
docker-compose logs -f frontend

# Log backend saja
docker-compose logs -f backend
```

### 5. Menghentikan Container
```bash
# Menghentikan container tanpa menghapus data
docker-compose stop

# Mematikan dan menghapus container beserta jaringannya
docker-compose down
```

### 6. Menjalankan Container Individual (Manual Tanpa Compose)
Jika hanya ingin build atau run salah satu service:

**Backend:**
```bash
cd backend
docker build -t costku-backend .
docker run -d -p 5000:5000 --env-file .env --name costku_backend costku-backend
```

**Frontend:**
```bash
cd frontend
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  --build-arg VITE_BACKEND_URL="http://localhost:5000" \
  -t costku-frontend .
docker run -d -p 80:80 --name costku_frontend costku-frontend
```
> Build arg di atas tidak boleh dihapus — tanpa itu bundle frontend tidak punya konfigurasi Supabase dan login Google mati (lihat langkah 0).

---

## 💻 Cara Menjalankan Secara Lokal (Development / Tanpa Docker)

Jika ingin melakukan development dengan hot-reload:

### 1. Jalankan Frontend
```bash
cd frontend
npm install
npm run dev
```
Akses di: `http://localhost:5173`

### 2. Jalankan Backend
```bash
cd backend
npm install
npm run dev
```
Akses di: `http://localhost:5000`

### 3. Shortcut dari Root
```bash
# Install dependencies di root, frontend, dan backend
npm run install:all

# Jalankan frontend dev server
npm run dev:frontend

# Jalankan backend dev server
npm run dev:backend
```

---

## 📁 Arsitektur & Struktur Direktori

```text
Finace Advisor/
├── frontend/                     # React 19 + Vite + TypeScript
│   ├── src/
│   │   ├── components/           # UI Cards, Charts, Forms, Sliders
│   │   ├── contexts/             # AuthContext (Supabase / Local Demo Mode)
│   │   ├── data/                 # Master data rekomendasi kost & minimarket
│   │   ├── lib/                  # Formula Safe-to-Spend, kalkulator, Supabase client
│   │   ├── pages/                # LandingPage, AuthPage, OnboardingPage,
│   │   │                         # DashboardPage, AllocationPage, RecommendationsPage,
│   │   │                         # TransactionsPage
│   │   └── styles/               # Modular Swiss Editorial CSS
│   ├── Dockerfile                # Multi-stage build (Node -> Nginx Alpine)
│   └── package.json
│
├── backend/                      # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── lib/                  # Midtrans Snap client, Supabase admin client
│   │   ├── middleware/           # Error handler, Supabase JWT auth middleware
│   │   ├── routes/               # /api/auth, /api/subscription, /api/midtrans webhook
│   │   ├── types/                # Type declarations (midtrans-client)
│   │   └── index.ts              # Express Server entrypoint
│   ├── supabase/
│   │   └── schema.sql            # SQL schema & trigger untuk table subscriptions
│   ├── Dockerfile                # Production Node.js Alpine runtime
│   └── package.json
│
├── docker-compose.yml            # Orkestrasi multi-container Docker
└── README.md                     # Dokumentasi panduan proyek
```

---

## 💳 Model Freemium (Money Tracker vs Financial Advisor)

| Fitur | Mode Free (Money Tracker) | Mode Premium (Financial Advisor) |
|---|:---:|:---:|
| Pencatatan transaksi harian & riwayat | ✅ Gratis Selamanya | ✅ Lengkap |
| Filter & ringkasan arus kas | ✅ Gratis Selamanya | ✅ Lengkap |
| Kalkulator Safe-to-Spend adaptif | 🔒 Locked | ✅ Aktif (Live Sync) |
| Alokasi 50/30/20 kustom | 🔒 Locked | ✅ Aktif |
| Rekomendasi sewa kost (maks 25% gaji) | 🔒 Locked | ✅ Aktif |
| Rekomendasi belanja minimarket & gizi | 🔒 Locked | ✅ Aktif |
| Financial Health Score (0–100) | 🔒 Locked | ✅ Aktif |
| Integrasi Pembayaran Midtrans Snap | — | ✅ QRIS, VA, E-Wallet |

---

## 🔐 Variabel Lingkungan (.env)

### Frontend (`frontend/.env`):
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_BACKEND_URL=http://localhost:5000
```
> *Catatan: Jika Supabase/Midtrans belum dikonfigurasi, sistem otomatis menggunakan Demo Mode / LocalStorage failover sehingga aplikasi tetap dapat dicoba secara penuh.*

### Backend (`backend/.env`):
```env
PORT=5000
NODE_ENV=development

# Supabase Admin / Service Role
SUPABASE_URL=https://your_project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# Atau gunakan SUPABASE_ANON_KEY jika service role belum tersedia
SUPABASE_ANON_KEY=your_anon_key

# Midtrans Payment Gateway (Sandbox)
MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxx
MIDTRANS_IS_PRODUCTION=false

# OTP (verifikasi registrasi)
# WAJIB diisi di production — tanpa ini hash OTP dapat direproduksi.
OTP_PEPPER=ganti-dengan-secret-acak-panjang
# Opsional: pin kode OTP di lokal. Diabaikan saat NODE_ENV=production.
# OTP_DEV_FIXED_CODE=123456

# SMTP untuk pengiriman OTP via email. Bila kosong, kode dicetak ke
# console (hanya boleh di development — production akan menolak).
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM="costKu <no-reply@example.com>"

# Google OAuth (login dengan Google) — server-side Authorization Code flow.
# Nilai redirect URI HARUS sama persis dengan yang didaftarkan di Google
# Cloud Console, kalau tidak Google menjawab redirect_uri_mismatch.
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
# Jangan pernah beri prefix VITE_ pada secret ini — Vite menanamkan semua
# variabel VITE_* ke bundle browser sehingga bisa dibaca siapa pun.
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
# Halaman tujuan setelah callback selesai.
FRONTEND_URL=http://localhost:5173
# Opsional — kunci HMAC untuk parameter `state`. Fallback ke OTP_PEPPER.
OAUTH_STATE_SECRET=

# Opsional — pembatas laju berbasis Redis. Bila kosong, dipakai
# sliding-window in-memory (cukup untuk satu instance).
# REDIS_URL=redis://localhost:6379
```

> *Catatan: Jika Supabase/Midtrans belum dikonfigurasi, sistem otomatis menggunakan Demo Mode / LocalStorage failover sehingga aplikasi tetap dapat dicoba secara penuh.*

---

## 🔑 Setup Login Google (OAuth)

Login Google memakai alur **Authorization Code** yang dipegang backend: browser diarahkan
ke Google, Google mengembalikan kode ke backend, backend menukarnya dengan token lalu
mengembalikan sesi ke aplikasi.

### 1. Daftarkan OAuth client di Google Cloud Console

**APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**

**Authorized JavaScript origins:**
```
http://localhost:5173
http://localhost
```

**Authorized redirect URIs** (harus sama persis dengan `GOOGLE_REDIRECT_URI`):
```
http://localhost:5000/api/v1/auth/google/callback
```

> Redirect URI menunjuk ke **backend** (port 5000), dan backend selalu di port 5000 baik
> saat dev maupun Docker — jadi cukup satu baris saja. Yang berbeda hanya origin frontend:
> `5173` saat `npm run dev`, `http://localhost` saat lewat Docker (nginx port 80).
> Daftarkan keduanya sekaligus supaya tidak perlu bolak-balik ke Console.

### 2. Isi `.env`

Salin `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` dari Google Console ke `backend/.env`.
Secret **hanya** boleh ada di backend — jangan pernah memberi prefix `VITE_`.

### 3. Endpoint

| Method | Path | Keterangan |
|--------|------|------------|
| `GET` | `/api/v1/auth/google` | Redirect ke halaman consent Google |
| `GET` | `/api/v1/auth/google/callback` | Tukar `code`, provisioning user, lanjutkan ke frontend |

Setelah callback selesai, browser mendarat di `http://localhost:5173/auth/callback`,
menukar token sekali pakai menjadi sesi Supabase, lalu masuk ke `/dashboard`.

> *Catatan: `SUPABASE_SERVICE_ROLE_KEY` wajib diisi agar login Google menghasilkan sesi
> Supabase asli. Tanpa itu backend jatuh ke identitas lokal (mode demo) dan pengguna tetap
> bisa masuk, tetapi sesi tidak terhubung ke `auth.users`.*

---

## 🔑 Verifikasi OTP (Registrasi)

Alur registrasi memakai OTP milik sendiri dengan Supabase tetap sebagai
penyimpan user (`auth.users`). Status akun dilacak di tabel `profiles`.

**Alur:** `register` → `PENDING_VERIFICATION` → `verify-otp` → `ACTIVE`

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| `POST` | `/api/v1/auth/register` | Buat user + kirim OTP. Mengembalikan `userId`, `status`, dan `otp` (destination ter-mask, `expiresInSeconds`, `resendAvailableInSeconds`). |
| `POST` | `/api/v1/auth/register/verify-otp` | Verifikasi kode → `{ status: 'ACTIVE', accessToken, refreshToken }`. |
| `POST` | `/api/v1/auth/register/resend-otp` | Kirim ulang kode. Tunduk pada cooldown 60 detik. |
| `GET`  | `/api/v1/auth/register/status/:userId` | Cek status verifikasi terkini. |
| `GET`  | `/api/v1/auth/otp/diagnostics` | Konfigurasi OTP efektif + mode penyimpanan/pengiriman. |

**Setup database.** Jalankan `backend/supabase/otp_schema.sql` di SQL editor
Supabase. Skrip membuat tabel `profiles` dan `otp_codes`, indeks, RLS, serta
RPC pembersihan berkala.

**Keamanan.** Kode dibuat dengan CSPRNG (`crypto.randomInt`), disimpan sebagai
HMAC-SHA256 dengan pepper, diperiksa memakai perbandingan waktu-konstan, dan
hanya bisa dipakai sekali (klaim `consumed_at` bersifat atomik sehingga
verifikasi paralel hanya menghasilkan satu pemenang). Batas laju berlaku
per-user, per-destination, dan per-IP.

**Degradasi anggun.** Tanpa `SUPABASE_SERVICE_ROLE_KEY` atau tanpa migrasi,
modul OTP otomatis jatuh ke penyimpanan in-memory alih-alih gagal 500.
Mode aktif dapat dilihat di `/api/v1/auth/otp/diagnostics`.

**Menjalankan test:**
```bash
cd backend
npm run test:otp     # test unit crypto + service OTP
```

