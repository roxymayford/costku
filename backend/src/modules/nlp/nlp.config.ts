/**
 * NLP parser configuration, read from environment variables.
 * Same shape as `otp.config.ts` so ops only has one pattern to learn.
 *
 * All values have working defaults — the parser must run with an empty
 * environment (Fase 1 is offline/on-device by design, §5).
 */

import { DEFAULT_CATEGORY, TransactionCategoryType } from './nlp.constants.js';

function readFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const nlpConfig = {
  /**
   * Minimum confidence for `parse_status = auto` (§9 Fase 4).
   * Below this the row goes to the review queue instead.
   */
  get confidenceThreshold(): number {
    return clamp(readFloat('NLP_CONFIDENCE_THRESHOLD', 0.7), 0, 1);
  },

  /**
   * Ceiling applied when the only evidence is ambiguous keywords
   * ("beli obat" with no emergency signal). Kept below the threshold on
   * purpose — an ambiguous sentence can never auto-approve itself.
   */
  get ambiguousConfidenceCap(): number {
    return clamp(readFloat('NLP_AMBIGUOUS_CONFIDENCE_CAP', 0.45), 0, 1);
  },

  /** Confidence assigned when no keyword matched at all. */
  get unknownItemConfidence(): number {
    return clamp(readFloat('NLP_UNKNOWN_ITEM_CONFIDENCE', 0.25), 0, 1);
  },

  /** Fuzzy typo correction master switch (NLP_FUZZY_ENABLED). */
  get fuzzyEnabled(): boolean {
    return readBool('NLP_FUZZY_ENABLED', true);
  },

  /** Edit distance allowed for tokens of 4–5 characters. */
  get fuzzyMaxDistanceShort(): number {
    return clamp(readInt('NLP_FUZZY_MAX_DISTANCE_SHORT', 1), 0, 3);
  },

  /** Edit distance allowed for tokens of 6+ characters. */
  get fuzzyMaxDistanceLong(): number {
    return clamp(readInt('NLP_FUZZY_MAX_DISTANCE_LONG', 2), 0, 3);
  },

  /** Tokens shorter than this are never fuzzy-corrected. */
  get fuzzyMinTokenLength(): number {
    return clamp(readInt('NLP_FUZZY_MIN_TOKEN_LENGTH', 4), 2, 10);
  },

  /** Class used when nothing matched. */
  get defaultCategory(): TransactionCategoryType {
    return DEFAULT_CATEGORY;
  },
} as const;

/** Snapshot for the `/api/health` payload. */
export function nlpRuntimeInfo() {
  return {
    engine: 'classical-rule-based',
    confidenceThreshold: nlpConfig.confidenceThreshold,
    ambiguousConfidenceCap: nlpConfig.ambiguousConfidenceCap,
    fuzzyCorrection: nlpConfig.fuzzyEnabled,
    fuzzyMaxDistance: {
      short: nlpConfig.fuzzyMaxDistanceShort,
      long: nlpConfig.fuzzyMaxDistanceLong,
    },
  };
}
