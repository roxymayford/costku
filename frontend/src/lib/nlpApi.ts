// ──────────────────────────────────────────────────────────
// costKu — NLP Transaction Parser API Client
// Hybrid Client: Calls backend /api/v1/nlp/parse with local fallback
// ──────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export interface ParsedTransactionResult {
  rawText: string;
  normalizedText: string;
  itemName: string | null;
  amount: number | null;
  category: 'Needs' | 'Wants' | 'Savings';
  nlpCategory: string | null;
  confidence: number;
  extractionMethod: 'rule_based' | 'ml_model' | 'fallback_local';
  parseStatus: 'auto' | 'needs_review' | 'rejected_multi_item';
  reasons: string[];
  alert?: {
    code: string;
    title: string;
    message: string;
    cta: string;
  };
}

/**
 * Map backend 3-class NLP taxonomy to costKu 50/30/20 budget category.
 */
export function mapNlpCategoryToLedger(
  nlpCategory: string | null | undefined,
  text: string = ''
): 'Needs' | 'Wants' | 'Savings' {
  const lower = text.toLowerCase();

  // If text mentions saving/investment terms, prioritize Savings
  if (/(nabung|tabungan|bibit|ajaib|investasi|reksadana|deposito|simpanan|emas|crypto)/i.test(lower)) {
    return 'Savings';
  }

  if (nlpCategory === 'keinginan') {
    return 'Wants';
  }

  if (nlpCategory === 'kebutuhan' || nlpCategory === 'darurat') {
    return 'Needs';
  }

  // Fallback defaults based on common keywords
  if (/(kopi|boba|nongkrong|nonton|bioskop|game|steam|kafe|cafe|jajan|baju|sepatu|liburan)/i.test(lower)) {
    return 'Wants';
  }

  return 'Needs';
}

/**
 * Local fallback parser if backend is offline or unreachable.
 */
export function localFallbackParse(text: string): ParsedTransactionResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Multi-item rough detection
  if (/(sama|dan|\+|,)\s*(juga|beli|bayar|\d+)/i.test(lower) && (lower.match(/\d+/g) || []).length > 1) {
    return {
      rawText: trimmed,
      normalizedText: trimmed,
      itemName: null,
      amount: null,
      category: 'Needs',
      nlpCategory: null,
      confidence: 0,
      extractionMethod: 'fallback_local',
      parseStatus: 'rejected_multi_item',
      reasons: ['multi_item_detected'],
      alert: {
        code: 'MULTI_ITEM_DETECTED',
        title: 'Sepertinya ada lebih dari satu transaksi',
        message: 'Coba input satu per satu ya, misalnya "kopi 20rb".',
        cta: 'Input ulang',
      },
    };
  }

  // Extract amount
  let amount: number | null = null;
  // Match e.g. 20rb, 20k, 1.5jt, 25000, 150.000, Rp 20.000
  const amountMatch = trimmed.match(
    /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|k|ribu|jt|juta)?(?:\b|$)/i
  );

  let cleanItemName = trimmed;

  if (amountMatch) {
    const rawNumStr = amountMatch[1].replace(',', '.');
    const unit = (amountMatch[2] || '').toLowerCase();
    const parsedNum = parseFloat(rawNumStr);

    if (!isNaN(parsedNum)) {
      if (unit === 'jt' || unit === 'juta') {
        amount = Math.round(parsedNum * 1000000);
      } else if (unit === 'rb' || unit === 'k' || unit === 'ribu') {
        amount = Math.round(parsedNum * 1000);
      } else if (parsedNum < 1000 && !amountMatch[0].includes('.')) {
        // e.g. "kopi 25" -> assumed 25rb
        amount = Math.round(parsedNum * 1000);
      } else {
        // e.g. 25000 or 25.000
        amount = Math.round(parseFloat(amountMatch[1].replace(/\./g, '')));
      }
    }

    cleanItemName = trimmed.replace(amountMatch[0], '').trim();
  }

  // Clean item name from common prefixes
  cleanItemName = cleanItemName
    .replace(/^(gua\s+|saya\s+|aku\s+)?(abis\s+|habis\s+|tadi\s+)?(beli\s+|bayar\s+|buat\s+|pesen\s+|order\s+)/i, '')
    .trim();

  // Capitalize item name
  if (cleanItemName) {
    cleanItemName = cleanItemName
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  } else {
    cleanItemName = 'Pengeluaran';
  }

  const category = mapNlpCategoryToLedger(undefined, trimmed);

  return {
    rawText: trimmed,
    normalizedText: trimmed,
    itemName: cleanItemName,
    amount: amount || 0,
    category,
    nlpCategory: category === 'Wants' ? 'keinginan' : 'kebutuhan',
    confidence: amount ? 0.75 : 0.4,
    extractionMethod: 'fallback_local',
    parseStatus: amount ? 'auto' : 'needs_review',
    reasons: amount ? [] : ['missing_amount'],
  };
}

/**
 * Parse free-text transaction note using backend NLP service with fallback.
 */
export async function parseTransactionNote(
  text: string,
  useMl: boolean = true
): Promise<ParsedTransactionResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Teks transaksi tidak boleh kosong');
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/nlp/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: trimmed, useMl }),
    });

    if (!res.ok) {
      console.warn(`[nlpApi] Backend returned ${res.status}, using local fallback parser`);
      return localFallbackParse(trimmed);
    }

    const json = await res.json();
    if (json.status !== 'success' || !json.data) {
      return localFallbackParse(trimmed);
    }

    const d = json.data;
    const category = mapNlpCategoryToLedger(d.category, trimmed);

    return {
      rawText: d.raw_text || trimmed,
      normalizedText: d.normalized_text || trimmed,
      itemName: d.item_name,
      amount: typeof d.amount === 'number' ? d.amount : null,
      category,
      nlpCategory: d.category || null,
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.8,
      extractionMethod: d.extraction_method || 'rule_based',
      parseStatus: d.parse_status || 'auto',
      reasons: Array.isArray(d.reasons) ? d.reasons : [],
      alert: d.alert,
    };
  } catch (err) {
    console.warn('[nlpApi] Fetch error, falling back to local regex parser:', err);
    return localFallbackParse(trimmed);
  }
}
