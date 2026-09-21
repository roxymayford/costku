# Setup Login Google — nilai siap salin-tempel

Dokumen ini khusus untuk mengisi **Google Cloud Console**. Isinya sudah diverifikasi
langsung dari aplikasi yang berjalan (bukan dari asumsi).

---

## 1. Port yang dipakai

| Bagian | Port | Alamat |
|---|---|---|
| Backend API | **5000** | `http://localhost:5000` |
| Frontend (dev, `npm run dev`) | **5173** | `http://localhost:5173` |
| Frontend (Docker, nginx) | **80** | `http://localhost` |

Redirect OAuth selalu menunjuk ke **backend port 5000** — port ini sama di dev maupun
Docker, jadi tidak perlu diubah.

---

## 2. Authorized JavaScript origins

Salin **keduanya** (dua baris, satu per satu):

```
http://localhost:5173
http://localhost
```

`5173` untuk mode dev, `http://localhost` untuk mode Docker.

---

## 3. Authorized redirect URIs

Salin **satu baris** ini:

```
http://localhost:5000/api/v1/auth/google/callback
```

> Harus **sama persis** dengan nilai `GOOGLE_REDIRECT_URI` di `backend/.env`.
> Google menolak permintaan kalau ada beda satu karakter pun (mis. ada/tidak ada
> trailing slash).

---

## 4. Environment variable

### `backend/.env` (rahasia — jangan pernah diberi prefix `VITE_`)

```env
GOOGLE_CLIENT_ID=228028201779-pr36kvck741e4n52tim22i0mmn2h4hn3.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<isi ulang dengan secret baru hasil rotasi>
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
FRONTEND_URL=http://localhost:5173
OAUTH_STATE_SECRET=<string acak, minimal 32 karakter>
```

- `FRONTEND_URL` → ganti ke `http://localhost` kalau jalan lewat Docker
- `OAUTH_STATE_SECRET` → dipakai menandatangani parameter `state` (anti-CSRF).
  Kalau kosong, backend membuat kunci acak sendiri dan akan berubah tiap restart
  (artinya: login yang sedang berjalan bisa gagal setelah restart). Isi agar stabil.
  Buat nilainya dengan: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### `frontend/.env` (publik — ikut ter-bundle, jadi jangan taruh rahasia)

```env
VITE_SUPABASE_URL=<dari Supabase>
VITE_SUPABASE_ANON_KEY=<dari Supabase>
VITE_BACKEND_URL=http://localhost:5000
```

---

## 5. Endpoint yang dipakai aplikasi

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/v1/auth/google` | Mengalihkan browser ke halaman consent Google |
| `GET` | `/api/v1/auth/google/callback` | Menukar `code` dengan token, membuat user, lalu mengembalikan sesi ke frontend |

Alias tanpa versi juga tersedia di `/api/auth/google` dan `/api/auth/google/callback`.

Setelah callback selesai, browser mendarat di `FRONTEND_URL/auth/callback` dan masuk
ke `/dashboard`.

---

## 6. Cara memastikan konfigurasi sudah benar

Jalankan backend, lalu:

```bash
curl --noproxy '*' -s http://localhost:5000/api/health
```

Perhatikan `features`:

- `"googleConnected": true` → `GOOGLE_CLIENT_ID` + `GOOGLE_REDIRECT_URI` terbaca
- `"supabaseAdminReady": true` → `SUPABASE_SERVICE_ROLE_KEY` terbaca (wajib agar login
  Google menghasilkan sesi Supabase asli; kalau `false`, aplikasi jatuh ke identitas
  lokal/demo — pengguna tetap bisa masuk, tapi sesinya tidak terhubung ke `auth.users`)

Lalu cek URL consent yang dihasilkan:

```bash
curl --noproxy '*' -s -D - -o /dev/null http://localhost:5000/api/v1/auth/google | grep -i '^location'
```

`client_id` dan `redirect_uri` di dalam URL itu harus sama dengan yang didaftarkan
di Google Console.

---

## 7. Checklist

- [ ] Authorized JavaScript origins berisi `http://localhost:5173` dan `http://localhost`
- [ ] Authorized redirect URI berisi `http://localhost:5000/api/v1/auth/google/callback`
- [ ] `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` terisi di `backend/.env`
- [ ] `GOOGLE_REDIRECT_URI` identik dengan yang di Console
- [ ] `SUPABASE_SERVICE_ROLE_KEY` terisi (untuk sesi Supabase asli)
- [ ] Client secret sudah **dirotasi** — secret lama pernah dikirim dalam bentuk teks biasa
