import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { CurrencyInput } from './CurrencyInput';
import { parseTransactionNote, ParsedTransactionResult } from '../lib/nlpApi';
import { formatRupiah } from '../lib/calculator';
import { checkTransactionOutlier, OutlierCheckResult } from '../lib/outlierEngine';
import { OutlierWarning } from './OutlierWarning';
import { stopLenis, startLenis } from '../providers/SmoothScroll';

export interface CaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'quick' | 'manual';
  initialText?: string;
  onAddTransaction: (tx: {
    title: string;
    amount: number;
    category: 'Needs' | 'Wants' | 'Savings';
    transaction_date: string;
    spread_days?: number | null;
    spread_start?: string | null;
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
  { icon: 'coffee' as const, label: 'Kopi 20rb', text: 'kopi kenangan 20rb' },
  { icon: 'utensils' as const, label: 'Padang 25rb', text: 'makan siang nasi padang 25rb' },
  { icon: 'fuel' as const, label: 'Bensin 50rb', text: 'isi bensin pertamax 50rb' },
  { icon: 'cart' as const, label: 'Indomaret 45rb', text: 'belanja indomaret 45rb' },
  { icon: 'bolt' as const, label: 'Token PLN 100rb', text: 'beli token listrik pln 100rb' },
  { icon: 'wallet' as const, label: 'Nabung 200rb', text: 'nabung reksadana bibit 200rb' },
];

export const CaptureSheet: React.FC<CaptureSheetProps> = ({
  isOpen,
  onClose,
  initialTab = 'quick',
  initialText = '',
  onAddTransaction,
  monthlyIncome = 5000000,
  dailyLimit = 150000,
  recentAmounts = [],
}) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'manual'>(initialTab);

  // Quick (NLP) State
  const [nlpText, setNlpText] = useState(initialText);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedTransactionResult | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editCategory, setEditCategory] = useState<'Needs' | 'Wants' | 'Savings'>('Needs');
  const [editDate, setEditDate] = useState(new Date().toISOString().slice(0, 10));

  // Manual Form State
  const [manualTitle, setManualTitle] = useState('');
  const [manualAmount, setManualAmount] = useState<number>(0);
  const [manualCategory, setManualCategory] = useState<'Needs' | 'Wants' | 'Savings'>('Needs');
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSplit, setIsSplit] = useState(false);
  const [spreadDays, setSpreadDays] = useState<number>(14);

  // Common State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOutlier, setPendingOutlier] = useState<OutlierCheckResult | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Mobile Bottom Sheet expand state ("naikin" sheet)
  const [isExpanded, setIsExpanded] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const handleHandlebarTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleHandlebarTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (diff < -25) {
      // Swipe UP: expand to full screen ("naikin")
      setIsExpanded(true);
    } else if (diff > 45) {
      // Swipe DOWN: collapse or close
      if (isExpanded) {
        setIsExpanded(false);
      } else {
        onClose();
      }
    }
  };

  const handleInputFocus = () => {
    // Only auto-expand on mobile viewports (< 768px)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsExpanded(true);
    }
  };

  const nlpInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Sync tab and initial text when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setIsExpanded(false);
      if (initialText) {
        setNlpText(initialText);
      }
      setFeedback(null);
      setPendingOutlier(null);
      // Only auto-focus on desktop to prevent mobile keyboard layout jumps upon opening sheet
      if (window.innerWidth >= 768) {
        setTimeout(() => {
          if (initialTab === 'quick') {
            nlpInputRef.current?.focus();
          } else {
            manualInputRef.current?.focus();
          }
        }, 120);
      }
    }
  }, [isOpen, initialTab, initialText]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Bulletproof mobile scroll lock: freeze body with position fixed & pause Lenis so dashboard never scrolls
  useEffect(() => {
    if (isOpen) {
      stopLenis();
      const scrollY = window.scrollY;
      const prevOverflow = document.body.style.overflow;
      const prevPosition = document.body.style.position;
      const prevTop = document.body.style.top;
      const prevWidth = document.body.style.width;

      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        document.body.style.overflow = prevOverflow;
        document.body.style.position = prevPosition;
        document.body.style.top = prevTop;
        document.body.style.width = prevWidth;
        window.scrollTo(0, scrollY);
        startLenis();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // NLP Parse Handler
  const handleParse = async (textToParse?: string) => {
    const text = (textToParse !== undefined ? textToParse : nlpText).trim();
    if (!text) {
      setFeedback({
        type: 'warning',
        message: 'Ketik transaksi terlebih dahulu (contoh: "kopi 25rb")',
      });
      return;
    }

    setIsParsing(true);
    setFeedback(null);
    setParsedData(null);
    setPendingOutlier(null);

    try {
      const result = await parseTransactionNote(text);
      setParsedData(result);
      setEditTitle(result.itemName || text);
      setEditAmount(result.amount || 0);
      setEditCategory(result.category);
      setEditDate(new Date().toISOString().slice(0, 10));

      if (result.amount && result.amount > 0) {
        const outlierCheck = checkTransactionOutlier({
          amount: result.amount,
          monthlyIncome,
          dailyLimit,
          recentAmounts,
        });

        if (outlierCheck.isOutlier) {
          setPendingOutlier(outlierCheck);
        }
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menganalisis catatan. Coba ketik dengan kalimat sederhana.',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const executeSaveNlp = async (outlierMeta?: {
    is_outlier: boolean;
    outlier_level: 'hard' | 'soft' | null;
    outlier_reason: string | null;
    confirmed_by_user: boolean;
  }) => {
    const titleToSave = editTitle.trim();
    const amountToSave = Number(editAmount) || 0;

    if (!titleToSave || amountToSave <= 0) return;

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

    setIsSubmitting(true);
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

      setFeedback({
        type: 'success',
        message: `Tersimpan: ${titleToSave} (${formatRupiah(amountToSave)})`,
      });

      setPendingOutlier(null);
      setTimeout(() => {
        setParsedData(null);
        setNlpText('');
        onClose();
      }, 700);
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyimpan transaksi. Silakan coba lagi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeSaveManual = async (outlierMeta?: {
    is_outlier: boolean;
    outlier_level: 'hard' | 'soft' | null;
    outlier_reason: string | null;
    confirmed_by_user: boolean;
  }) => {
    const titleToSave = manualTitle.trim();
    const amountToSave = Number(manualAmount) || 0;

    if (!titleToSave || amountToSave <= 0) return;

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

    setIsSubmitting(true);
    try {
      await onAddTransaction({
        title: titleToSave,
        amount: amountToSave,
        category: manualCategory,
        transaction_date: manualDate,
        spread_days: isSplit && spreadDays > 1 ? spreadDays : null,
        spread_start: isSplit && spreadDays > 1 ? manualDate : null,
        is_outlier: outlierMeta?.is_outlier || false,
        outlier_level: outlierMeta?.outlier_level || null,
        outlier_reason: outlierMeta?.outlier_reason || null,
        confirmed_by_user: outlierMeta?.confirmed_by_user || false,
      });

      setFeedback({
        type: 'success',
        message: `Tersimpan: ${titleToSave} (${formatRupiah(amountToSave)})`,
      });

      setPendingOutlier(null);
      setTimeout(() => {
        setManualTitle('');
        setManualAmount(0);
        setIsSplit(false);
        onClose();
      }, 700);
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyimpan transaksi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="capture-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Catat Transaksi"
      data-lenis-prevent
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className={`capture-sheet-modal ${isExpanded ? 'expanded' : ''}`}
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        {/* MOBILE HANDLEBAR / DRAG HANDLE ("HAMBURGER" HANDLE) */}
        <div
          className="capture-sheet-handlebar-wrap"
          aria-label="Tarik ke atas untuk memperluas sheet"
          onTouchStart={handleHandlebarTouchStart}
          onTouchEnd={handleHandlebarTouchEnd}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <div className="capture-sheet-handlebar" />
          <span className="capture-sheet-handlebar-hint">
            {isExpanded ? 'Geser ke bawah untuk memperkecil' : 'Tarik ke atas untuk memperbesar'}
          </span>
        </div>

        {/* HEADER & TABS */}
        <div className="capture-sheet-header">
          <div className="capture-sheet-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'quick'}
              className={`capture-tab-btn ${activeTab === 'quick' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('quick');
                setFeedback(null);
                setPendingOutlier(null);
              }}
            >
              <Icon name="sparkle" size={14} /> CATAT CEPAT (AI)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'manual'}
              className={`capture-tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('manual');
                setFeedback(null);
                setPendingOutlier(null);
              }}
            >
              <Icon name="plus" size={14} /> MANUAL
            </button>
          </div>

          <button
            type="button"
            className="capture-sheet-close-btn"
            onClick={onClose}
            aria-label="Tutup formulir"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* FEEDBACK BANNER */}
        {feedback && (
          <div className={`capture-feedback-banner ${feedback.type}`}>
            <span>{feedback.message}</span>
          </div>
        )}

        {/* TAB BODY */}
        <div className="capture-sheet-body" data-lenis-prevent>
          {activeTab === 'quick' ? (
            /* QUICK NLP TAB */
            <div className="capture-nlp-section">
              <div className="capture-nlp-input-row">
                <input
                  ref={nlpInputRef}
                  type="text"
                  className="capture-nlp-input"
                  placeholder="Ketik pengeluaran (misal: kopi kenangan 25rb)..."
                  value={nlpText}
                  onFocus={handleInputFocus}
                  onChange={(e) => setNlpText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isParsing) {
                      e.preventDefault();
                      handleParse();
                    }
                  }}
                  disabled={isParsing || isSubmitting}
                />
                <button
                  type="button"
                  className="capture-nlp-submit-btn"
                  onClick={() => handleParse()}
                  disabled={isParsing || !nlpText.trim()}
                >
                  {isParsing ? 'Menganalisis…' : 'Proses'}
                </button>
              </div>

              {/* QUICK CHIP PRESETS */}
              <div className="capture-presets-wrap">
                <span className="capture-presets-label">Sering dicatat:</span>
                <div className="capture-presets-scroll">
                  {PRESET_SUGGESTIONS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="capture-preset-chip"
                      onClick={() => {
                        setNlpText(preset.text);
                        handleParse(preset.text);
                      }}
                    >
                      <Icon name={preset.icon} size={12} />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* PARSED RESULT PREVIEW */}
              {parsedData && (
                <div className="capture-parsed-card">
                  <div className="capture-parsed-title-row">
                    <small className="accent">HASIL DETEKSI AI</small>
                    <span className="capture-confidence-tag">
                      Akurasi {(parsedData.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="capture-parsed-fields-grid">
                    <label className="capture-field">
                      <span>Untuk apa?</span>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </label>
                    <label className="capture-field">
                      <span>Nominal</span>
                      <CurrencyInput
                        value={editAmount}
                        onChange={setEditAmount}
                        placeholder="0"
                      />
                    </label>
                    <label className="capture-field">
                      <span>Kategori</span>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as any)}
                        className="category-select"
                      >
                        <option value="Needs">Kebutuhan (Pokok)</option>
                        <option value="Wants">Keinginan (Jajan/Lifestyle)</option>
                        <option value="Savings">Tabungan</option>
                      </select>
                    </label>
                    <label className="capture-field">
                      <span>Tanggal</span>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="transaction-date-input"
                      />
                    </label>
                  </div>

                  <div className="capture-parsed-actions">
                    <button
                      type="button"
                      className="capture-cancel-btn"
                      onClick={() => setParsedData(null)}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className="capture-save-btn"
                      onClick={() => executeSaveNlp()}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Menyimpan…' : 'Simpan Transaksi'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* MANUAL FORM TAB */
            <form
              className="capture-manual-form"
              onSubmit={(e) => {
                e.preventDefault();
                executeSaveManual();
              }}
            >
              <label className="capture-field">
                <span>UNTUK APA?</span>
                <input
                  ref={manualInputRef}
                  type="text"
                  placeholder="Contoh: Makan siang / Token PLN"
                  value={manualTitle}
                  onFocus={handleInputFocus}
                  onChange={(e) => setManualTitle(e.target.value)}
                  required
                />
              </label>

              <label className="capture-field">
                <span>BERAPA NOMINALNYA?</span>
                <CurrencyInput
                  value={manualAmount}
                  onChange={setManualAmount}
                  placeholder="0"
                  required
                />
              </label>

              <div className="capture-split-fields-row">
                <label className="capture-field">
                  <span>KATEGORI</span>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value as any)}
                    className="category-select"
                  >
                    <option value="Needs">Kebutuhan (Pokok)</option>
                    <option value="Wants">Keinginan (Jajan)</option>
                    <option value="Savings">Tabungan</option>
                  </select>
                </label>

                <label className="capture-field">
                  <span>TANGGAL</span>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="transaction-date-input"
                    required
                  />
                </label>
              </div>

              {/* SPLIT BUDGET ACCORDION */}
              <div className="capture-split-budget-box">
                <label className="capture-split-toggle">
                  <input
                    type="checkbox"
                    checked={isSplit}
                    onChange={(e) => setIsSplit(e.target.checked)}
                  />
                  <span>Bagi pemakaian ke beberapa hari? (Split Budget)</span>
                </label>

                {isSplit && (
                  <div className="capture-split-controls">
                    <span className="capture-split-sub">Masa pemakaian:</span>
                    <input
                      type="number"
                      min="2"
                      max="90"
                      value={spreadDays}
                      onChange={(e) => setSpreadDays(Math.max(2, parseInt(e.target.value) || 2))}
                      style={{ width: '60px', padding: '4px 8px', border: '1px solid var(--line)' }}
                    />
                    <span className="capture-split-sub">
                      hari ({formatRupiah(Math.round(manualAmount / Math.max(2, spreadDays)))}/hari)
                    </span>
                  </div>
                )}
              </div>

              <div className="capture-parsed-actions">
                <button
                  type="button"
                  className="capture-cancel-btn"
                  onClick={onClose}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="capture-save-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Menyimpan…' : 'Simpan Transaksi'}
                </button>
              </div>
            </form>
          )}

          {/* OUTLIER CONFIRMATION MODAL OVERLAY */}
          {pendingOutlier && (
            <OutlierWarning
              title={activeTab === 'quick' ? editTitle : manualTitle}
              amount={activeTab === 'quick' ? editAmount : manualAmount}
              reason={pendingOutlier.reason || 'Nominal pengeluaran ini sangat besar dibanding batas harian.'}
              level={pendingOutlier.level || 'soft'}
              onConfirm={() => {
                const meta = {
                  is_outlier: true,
                  outlier_level: pendingOutlier.level || null,
                  outlier_reason: pendingOutlier.reason || null,
                  confirmed_by_user: true,
                };
                if (activeTab === 'quick') {
                  executeSaveNlp(meta);
                } else {
                  executeSaveManual(meta);
                }
              }}
              onCancel={() => setPendingOutlier(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
