/**
 * ML Service Client — connects Express backend to the Flask ML microservice.
 *
 * Implements resilient remote inference:
 *  - Configurable endpoint via ML_SERVICE_URL
 *  - Strict timeout (1500ms default) via AbortController
 *  - Graceful degradation: returns null on failure so the caller seamlessly
 *    falls back to the rule-based keyword classifier.
 */

import { ExtractionMethod, TransactionCategory, type TransactionCategoryType } from './nlp.constants.js';

export interface MlPredictionResult {
  category: TransactionCategoryType;
  confidence: number;
  probabilities?: Record<string, number>;
  model_version?: string;
  extraction_method: typeof ExtractionMethod.ML_MODEL;
}

export interface MlServiceHealth {
  ok: boolean;
  url: string;
  enabled: boolean;
  modelLoaded?: boolean;
  metadata?: Record<string, unknown>;
  error?: string;
}

/** Get the configured ML microservice URL */
export function getMlServiceUrl(): string {
  return process.env.ML_SERVICE_URL || 'http://localhost:5001';
}

/** Check if ML classifier is globally enabled */
export function isMlClassifierEnabled(): boolean {
  return process.env.ENABLE_ML_CLASSIFIER !== 'false';
}

/**
 * Predict transaction category via Flask ML microservice.
 * Returns null if the service is unreachable, disabled, or encounters an error.
 */
export async function predictCategoryWithML(
  text: string,
  options: { timeoutMs?: number } = {}
): Promise<MlPredictionResult | null> {
  if (!isMlClassifierEnabled()) {
    return null;
  }

  const timeoutMs = options.timeoutMs ?? 1500;
  const baseUrl = getMlServiceUrl().replace(/\/+$/, '');
  const url = `${baseUrl}/predict`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[costKu ML Client] ML service returned status ${response.status} from ${url}`);
      return null;
    }

    const data = (await response.json()) as {
      category?: string;
      confidence?: number;
      probabilities?: Record<string, number>;
      model_version?: string;
    };

    if (!data || !data.category) {
      return null;
    }

    // Validate category against taxonomy
    const validCategories = Object.values(TransactionCategory);
    if (!validCategories.includes(data.category as TransactionCategoryType)) {
      console.warn(`[costKu ML Client] Invalid category returned by ML model: ${data.category}`);
      return null;
    }

    return {
      category: data.category as TransactionCategoryType,
      confidence: typeof data.confidence === 'number' ? Math.round(data.confidence * 100) / 100 : 0.85,
      probabilities: data.probabilities,
      model_version: data.model_version,
      extraction_method: ExtractionMethod.ML_MODEL,
    };
  } catch (err: unknown) {
    // Graceful fallback — network failure, timeout, or service down
    const msg = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[costKu ML Client] Fallback to rule-based: ${msg}`);
    }
    return null;
  }
}

/** Check health and model status of the Flask ML service */
export async function checkMlServiceHealth(): Promise<MlServiceHealth> {
  const url = getMlServiceUrl();
  const enabled = isMlClassifierEnabled();

  if (!enabled) {
    return { ok: false, url, enabled: false, error: 'ML classifier disabled via ENABLE_ML_CLASSIFIER=false' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${url.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return { ok: false, url, enabled: true, error: `Health check returned HTTP ${response.status}` };
    }

    const body = (await response.json()) as {
      status?: string;
      model_loaded?: boolean;
      metadata?: Record<string, unknown>;
    };

    return {
      ok: body.status === 'ok',
      url,
      enabled: true,
      modelLoaded: body.model_loaded,
      metadata: body.metadata,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      url,
      enabled: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
