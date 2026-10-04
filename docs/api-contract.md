# Kontrak API costKu (Fase 1)

> Dokumen spesifikasi kontrak API Express backend untuk menggantikan seluruh mock data & logika bisnis di frontend.
> Format response standar:
> - Sukses: `{ "status": "success", "data": ... }`
> - Gagal / Validasi: `{ "status": "fail", "message": "...", "errors"?: [...] }`
> - Server Error: `{ "status": "error", "message": "..." }`
> 
> Semua endpoint privat wajib menyertakan header:
> `Authorization: Bearer <token>`
> `user_id` selalu diambil dari token via middleware `requireAuth`, bukan dari parameter request.
> Semua nilai mata uang (rupiah) adalah bilangan bulat non-negatif (`integer`), bukan float.

---

## 1. Modul Profil Finansial (`/api/v1/profile`)

### 1.1 Ambil Profil Finansial
- **Method & Path:** `GET /api/v1/profile`
- **Auth:** Wajib
- **Response 200:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Budi Santoso",
    "monthly_salary": 6000000,
    "payday_date": 25,
    "fixed_expenses": 1200000,
    "created_at": "2026-10-01T00:00:00.000Z",
    "updated_at": "2026-10-01T00:00:00.000Z"
  }
}
```

### 1.2 Update Profil Finansial
- **Method & Path:** `PUT /api/v1/profile`
- **Auth:** Wajib
- **Request Body:**
```json
{
  "name": "Budi Santoso",
  "monthly_salary": 6000000,
  "payday_date": 25,
  "fixed_expenses": 1200000
}
```
- **Validasi:**
  - `monthly_salary`: integer >= 0
  - `payday_date`: integer 1–31
  - `fixed_expenses`: integer >= 0
- **Response 200:** Data profil yang telah diperbarui.

---

## 2. Modul Pengaturan Budget (`/api/v1/budget/settings`)

### 2.1 Ambil Pengaturan Budget
- **Method & Path:** `GET /api/v1/budget/settings`
- **Auth:** Wajib
- **Response 200:**
```json
{
  "status": "success",
  "data": {
    "needs_percentage": 50,
    "wants_percentage": 30,
    "savings_percentage": 20,
    "carry_over_daily": true,
    "month_end_mode": "carry_over"
  }
}
```

### 2.2 Simpan Pengaturan Budget
- **Method & Path:** `PUT /api/v1/budget/settings`
- **Auth:** Wajib
- **Request Body:**
```json
{
  "needs_percentage": 50,
  "wants_percentage": 30,
  "savings_percentage": 20,
  "carry_over_daily": true,
  "month_end_mode": "carry_over"
}
```
- **Validasi:**
  - `needs_percentage + wants_percentage + savings_percentage === 100`
  - Setiap persentase 0–100 integer
  - `month_end_mode` in `['carry_over', 'savings', 'reset']`
- **Response 200:** Pengaturan budget yang telah disimpan.

---

## 3. Modul Pemasukan (`/api/v1/incomes`)

### 3.1 Daftar Pemasukan
- **Method & Path:** `GET /api/v1/incomes?month=YYYY-MM`
- **Auth:** Wajib
- **Query Params:** `month` (opsional, format YYYY-MM)
- **Response 200:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "gaji",
      "label": "Gaji Bulanan",
      "amount": 5500000,
      "date": "2026-10-25",
      "is_recurring": true,
      "frequency": "monthly",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### 3.2 Tambah Pemasukan
- **Method & Path:** `POST /api/v1/incomes`
- **Request Body:**
```json
{
  "type": "freelance",
  "label": "Projek Web",
  "amount": 1500000,
  "date": "2026-10-10",
  "is_recurring": false,
  "frequency": null
}
```

### 3.3 Update & Hapus Pemasukan
- `PUT /api/v1/incomes/:id`
- `DELETE /api/v1/incomes/:id`
- `GET /api/v1/incomes/total?month=YYYY-MM`

---

## 4. Modul Cicilan & Paylater (`/api/v1/liabilities`)

### 4.1 Daftar Cicilan
- **Method & Path:** `GET /api/v1/liabilities?status=active|all`
- **Auth:** Wajib
- **Response 200:** List data cicilan.

### 4.2 Tambah, Update, Hapus, Bayar
- `POST /api/v1/liabilities`
- `PUT /api/v1/liabilities/:id`
- `DELETE /api/v1/liabilities/:id`
- `POST /api/v1/liabilities/:id/pay`
- `GET /api/v1/liabilities/total` (menghitung total beban cicilan bulanan aktif)

---

## 5. Modul Transaksi & Outlier (`/api/v1/transactions`)

### 5.1 Ambil Daftar Transaksi
- **Method & Path:** `GET /api/v1/transactions?month=YYYY-MM&limit=50&offset=0`
- **Auth:** Wajib
- **Response 200:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "title": "Makan Siang Nasi Padang",
      "amount": 35000,
      "category": "Needs",
      "transaction_date": "2026-10-04",
      "created_at": "2026-10-04T08:00:00.000Z",
      "spread_days": null,
      "spread_start": null,
      "is_outlier": false,
      "outlier_level": null,
      "outlier_reason": null,
      "confirmed_by_user": false
    }
  ],
  "meta": {
    "totalCount": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### 5.2 Tambah Transaksi
- **Method & Path:** `POST /api/v1/transactions`
- **Auth:** Wajib
- **Request Body:**
```json
{
  "title": "Belanja Mingguan Supermarket",
  "amount": 450000,
  "category": "Needs",
  "transaction_date": "2026-10-04",
  "spread_days": 7,
  "spread_start": "2026-10-04",
  "confirmed_by_user": false
}
```
- **Validasi:**
  - `title`: string non-empty
  - `amount`: integer > 0
  - `category`: 'Needs' | 'Wants' | 'Savings'
  - `transaction_date`: 'YYYY-MM-DD'
- **Fitur Otomatis Backend:**
  - Backend menjalankan `evaluateTransactionOutlier` untuk menandai `is_outlier`, `outlier_level`, `outlier_reason`.
  - Jika outlier hard dan `confirmed_by_user !== true`, kembalikan alert/peringatan atau simpan dengan status unconfirmed.

### 5.3 Cek Outlier Transaksi (Pre-check)
- **Method & Path:** `POST /api/v1/transactions/check-outlier`
- **Auth:** Wajib
- **Request Body:** `{ "amount": 2500000, "category": "Wants" }`
- **Response 200:**
```json
{
  "status": "success",
  "data": {
    "isOutlier": true,
    "level": "hard",
    "reason": "Nominal transaksi melebihi 80% gaji bulanan.",
    "threshold": 4000000,
    "suggestions": ["add_liability", "confirm"]
  }
}
```

### 5.4 Hapus Transaksi & Summary
- `DELETE /api/v1/transactions/:id`
- `GET /api/v1/transactions/summary?month=YYYY-MM`
  - Mengembalikan `{ totalSpent, byCategory: { Needs: number, Wants: number, Savings: number } }`

---

## 6. Modul Server-Side Financial Engine & Analytics (`/api/v1/budget` & `/api/v1/analytics`)

### 6.1 Status Budget Harian & Rollover
- **Method & Path:** `GET /api/v1/budget/status?targetDate=YYYY-MM-DD`
- **Auth:** Wajib
- **Response 200:**
```json
{
  "status": "success",
  "data": {
    "totalIncome": 6000000,
    "totalFixed": 1500000,
    "savingsTarget": 900000,
    "disposableMonthly": 3600000,
    "daysInCycle": 30,
    "currentDayIndex": 10,
    "daysRemaining": 21,
    "baseDailyLimit": 120000,
    "availableTodayInitial": 150000,
    "spentTodayEffective": 45000,
    "spentTodayReal": 45000,
    "remainingToday": 105000,
    "cumulativeSpent": 950000,
    "cumulativeBudget": 1200000,
    "yesterdaySurplus": 250000,
    "hasSurplus": true,
    "hasDeficit": false,
    "isOverToday": false
  }
}
```

### 6.2 Alokasi 50/30/20
- **Method & Path:** `GET /api/v1/budget/allocation`
- **Auth:** Wajib
- **Response 200:**
```json
{
  "status": "success",
  "data": {
    "effectiveIncome": 6000000,
    "totalFixed": 1500000,
    "netDisposable": 4500000,
    "needsAmount": 2250000,
    "wantsAmount": 1350000,
    "savingsAmount": 900000,
    "percentages": { "needs": 50, "wants": 30, "savings": 20 },
    "dailyLimit": 120000,
    "daysInCycle": 30
  }
}
```

### 6.3 Skor Kesehatan Finansial
- **Method & Path:** `GET /api/v1/analytics/health-score`
- **Auth:** Wajib
- **Response 200:**
```json
{
  "status": "success",
  "data": {
    "healthScore": 85,
    "savingsRatio": 22.5,
    "wantsRatio": 28.0,
    "needsRatio": 49.5,
    "isOverWants": false,
    "actualNeeds": 1500000,
    "actualWants": 800000,
    "actualSavings": 700000,
    "totalSpent": 3000000
  }
}
```

---

## 7. Modul Rekomendasi Gaya Hidup (`/api/v1/recommendations`)

### 7.1 Rekomendasi Kost, Makanan & Belanja
- **Method & Path:** `GET /api/v1/recommendations`
- **Auth:** Wajib
- **Response 200:**
```json
{
  "status": "success",
  "data": {
    "salary": 6000000,
    "maxRentBudget": 1500000,
    "recommendedKostTier": {
      "id": "kost-standard",
      "tierName": "Kost Standard AC",
      "minSalary": 3000000,
      "maxSalary": 6000000,
      "estimatedPrice": { "min": 1000000, "max": 1500000 },
      "facilities": ["Kamar Mandi Dalam", "AC", "WiFi"],
      "description": "Kost dengan fasilitas lengkap termasuk AC..."
    },
    "allKostTiers": [...],
    "mealPlans": [...],
    "groceryBaskets": [...]
  }
}
```
