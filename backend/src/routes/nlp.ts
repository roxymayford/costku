import { Router, Request, Response, NextFunction } from 'express';
import {
  parseTransactionAsync,
  parseAndPersist,
  submitCorrection,
  nlpModuleInfo,
  checkMlServiceHealth,
  toParsedTransactionResponse,
  TransactionCategory,
  type TransactionCategoryType,
} from '../modules/nlp/index.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const nlpRouter = Router();

/**
 * POST /api/v1/nlp/parse
 * Parse free-text transaction note into structured entities and category.
 * Leverages hybrid inference: Flask ML microservice with auto-fallback to rule-based.
 */
nlpRouter.post('/parse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, useMl } = req.body as { text?: unknown; useMl?: unknown };

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Field "text" string is required',
      });
    }

    const parsed = await parseTransactionAsync(text, {
      useMl: typeof useMl === 'boolean' ? useMl : undefined,
    });

    const response = toParsedTransactionResponse(parsed);
    return res.status(200).json({
      status: 'success',
      data: response,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/nlp/persist
 * Parse and persist a transaction row into database.
 */
nlpRouter.post('/persist', optionalAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { text, userId: bodyUserId, useMl } = req.body as {
      text?: unknown;
      userId?: unknown;
      useMl?: unknown;
    };

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Field "text" string is required',
      });
    }

    const effectiveUserId = req.user?.id || (typeof bodyUserId === 'string' ? bodyUserId : 'anonymous-user');

    const result = await parseAndPersist(effectiveUserId, text, undefined, {
      useMl: typeof useMl === 'boolean' ? useMl : undefined,
    });

    return res.status(201).json({
      status: 'success',
      data: {
        transactionId: result.transactionId,
        ...result.response,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/nlp/correct
 * Submit user category or entity correction to feed training data.
 */
nlpRouter.post('/correct', optionalAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const {
      transactionId,
      correctedCategory,
      correctedItem,
      correctedAmount,
      rawText,
      normalizedText,
      predictedCategory,
    } = req.body as {
      transactionId?: unknown;
      correctedCategory?: unknown;
      correctedItem?: unknown;
      correctedAmount?: unknown;
      rawText?: unknown;
      normalizedText?: unknown;
      predictedCategory?: unknown;
    };

    if (typeof transactionId !== 'string' || !transactionId.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Field "transactionId" is required',
      });
    }

    const validCategories = Object.values(TransactionCategory);
    if (
      typeof correctedCategory !== 'string' ||
      !validCategories.includes(correctedCategory as TransactionCategoryType)
    ) {
      return res.status(400).json({
        status: 'error',
        message: `Field "correctedCategory" must be one of: ${validCategories.join(', ')}`,
      });
    }

    const effectiveUserId = req.user?.id || 'anonymous-user';

    const result = await submitCorrection({
      userId: effectiveUserId,
      transactionId,
      correctedCategory: correctedCategory as TransactionCategoryType,
      correctedItem: typeof correctedItem === 'string' ? correctedItem : undefined,
      correctedAmount: typeof correctedAmount === 'number' ? correctedAmount : undefined,
      parsed: {
        rawText: typeof rawText === 'string' ? rawText : '',
        normalizedText: typeof normalizedText === 'string' ? normalizedText : '',
        itemName: typeof correctedItem === 'string' ? correctedItem : null,
        amount: typeof correctedAmount === 'number' ? correctedAmount : null,
        category: (predictedCategory as TransactionCategoryType) || null,
        categoryConfidence: 0.5,
        extractionMethod: 'rule_based',
        parseStatus: 'auto',
        reasons: [],
        corrections: [],
        matchedKeywords: [],
        brand: null,
        anchor: null,
        multiItemSignals: [],
      },
    });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v1/nlp/info
 * Diagnostics and runtime status for hybrid NLP architecture.
 */
nlpRouter.get('/info', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const info = nlpModuleInfo();
    const mlHealth = await checkMlServiceHealth();

    return res.status(200).json({
      status: 'success',
      data: {
        ...info,
        mlServiceHealth: mlHealth,
      },
    });
  } catch (err) {
    return next(err);
  }
});
