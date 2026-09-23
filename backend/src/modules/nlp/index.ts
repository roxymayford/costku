/**
 * NLP module barrel — the single import surface for the transaction parser.
 *
 * Layout:
 *   nlp.constants.ts       taxonomy, statuses, lexicons
 *   nlp.types.ts           shared shapes
 *   nlp.config.ts          env-tunable thresholds
 *   text-normalizer.ts     preprocessing, slang + fuzzy correction
 *   amount.extractor.ts    nominal extraction (§4.3)
 *   multi-item.guard.ts    multi-item gate (§4.2)
 *   item.extractor.ts      item name + brand canonicalisation (§4.4)
 *   category.classifier.ts dictionary classifier (§4.5.A)
 *   transaction.parser.ts  orchestrator (pure, sync, no I/O)
 *   nlp.repository.ts      dictionaries + persistence (§6)
 *   nlp.service.ts         bootstrap + parse-and-persist + corrections
 *
 * Implements Fase 1 of planning-nlp-transaction-parser.md: rule-based only,
 * no training data, no LLM.
 */

export * from './nlp.constants.js';
export * from './nlp.types.js';
export * from './nlp.config.js';
export * from './text-normalizer.js';
export * from './amount.extractor.js';
export * from './multi-item.guard.js';
export * from './item.extractor.js';
export * from './category.classifier.js';
export * from './transaction.parser.js';
export * from './nlp.repository.js';
export * from './nlp.service.js';
export * from './data/slang.dictionary.js';
export * from './data/category-keywords.js';
export * from './data/product.dictionary.js';
export * from './ml.client.js';
