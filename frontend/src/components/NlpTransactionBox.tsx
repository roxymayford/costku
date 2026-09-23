import React, { useState, useRef } from 'react';
import { Icon } from './Icon';
import { parseTransactionNote, ParsedTransactionResult } from '../lib/nlpApi';
import { formatRupiah } from '../lib/calculator';
import { checkTransactionOutlier, OutlierCheckResult } from '../lib/outlierEngine';
import { OutlierWarning } from './OutlierWarning';

interface NlpTransactionBoxProps {
  onAddTransaction: (tx: {
    title: string;
    amount: number;
    category: 'Needs' | 'Wants' | 'Savings';
    transaction_date: string;
    is_outlier?: boolean;
    outlier_level?: 'hard' | 'soft' | null;
    outlier_reason?: string | null;
    confirmed_by_user?: boolean;
  }) => Promise<void> | void;
  monthlyIncome?: number;
  dailyLimit?: number;
  recentAmounts?: number[];
}

const PRESET_SUGGESTIONS = [
  { icon: 'coffee' as const, label: 'Kopi Kenangan 20rb', text: 'kopi kenangan 20rb' },
  { icon: 'utensils' as const, label: 'Makan Padang 25rb', text: 'makan siang nasi padang 25rb' },
  { icon: 'fuel' as const, label: 'Bensin 50rb', text: 'isi bensin pertamax 50rb' },
  { icon: 'film' as const, label: 'Nonton XXI 65rb', text: 'nonton bioskop xxi 65rb' },
  { icon: 'bolt' as const, label: 'Token PLN 100rb', text: 'beli token listrik pln 100rb' },
  { icon: 'wallet' as const, label: 'Nabung Bibit 200rb', text: 'nabung reksadana bibit 200rb' },
];

export const NlpTransactionBox: React.FC<NlpTransactionBoxProps> = ({
  onAddTransaction,
  monthlyIncome = 5000000,
  dailyLimit = 150000,
  recentAmounts = [],
}) => {
  const [inputText, setInputText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedTransactionResult | null>(null);

  // Editable parsed values
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editCategory, setEditCategory] = useState<'Needs' | 'Wants' | 'Savings'>('Needs');
  const [editDate, setEditDate] = useState(new Date().toISOString().slice(0, 10));

  // Notification status
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // Outlier detection state
  const [pendingOutlier, setPendingOutlier] = useState<OutlierCheckResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleParse = async (textToParse?: string) => {
    const text = (textToParse !== undefined ? textToParse : inputText).trim();
    if (!text) {
      setFeedback({
        type: 'warning',
        title: 'Input Kosong',
        message: 'Silakan ketik transaksi terlebih dahulu (contoh: "kopi kenangan 20rb").',
      });
      return;
    }

    setIsParsing(true);
    setFeedback(null);
    setParsedData(null);

    try {
      const result = await parseTransactionNote(text);
      setParsedData(result);

      if (result.parseStatus === 'rejected_multi_item') {
        setFeedback({
          type: 'warning',
          title: result.alert?.title || 'Deteksi Lebih dari Satu Transaksi',
          message:
            result.alert?.message ||
            'Mohon input satu transaksi per kalimat (misal: "beli kopi 20rb") agar pencatatan akurat.',
        });
        return;
      }

      if (!result.amount || result.amount <= 0) {
        setFeedback({
          type: 'warning',
          title: 'Nominal Belum Terdeteksi',
          message: 'Nominal uang tidak ditemukan. Silakan lengkapi nominal di bawah sebelum menyimpan.',
        });
      }

      setEditTitle(result.itemName || text);
      setEditAmount(result.amount || 0);
      setEditCategory(result.category);
      setEditDate(new Date().toISOString().slice(0, 10));
    } catch (err) {
      console.error('NLP Parse error:', err);
      setFeedback({
        type: 'error',
        title: 'Gagal Memproses',
        message: 'Terjadi kendala saat menganalisis kalimat. Silakan coba lagi atau gunakan input manual.',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleApplyPreset = (presetText: string) => {
    setInputText(presetText);
    handleParse(presetText);
  };

  const handleSaveTransaction = async (outlierMeta?: {
    is_outlier: boolean;
    outlier_level: 'hard' | 'soft' | null;
    outlier_reason: string | null;
    confirmed_by_user: boolean;
  }) => {
    const titleToSave = editTitle.trim();
    const amountToSave = Number(editAmount) || 0;

    if (!titleToSave) {
      setFeedback({
        type: 'warning',
        title: 'Nama Pengeluaran Kosong',
        message: 'Silakan isi nama pengeluaran sebelum menyimpan.',
      });
      return;
    }

    if (amountToSave <= 0) {
      setFeedback({
        type: 'warning',
        title: 'Nominal Tidak Valid',
        message: 'Nominal harus lebih besar dari Rp 0.',
      });
      return;
    }

    // Outlier check if not already confirmed
    if (!outlierMeta) {
      const outlierCheck = checkTransactionOutlier({
        amount: amountToSave,
        monthlyIncome,
        dailyLimit,
        recentAmounts,
      });

      if (outlierCheck.isOutlier) {
        setPendingOutlier(outlierCheck);
        return;
      }
    }

    setIsSaving(true);
    try {
      await onAddTransaction({
        title: titleToSave,
        amount: amountToSave,
        category: editCategory,
        transaction_date: editDate,
        is_outlier: outlierMeta?.is_outlier || false,
        outlier_level: outlierMeta?.outlier_level || null,
        outlier_reason: outlierMeta?.outlier_reason || null,
        confirmed_by_user: outlierMeta?.confirmed_by_user || false,
      });

      const categoryLabel =
        editCategory === 'Needs' ? 'Kebutuhan' : editCategory === 'Wants' ? 'Keinginan' : 'Tabungan';

      setFeedback({
        type: 'success',
        title: 'Berhasil Dicatat!',
        message: `"${titleToSave}" (${formatRupiah(amountToSave)} · ${categoryLabel}) telah masuk ke pembukuan.`,
      });

      // Reset input and parsed state
      setInputText('');
      setParsedData(null);
      setPendingOutlier(null);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (err) {
      console.error('Failed to save NLP transaction:', err);
      setFeedback({
        type: 'error',
        title: 'Gagal Menyimpan',
        message: 'Terjadi kesalahan saat menyimpan transaksi ke database.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmOutlier = async () => {
    if (!pendingOutlier) return;
    await handleSaveTransaction({
      is_outlier: true,
      outlier_level: pendingOutlier.level,
      outlier_reason: pendingOutlier.reason,
      confirmed_by_user: true,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (parsedData && parsedData.parseStatus !== 'rejected_multi_item') {
        handleSaveTransaction();
      } else {
        handleParse();
      }
    }
  };

  const handleReset = () => {
    setInputText('');
    setParsedData(null);
    setFeedback(null);
  };

  return (
    <>
      <section className="dashboard-nlp-strip">
        <div className="nlp-strip-content">
          <div className="nlp-strip-header">
            <div className="nlp-tag-row">
              <span className="nlp-pill-badge">
                <Icon name="sparkle" size={13} className="nlp-icon-sparkle" />
                <span>SMART NLP AI INPUT</span>
              </span>
              <span className="nlp-tag-hint">Deteksi Cepat Bahasa Sehari-hari</span>
            </div>
            <h3 className="nlp-strip-title">Catat Pengeluaran dengan Bahasa Alami</h3>
            <p className="nlp-strip-desc">
              Ketik santai seperti pesan WhatsApp — AI langsung mendeteksi nama barang, nominal rupiah, dan kategorinya secara instan.
            </p>
          </div>

          {/* Main Input Row */}
          <div className="nlp-input-form">
            <div className="nlp-input-wrapper">
              <span className="nlp-input-icon">
                <Icon name="bolt" size={16} />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Contoh: kopi kenangan 20rb / makan nasi padang 25rb / bensin 50rb / bayar wifi 350rb..."
                className="nlp-text-input"
                disabled={isParsing || isSaving}
                autoComplete="off"
              />
              {inputText && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="nlp-clear-btn"
                  title="Hapus input"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>

            <div className="nlp-actions-row">
              <button
                type="button"
                onClick={() => handleParse()}
                disabled={isParsing || !inputText.trim()}
                className="nlp-parse-btn"
              >
                {isParsing ? (
                  <>
                    <span className="nlp-spinner" />
                    <span>Menganalisis…</span>
                  </>
                ) : (
                  <>
                    <Icon name="sparkle" size={14} />
                    <span>Deteksi Pengeluaran</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preset Suggestions Chips */}
          <div className="nlp-suggestions-bar">
            <span className="nlp-suggestions-label">Coba klik contoh:</span>
            <div className="nlp-suggestions-list">
              {PRESET_SUGGESTIONS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset.text)}
                  className="nlp-chip-btn"
                  disabled={isParsing}
                >
                  <Icon name={preset.icon} size={12} /> {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback message banner */}
          {feedback && (
            <div className={`nlp-alert-banner nlp-alert--${feedback.type}`}>
              <div className="nlp-alert-icon">
                {feedback.type === 'success' && <Icon name="check" size={16} />}
                {feedback.type === 'warning' && <Icon name="alert" size={16} />}
                {feedback.type === 'error' && <Icon name="x" size={16} />}
              </div>
              <div className="nlp-alert-body">
                <strong>{feedback.title}</strong>
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                className="nlp-alert-close"
                onClick={() => setFeedback(null)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          )}

          {/* Parsed Result Preview Card */}
          {parsedData && parsedData.parseStatus !== 'rejected_multi_item' && (
            <div className="nlp-preview-card">
              <div className="nlp-preview-top">
                <div className="nlp-preview-badge-group">
                  <span className="nlp-status-pill nlp-status--success">
                    <Icon name="check" size={12} /> Terdeteksi Otomatis
                  </span>
                  <span className="nlp-method-pill">
                    <Icon name={parsedData.extractionMethod === 'ml_model' ? 'brain' : parsedData.extractionMethod === 'rule_based' ? 'bolt' : 'search'} size={12} />
                    {' '}
                    {parsedData.extractionMethod === 'ml_model'
                      ? 'ML Model Classifier'
                      : parsedData.extractionMethod === 'rule_based'
                      ? 'Classical NLP Engine'
                      : 'Local Parser'}
                    {parsedData.confidence > 0 && ` (${Math.round(parsedData.confidence * 100)}%)`}
                  </span>
                </div>
                <small className="nlp-preview-tip">
                  Periksa atau ubah data sebelum disimpan ke pembukuan
                </small>
              </div>

              <div className="nlp-preview-fields-grid">
                {/* Field 1: Item Name */}
                <div className="nlp-preview-field">
                  <label>UNTUK APA?</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Nama transaksi"
                    className="nlp-field-input"
                  />
                </div>

                {/* Field 2: Amount */}
                <div className="nlp-preview-field">
                  <label>NOMINAL (RP)</label>
                  <div className="nlp-amount-box">
                    <input
                      type="number"
                      value={editAmount || ''}
                      onChange={(e) => setEditAmount(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="nlp-field-input nlp-amount-input"
                    />
                    <span className="nlp-amount-formatted">
                      {formatRupiah(editAmount)}
                    </span>
                  </div>
                </div>

                {/* Field 3: Category */}
                <div className="nlp-preview-field">
                  <label>KATEGORI 50/30/20</label>
                  <div className="nlp-category-toggle">
                    <button
                      type="button"
                      onClick={() => setEditCategory('Needs')}
                      className={`nlp-cat-btn ${editCategory === 'Needs' ? 'active-needs' : ''}`}
                    >
                      Kebutuhan (50%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCategory('Wants')}
                      className={`nlp-cat-btn ${editCategory === 'Wants' ? 'active-wants' : ''}`}
                    >
                      Keinginan (30%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCategory('Savings')}
                      className={`nlp-cat-btn ${editCategory === 'Savings' ? 'active-savings' : ''}`}
                    >
                      Tabungan (20%)
                    </button>
                  </div>
                </div>

                {/* Field 4: Date */}
                <div className="nlp-preview-field">
                  <label>TANGGAL</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="nlp-field-input"
                  />
                </div>
              </div>

              <div className="nlp-preview-footer">
                <button
                  type="button"
                  onClick={handleReset}
                  className="nlp-cancel-btn"
                  disabled={isSaving}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTransaction()}
                  disabled={isSaving || !editTitle.trim() || editAmount <= 0}
                  className="nlp-confirm-btn"
                >
                  {isSaving ? (
                    <>
                      <span className="nlp-spinner" />
                      <span>Menyimpan…</span>
                    </>
                  ) : (
                    <>
                      <Icon name="plus" size={14} />
                      <span>Simpan ke Transaksi ({formatRupiah(editAmount)})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* OUTLIER CONFIRMATION MODAL */}
      {pendingOutlier && (
        <OutlierWarning
          title={editTitle}
          amount={editAmount}
          reason={pendingOutlier.reason || 'Nominal pengeluaran ini sangat besar dibanding batas harian.'}
          level={pendingOutlier.level || 'soft'}
          onConfirm={handleConfirmOutlier}
          onCancel={() => setPendingOutlier(null)}
        />
      )}
    </>
  );
};
