import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { CurrencyInput } from '../components/CurrencyInput';
import { getProfile, upsertProfile } from '../lib/storage';
import { formatRupiah } from '../lib/calculator';

interface FixedExpenseItem {
  id: string;
  name: string;
  amount: number;
}

export const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [salary, setSalary] = useState<number>(5500000);
  const [paydayDate, setPaydayDate] = useState<number>(25);
  const [expenseItems, setExpenseItems] = useState<FixedExpenseItem[]>([
    { id: '1', name: 'Cicilan / Utang', amount: 500000 },
    { id: '2', name: 'Iuran BPJS / Asuransi', amount: 150000 },
    { id: '3', name: 'Bantuan Keluarga / Kiriman Ortu', amount: 500000 },
    { id: '4', name: 'Tagihan Listrik & WiFi', amount: 350000 },
  ]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    // Load existing profile if available
    getProfile(user.id).then((profile) => {
      if (profile && profile.monthly_salary > 0) {
        setSalary(profile.monthly_salary);
        setPaydayDate(profile.payday_date || 25);
      }
    });
  }, [user, navigate]);

  const totalFixedExpenses = expenseItems.reduce((acc, curr) => acc + curr.amount, 0);
  const disposablePool = Math.max(0, salary - totalFixedExpenses);
  // Simulation: 20% savings target
  const simulatedSavings = disposablePool * 0.2;
  const simulatedDailyLimit = Math.max(0, (disposablePool - simulatedSavings) / 30);

  const addExpenseItem = () => {
    if (!newItemName.trim() || newItemAmount <= 0) return;
    setExpenseItems([
      ...expenseItems,
      { id: Date.now().toString(), name: newItemName.trim(), amount: newItemAmount },
    ]);
    setNewItemName('');
    setNewItemAmount(0);
  };

  const removeExpenseItem = (id: string) => {
    setExpenseItems(expenseItems.filter((item) => item.id !== id));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (salary <= 0) return;

    setIsSaving(true);
    try {
      await upsertProfile({
        id: user.id,
        name: user.name || 'Pengguna costKu',
        monthly_salary: salary,
        payday_date: paydayDate,
        fixed_expenses: totalFixedExpenses,
      });

      navigate('/dashboard');
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="onboarding-page-wrap">
      <header className="onboarding-header">
        <div className="brand">
          <span className="avatar">FA</span>
          <b>COSTKU</b>
          <i>/</i>
          <span>ATUR PROFIL KEUANGAN</span>
        </div>
        <button type="button" className="nav-link" onClick={() => navigate('/dashboard')}>
          <span className="inline-flex items-center gap-1.5">Lewati ke dashboard <Icon name="arrowRight" size={14} /></span>
        </button>
      </header>

      <main className="onboarding-container">
        <div className="onboarding-intro">
          <small className="accent">Langkah 1 dari 1 · Atur sekali saja</small>
          <h1>Atur gajimu, biar kami hitung sisanya.</h1>
          <p>
            Masukkan gaji bersih, tanggal gajian, dan biaya tetap bulananmu.
            Setelah itu costKu otomatis menghitung batas jajan harian dan pembagian gajimu.
          </p>
        </div>

        <form className="onboarding-grid" onSubmit={handleSaveProfile}>
          {/* LEFT: FORM INPUTS */}
          <div className="onboarding-inputs-column">
            {/* 1. GAJI */}
            <div className="setup-card">
              <small className="accent">01 / Gaji bulanan</small>
              <h3>Berapa gaji bersihmu per bulan?</h3>
              <p>Gaji bersih yang benar-benar masuk ke rekening (setelah pajak dan potongan).</p>

              <CurrencyInput
                value={salary}
                onChange={setSalary}
                placeholder="Contoh: 5.500.000"
                required
              />

              <div className="quick-salary-presets">
                <span>Pilih cepat:</span>
                {[3000000, 5000000, 7500000, 10000000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`preset-btn ${salary === val ? 'active' : ''}`}
                    onClick={() => setSalary(val)}
                  >
                    {formatRupiah(val)}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. SIKLUS GAJIAN */}
            <div className="setup-card">
              <small className="accent">02 / Tanggal gajian</small>
              <h3>Tanggal berapa kamu gajian?</h3>
              <p>Setiap tanggal ini, anggaran bulan baru akan dimulai.</p>

              <div className="payday-selector-wrap">
                <label>
                  Tanggal gajian:
                  <select
                    value={paydayDate}
                    onChange={(e) => setPaydayDate(Number(e.target.value))}
                    className="payday-dropdown"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        Tanggal {day} setiap bulan
                      </option>
                    ))}
                  </select>
                </label>
                <small className="muted-text">
                  Kebanyakan perusahaan gajian antara tanggal 25 sampai 28.
                </small>
              </div>
            </div>

            {/* 3. FIXED EXPENSES */}
            <div className="setup-card">
              <div className="flex-between">
                <div>
                  <small className="accent">03 / Biaya tetap</small>
                  <h3>Pengeluaran wajib tiap bulan</h3>
                </div>
                <strong className="accent-total">{formatRupiah(totalFixedExpenses)}</strong>
              </div>
              <p>
                Cicilan, BPJS, kiriman ke orang tua, internet, dan kewajiban bulanan lain —
                di luar sewa kost dan uang jajan.
              </p>

              <div className="expense-items-list">
                {expenseItems.map((item) => (
                  <div key={item.id} className="expense-item-row">
                    <div>
                      <b>{item.name}</b>
                    </div>
                    <div className="item-row-right">
                      <strong>{formatRupiah(item.amount)}</strong>
                      <button
                        type="button"
                        className="delete-item-btn"
                        onClick={() => removeExpenseItem(item.id)}
                        aria-label={`Hapus ${item.name}`}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ADD NEW FIXED EXPENSE */}
              <div className="add-expense-bar">
                <input
                  type="text"
                  placeholder="Nama pengeluaran (misal: Langganan Spotify)"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
                <CurrencyInput
                  value={newItemAmount}
                  onChange={setNewItemAmount}
                  placeholder="Nominal"
                />
                <button type="button" className="tag-btn active" onClick={addExpenseItem}>
                  <Icon name="plus" size={13} /> Tambah
                </button>
              </div>
            </div>

            <button type="submit" className="pill dark submit-setup-btn" disabled={isSaving}>
              {isSaving ? 'Menyimpan…' : <span className="inline-flex items-center gap-1.5">Simpan &amp; Buka Dashboard <Icon name="arrowRight" size={14} /></span>}
            </button>
          </div>

          {/* RIGHT: LIVE CALCULATION PREVIEW */}
          <aside className="onboarding-preview-column terminal">
            <div className="terminal-head">
              <span className="terminal-pulse" aria-hidden="true" /> HASIL OTOMATIS
              <span>TERHITUNG LANGSUNG</span>
            </div>

            <div className="terminal-body">
              <div className="worth terminal-card">
                <span className="terminal-scan" />
                <small>PERKIRAAN BATAS JAJAN HARIAN</small>
                <strong>{formatRupiah(simulatedDailyLimit)} <small>/ hari</small></strong>
                <span>Dihitung dari gaji bersih − biaya tetap − tabungan 20%, dibagi 30 hari</span>
              </div>

              <div className="twins terminal-card">
                <div>
                  <small>GAJI BERSIH</small>
                  <b>{formatRupiah(salary)}</b>
                  <span>Gajian tiap tanggal {paydayDate}</span>
                </div>
                <div>
                  <small>TOTAL BIAYA TETAP</small>
                  <b className="red-text">{formatRupiah(totalFixedExpenses)}</b>
                  <span>{salary > 0 ? ((totalFixedExpenses / salary) * 100).toFixed(1) : 0}% dari gaji</span>
                </div>
              </div>

              <div className="allocation terminal-card">
                <small>UANG BEBAS SETELAH BIAYA TETAP</small>
                <div style={{ margin: '10px 0' }}>
                  <strong style={{ fontSize: '24px' }}>{formatRupiah(disposablePool)}</strong>
                </div>
                <span>
                  Target tabungan 20% <b>{formatRupiah(simulatedSavings)}</b>
                  <i><em style={{ width: '20%', backgroundColor: '#008547' }} /></i>
                </span>
                <span>
                  Batas sewa kost (25% gaji) <b>{formatRupiah(salary * 0.25)}</b>
                  <i><em style={{ width: '25%', backgroundColor: 'var(--orange)' }} /></i>
                </span>
              </div>
            </div>

            <div className="terminal-foot">
              DATA SIAP DISIMPAN <b className="green">OTOMATIS TERISI</b>
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
};
