/**
 * NLP transaction parser — constants & vocabularies.
 * Mirrors planning-nlp-transaction-parser.md §4.2, §6, §7.
 *
 * The lexicons here are *behavioural* (verbs, connectors, particles,
 * negation triggers). Dictionary *data* (slang, category keywords, brand
 * names) lives in ./data/* so it can be overridden from the database
 * without touching logic.
 */

/* ────────────────────────── Category taxonomy (§7) ────────────────────────── */

export const TransactionCategory = {
  KEBUTUHAN: 'kebutuhan',
  KEINGINAN: 'keinginan',
  DARURAT: 'darurat',
} as const;

export type TransactionCategoryType =
  (typeof TransactionCategory)[keyof typeof TransactionCategory];

/** Canonical iteration order — keeps score objects and logs stable. */
export const TRANSACTION_CATEGORIES: readonly TransactionCategoryType[] = [
  TransactionCategory.KEBUTUHAN,
  TransactionCategory.KEINGINAN,
  TransactionCategory.DARURAT,
];

/**
 * Fallback class when nothing in the sentence carries a category signal.
 * Deliberately `kebutuhan` (the least surprising default for a spending
 * log) — the low confidence that accompanies it always routes the row to
 * manual review, so this is never silently trusted.
 */
export const DEFAULT_CATEGORY: TransactionCategoryType = TransactionCategory.KEBUTUHAN;

/* ────────────────────────── Parse status / method (§6) ────────────────────────── */

export const ParseStatus = {
  /** Parsed end-to-end, safe to persist without human eyes. */
  AUTO: 'auto',
  /** Parsed, but something is uncertain — goes to the review queue. */
  NEEDS_REVIEW: 'needs_review',
  /** More than one item detected — no partial parse, row is a log entry only. */
  REJECTED_MULTI_ITEM: 'rejected_multi_item',
} as const;

export type ParseStatusType = (typeof ParseStatus)[keyof typeof ParseStatus];

export const ExtractionMethod = {
  RULE_BASED: 'rule_based',
  ML_MODEL: 'ml_model',
  MANUAL_OVERRIDE: 'manual_override',
} as const;

export type ExtractionMethodType =
  (typeof ExtractionMethod)[keyof typeof ExtractionMethod];

/**
 * Machine-readable diagnostics. Not in the original column list, but the
 * review queue and the Fase 3 comparison against the ML model both need to
 * know *why* a row landed in `needs_review`, not just that it did.
 */
export const ParseReason = {
  MULTI_ITEM_DETECTED: 'multi_item_detected',
  POSSIBLE_CANCELLATION: 'possible_cancellation',
  MISSING_AMOUNT: 'missing_amount',
  AMOUNT_UNCERTAIN: 'amount_uncertain',
  MISSING_ITEM: 'missing_item',
  UNKNOWN_ITEM: 'unknown_item',
  AMBIGUOUS_KEYWORD: 'ambiguous_keyword',
  LOW_CONFIDENCE: 'low_confidence',
  NO_TRANSACTION_SIGNAL: 'no_transaction_signal',
} as const;

export type ParseReasonType = (typeof ParseReason)[keyof typeof ParseReason];

/** Reasons that always force `needs_review`, regardless of confidence. */
export const REVIEW_FORCING_REASONS: readonly ParseReasonType[] = [
  ParseReason.POSSIBLE_CANCELLATION,
  ParseReason.MISSING_AMOUNT,
  ParseReason.AMOUNT_UNCERTAIN,
  ParseReason.MISSING_ITEM,
  ParseReason.UNKNOWN_ITEM,
  ParseReason.NO_TRANSACTION_SIGNAL,
];

/* ────────────────────────── Multi-item alert copy (§4.2) ────────────────────────── */

/**
 * Shown to the user when the gate fires. Kept here (not in the frontend) so
 * the wording stays in one place and matches the parser's decision exactly.
 */
export const MULTI_ITEM_ALERT = {
  code: 'MULTI_ITEM_DETECTED',
  title: 'Sepertinya ada lebih dari satu transaksi',
  message:
    'Coba input satu transaksi per kalimat ya — misalnya "beli kopi 20rb". ' +
    'Angka yang tercampur bikin kategorinya gampang salah.',
  cta: 'Input ulang',
} as const;

/* ────────────────────────── Lexicons ────────────────────────── */

/**
 * Purchase verbs. Used as (a) the anchor that starts the item phrase and
 * (b) a multi-item signal when two of them appear in one sentence (§4.2).
 *
 * Deliberately narrow. §4.2 names "beli, bayar, checkout"; broader words
 * like `sewa`, `isi` and `langganan` are nouns in the way people actually
 * write ("bayar sewa kost", "isi pulsa"), so counting them as a second verb
 * made `bayar sewa kost 1,5jt` look like two purchases. They still reach the
 * classifier as keywords — they just no longer act as anchors.
 */
export const PURCHASE_VERBS: readonly string[] = [
  'beli',
  'beliin',
  'membeli',
  'dibeli',
  'bayar',
  'bayarin',
  'bayarkan',
  'membayar',
  'checkout',
  'jajan',
  'belanja',
  'traktir',
  'order',
  'pesan',
  'topup',
];

/**
 * Connectives that join two item phrases. Presence *inside* the item span
 * is a multi-item signal (§4.2); presence after the amount is not.
 */
export const ITEM_CONNECTORS: readonly string[] = [
  'dan',
  'sama',
  'plus',
  'terus',
  'juga',
  'serta',
  'sambil',
];

/**
 * Words that terminate the *display* item phrase. "beli obat di ugd 50rb"
 * should store `Obat`, not `Obat Ugd` — the context still feeds the
 * classifier (which reads the whole sentence), so nothing is lost.
 */
export const ITEM_PREPOSITIONS: readonly string[] = [
  'di',
  'ke',
  'dari',
  'buat',
  'untuk',
  'sama',
  'dan',
  'plus',
  'terus',
  'serta',
  'karena',
  'soalnya',
  'gara',
  'pas',
  'sampai',
  'dengan',
  'pakai',
  'sambil',
  'sekitar',
  'per',
];

/** Discourse particles — pure noise inside an item phrase. */
export const ITEM_PARTICLES: readonly string[] = [
  'sih',
  'dong',
  'nih',
  'deh',
  'aja',
  'ajah',
  'doang',
  'udah',
  'sudah',
  'tadi',
  'tuh',
  'ya',
  'yaa',
  'kok',
  'lah',
  'kan',
  'mah',
  'gitu',
  'gini',
  'emang',
  'memang',
  'baru',
  'lagi',
  'abis',
  'habis',
  'malah',
  'banget',
  'bgt',
  'buatku',
  'buat',
  'yg',
  'yang',
];

/**
 * Markers that make an adjacent nominal something *other* than a second
 * item price (§4.2: "bukan cuma harga vs diskon"). Without this, a
 * perfectly normal single purchase with a promo line would trip the gate.
 *
 * Also filtered out of the item phrase: "beli kopi 20rb total 20rb" must
 * not be stored as an item called "Kopi Total".
 */
export const AMOUNT_CONTEXT_MARKERS: readonly string[] = [
  'diskon',
  'potongan',
  'cashback',
  'voucher',
  'promo',
  'hemat',
  'gratis',
  'total',
  'subtotal',
  'jumlah',
];

/**
 * Adverbials that describe *when* something happened, not *what* was bought.
 * Filtered out of the item phrase so "servis motor mendadak 500rb" stores
 * `Servis Motor` rather than `Servis Motor Mendadak`. They keep their full
 * weight in the classifier, which reads the whole sentence.
 */
export const ITEM_CONTEXT_ADVERBS: readonly string[] = [
  'mendadak',
  'dadakan',
  'darurat',
  'urgent',
  'emergency',
  'segera',
];

/** Nominal unit suffixes after normalisation (`ribu`/`juta` → `rb`/`jt`). */
export const AMOUNT_UNIT_MULTIPLIER: Record<string, number> = {
  rb: 1_000,
  k: 1_000,
  jt: 1_000_000,
};

/* ────────────────────────── Spelled-out numbers (§4.3) ────────────────────────── */

/**
 * Number words, shared by the amount extractor and the normaliser.
 *
 * They live here — rather than inside `amount.extractor.ts` — because the
 * normaliser needs to know about them too: fuzzy typo correction must never
 * rewrite a number word. Left unguarded, `juta` snaps to `juga` and
 * `seratus` to `sepatu`, which silently destroys the nominal.
 */
export const NUMBER_WORD_UNITS: Record<string, number> = {
  nol: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
};

/** Multipliers applied to the accumulated group. */
export const NUMBER_WORD_SCALES: Record<string, number> = {
  ribu: 1_000,
  juta: 1_000_000,
};

/** Scale words that carry their own value (`seribu` = 1 × 1000). */
export const NUMBER_WORD_SCALE_PREFIXED: Record<string, number> = {
  seribu: 1_000,
  sejuta: 1_000_000,
};

/** Words that modify the current group (tens, hundreds). */
export const NUMBER_WORD_MODIFIERS: readonly string[] = [
  'sepuluh',
  'sebelas',
  'belas',
  'puluh',
  'ratus',
  'seratus',
];

/** Every token the normaliser must leave alone for nominal parsing to work. */
export const NUMBER_WORDS: ReadonlySet<string> = new Set([
  ...Object.keys(NUMBER_WORD_UNITS),
  ...Object.keys(NUMBER_WORD_SCALES),
  ...Object.keys(NUMBER_WORD_SCALE_PREFIXED),
  ...NUMBER_WORD_MODIFIERS,
]);

/* ────────────────────────── Guards (§11) ────────────────────────── */

/**
 * Cancellation / negation phrasing. Matched against the *normalised* text,
 * so slang (`gajadi`) is listed explicitly alongside its expanded form.
 * A hit does not discard the row — it downgrades it to `needs_review`,
 * because "gajadi beli kopi 20rb" may still be a correction of an earlier
 * entry and a human should decide.
 */
export const CANCELLATION_PATTERNS: readonly RegExp[] = [
  /\btidak\s+jadi\b/,
  /\bbelum\s+jadi\b/,
  /\bbatal\b/,
  /\burung\b/,
  /\bgajadi\b/,
  /\bgajd\b/,
  /\bgak\s+jadi\b/,
  /\bnggak\s+jadi\b/,
];

/** Input longer than this is truncated — a transaction note is never long. */
export const MAX_INPUT_LENGTH = 500;
