# Inventaris Mock Data & Rencana Migrasi ke Backend (Fase 0)

> Dokumen ini disusun berdasarkan hasil audit mendalam pada seluruh kode `frontend` dan `backend` costKu.
> Sesuai instruksi: **Fase 0 wajib diselesaikan dan disetujui terlebih dahulu sebelum menulis kode implementasi.**

---

## 1. Ringkasan Eksekutif Temuan Audit

Audit menemukan 4 kategori sumber data mock / tidak tersentralisasi di frontend:
1. **Pseudo-Database di `localStorage` & Direct Supabase Queries:**
   - Transaksi, Profil Finansial, dan Pengaturan Budget disimpan di `localStorage` atau langsung di-query dari client ke tabel Supabase tanpa melalui Express API layer.
   - Pemasukan (`incomeApi.ts`) dan Cicilan (`liabilityApi.ts`) sudah dibuatkan endpoint-nya di backend (`/api/v1/incomes` dan `/api/v1/liabilities`), namun frontend belum memanggil backend Express, melainkan masih query langsung ke Supabase / `localStorage`.
2. **Logika Bisnis Berjalan di Sisi Klien:**
   - Perhitungan status budget harian, rollover/carry-over, amortisasi split budget (`budgetEngine.ts`).
   - Alokasi 50/30/20 dan Financial Health Score (`calculator.ts`).
   - Deteksi outlier transaksi (`outlierEngine.ts`).
3. **Data Statis / Mock:**
   - Rekomendasi kost, meal plan, dan grocery basket di `data/recommendations.ts`.
   - Template item pengeluaran tetap hardcoded di `OnboardingPage.tsx`.
   - File lama tidak terpakai (`pages/Dashboard.tsx`) yang menggunakan `kontor-transactions`.
4. **Mock Fallback di Auth & Subscription:**
   - `SubscriptionContext.tsx` membuat mock snap token dan menyimpan state di `localStorage`.
   - `AuthContext.tsx` membuat mock demo-user di `localStorage`.

---

## 2. Tabel Inventaris Mock Data

| # | File mock / lokasi | Data apa | Dipakai di komponen/halaman | Endpoint pengganti | Status |
|---|---|---|---|---|---|
| 1 | `frontend/src/lib/storage.ts` (didelegasikan ke `transactionApi.ts`) | Daftar transaksi, penambahan, penghapusan, filter per bulan, agregasi spending per kategori | `DashboardPage.tsx`, `TransactionsPage.tsx`, `TransactionForm.tsx`, `TransactionList.tsx`, `CaptureSheet.tsx` | `GET /api/v1/transactions`<br>`POST /api/v1/transactions`<br>`DELETE /api/v1/transactions/:id`<br>`GET /api/v1/transactions/summary` | ✅ Selesai |
| 2 | `frontend/src/pages/Dashboard.tsx` | File legacy `kontor-transactions` | Tidak dipakai di routing aktif | Hapus file / alihkan ke endpoint transaksi | ✅ Selesai (file dihapus) |
| 3 | `frontend/src/lib/storage.ts` → `profileApi.ts` | Profil finansial user (`monthly_salary`, `payday_date`, `fixed_expenses`) | `DashboardPage.tsx`, `OnboardingPage.tsx`, `AllocationPage.tsx`, `RecommendationsPage.tsx`, `TransactionsPage.tsx` | `GET /api/v1/profile`<br>`PUT /api/v1/profile` | ✅ Selesai |
| 4 | `frontend/src/lib/storage.ts` → `budgetApi.ts` | Pengaturan persentase alokasi (50/30/20), flag `carry_over_daily`, dan `month_end_mode` | `DashboardPage.tsx`, `AllocationPage.tsx`, `RecommendationsPage.tsx` | `GET /api/v1/budget/settings`<br>`PUT /api/v1/budget/settings` | ✅ Selesai |
| 5 | `frontend/src/lib/incomeApi.ts` | Data pemasukan, CRUD pemasukan, dan total bulanan | `IncomesPage.tsx`, `DashboardPage.tsx` | `GET /api/v1/incomes`<br>`POST /api/v1/incomes`<br>`PUT /api/v1/incomes/:id`<br>`DELETE /api/v1/incomes/:id`<br>`GET /api/v1/incomes/total` | ✅ Selesai |
| 6 | `frontend/src/lib/liabilityApi.ts` | Data cicilan & paylater, CRUD, dan total bulanan | `LiabilitiesPage.tsx`, `DashboardPage.tsx` | `GET /api/v1/liabilities`<br>`POST /api/v1/liabilities`<br>`PUT /api/v1/liabilities/:id`<br>`DELETE /api/v1/liabilities/:id`<br>`POST /api/v1/liabilities/:id/pay`<br>`GET /api/v1/liabilities/total` | ✅ Selesai |
| 7 | `frontend/src/lib/budgetEngine.ts` | Logika bisnis: siklus gajian, sisa hari, batas harian, carry-over, surplus/defisit | `DashboardPage.tsx` | `GET /api/v1/budget/status` | ✅ Selesai (dipindah ke `budget.service.ts`) |
| 8 | `frontend/src/lib/calculator.ts` | Logika bisnis: alokasi nominal 50/30/20, Financial Health Score, rasio tabungan | `DashboardPage.tsx`, `AllocationPage.tsx`, `RecommendationsPage.tsx` | `GET /api/v1/budget/allocation`<br>`GET /api/v1/analytics/health-score` | ✅ Selesai (dipindah ke `budget.service.ts`) |
| 9 | `frontend/src/lib/outlierEngine.ts` | Deteksi outlier pengeluaran (IQR & threshold) | `TransactionForm.tsx`, `CaptureSheet.tsx` | `POST /api/v1/transactions/check-outlier` | ✅ Selesai (backend `outlier.service.ts`) |
| 10 | `frontend/src/data/recommendations.ts` & `RecommendationsPage.tsx` | Data statis kost tier, meal plan, grocery basket & logika filter tier | `RecommendationsPage.tsx` | `GET /api/v1/recommendations` | ✅ Selesai |
| 11 | `frontend/src/pages/OnboardingPage.tsx` | Template item contoh biaya tetap hardcoded & default input | `OnboardingPage.tsx` | `GET /api/v1/onboarding/defaults`<br>`POST /api/v1/onboarding` | ✅ Selesai (Modul 6) |
| 12 | `frontend/src/contexts/SubscriptionContext.tsx` | Mock Snap Token & fallback `localStorage` | `SubscriptionPage.tsx`, `SubscriptionGate.tsx` | Backend `/api/subscription/status` dan `/api/subscription/simulate-activate` | ✅ Backend-first, localStorage hanya fallback offline |
| 13 | `frontend/src/contexts/AuthContext.tsx` | Sesi demo statis lokal (`demo-user`) | `AuthPage.tsx`, `LandingPage.tsx` | Token demo ter-standarisasi via `apiClient.ts` (`demo-{userId}`) | ✅ Arsitektur sudah benar — demo-user adalah mode offline yang sah |

---

## 3. Rencana Pembagian Modul & Urutan Pengerjaan (Strangler Pattern)

Sesuai prinsip: **satu modul per langkah, test + lint + type check sebelum lanjut.**

### Modul 1: Profil Finansial & Pengaturan Budget (Item #3, #4)
- **Backend:**
  - Tambah router `/api/v1/profile` (GET, PUT) untuk `monthly_salary`, `payday_date`, `fixed_expenses`.
  - Tambah router `/api/v1/budget/settings` (GET, PUT) untuk persentase alokasi & opsi rollover.
  - Tambah schema Supabase jika belum ada / in-memory fallback dev mode.
- **Frontend:**
  - Buat API client `lib/profileApi.ts` dan `lib/budgetApi.ts`.
  - Update `OnboardingPage.tsx` dan `AllocationPage.tsx` untuk memakai API baru.
  - Hapus fungsi profil & budget di `storage.ts`.

### Modul 2: Pemasukan & Cicilan (Item #5, #6)
- **Backend:**
  - Route `/api/v1/incomes` dan `/api/v1/liabilities` sudah ada di backend.
  - Tambah validasi dan pastikan unit test/smoke test lulus.
- **Frontend:**
  - Refactor `lib/incomeApi.ts` dan `lib/liabilityApi.ts` agar melakukan HTTP request ke Express API (`BACKEND_URL/api/v1/...`) dengan `Authorization: Bearer <token>`, bukan langsung query Supabase/localStorage.
  - Update `IncomesPage.tsx` dan `LiabilitiesPage.tsx`.

### Modul 3: Transaksi & Outlier Detection (Item #1, #9)
- **Backend:**
  - Buat `backend/src/routes/transactions.ts`:
    - `GET /api/v1/transactions` (filter per bulan, sorting, pagination).
    - `POST /api/v1/transactions` (validasi amount integer rupiah, auto outlier evaluation via `outlier.service.ts`, penanganan split transaction).
    - `DELETE /api/v1/transactions/:id`.
    - `POST /api/v1/transactions/check-outlier`.
- **Frontend:**
  - Buat `lib/transactionApi.ts` memanggil endpoint backend.
  - Update `TransactionsPage.tsx`, `TransactionForm.tsx`, dan `CaptureSheet.tsx`.
  - Hapus kode transaksi di `storage.ts`.

### Modul 4: Server-Side Financial Business Engine & Analytics (Item #7, #8)
- **Backend:**
  - Pindahkan logika perhitungan dari `budgetEngine.ts` dan `calculator.ts` ke backend: `backend/src/modules/budget/budget.service.ts`.
  - Tambah endpoint:
    - `GET /api/v1/budget/status` (menghitung sisa hari, batas jajan harian, carry-over, cumulative budget, spending today).
    - `GET /api/v1/budget/allocation` (alokasi 50/30/20 nominal berdasarkan income dan fixed expenses).
    - `GET /api/v1/analytics/health-score` (skor kesehatan keuangan 0-100 dan rasio pengeluaran).
- **Frontend:**
  - `DashboardPage.tsx` hanya mengambil data siap saji dari endpoint ini. Hilangkan kalkulasi rumit di `useMemo` client.
  - `AllocationPage.tsx` menggunakan hasil kalkulasi alokasi dari backend.

### Modul 5: Rekomendasi Finansial & Gaya Hidup (Item #10)
- **Backend:**
  - Buat `backend/src/routes/recommendations.ts`:
    - `GET /api/v1/recommendations` (mengembalikan rekomendasi kost, meal plan, dan grocery basket yang sudah dihitung & difilter sesuai gaji profil user).
- **Frontend:**
  - Hubungkan `RecommendationsPage.tsx` ke endpoint backend.
  - Hapus logika kalkulasi tier manual di frontend.

### Modul 6: Pembersihan Sisa Mock & Legacy (Item #2, #11, #12, #13)
- Hapus file dead-code `frontend/src/pages/Dashboard.tsx`.
- Bersihkan fallback `localStorage` di `storage.ts` atau deprecate `storage.ts`.
- Rapikan penanganan token demo di `SubscriptionContext.tsx` dan `AuthContext.tsx`.

---

## 4. Pertanyaan Klarifikasi / Keputusan Desain Sebelum Memulai Fase 1

1. **Rekomendasi Kost & Meal Plan (Item #10):**
   Apakah data rekomendasi kost dan paket makan di `frontend/src/data/recommendations.ts` ingin dipindahkan menjadi data katalog di backend (Express route `/api/v1/recommendations`), di mana backend melakukan penyesuaian tier berdasarkan gaji user?
2. **Template Pengeluaran Tetap di Onboarding (Item #11):**
   Apakah 4 item contoh biaya tetap (Cicilan, BPJS, Kiriman Ortu, Listrik) di `OnboardingPage.tsx` tetap dipertahankan sebagai template form awal di frontend (hanya saat form dibuka pertama kali), lalu ketika disimpan dikirim ke backend API?
3. **Penyimpanan Transaksi & Profil di Backend:**
   Apakah untuk backend kita gunakan tabel Postgres Supabase (`transactions`, `profiles`, `budget_settings`) dengan in-memory store sebagai fallback saat dev offline (pola yang sama seperti `incomes.ts` & `liabilities.ts`), sehingga aplikasi tetap dapat berjalan baik dengan database Supabase maupun saat offline?
