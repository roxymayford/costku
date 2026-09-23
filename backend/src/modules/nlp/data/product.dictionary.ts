/**
 * Product / brand dictionary (§4.4 option 2).
 *
 * Turns a messy item phrase into a canonical name: `kopi kenagan` →
 * `Kopi Kenangan`. Matching is longest-alias-first over token sequences, so
 * `grab food` wins over `grab` when both are present.
 *
 * `aliases` are lowercase and must be token-aligned (no punctuation).
 * Brand tokens also feed the normaliser vocabulary, which is what lets
 * fuzzy correction fix typos like `kenagan` → `kenangan`.
 *
 * Seed only — `public.product_dictionary` can extend it at runtime.
 */

import { TransactionCategory } from '../nlp.constants.js';
import type { ProductEntry } from '../nlp.types.js';

export const PRODUCT_DICTIONARY: ProductEntry[] = [
  {
    name: 'Kopi Kenangan',
    aliases: ['kopi kenangan', 'kenangan', 'kopken'],
    categoryHint: TransactionCategory.KEINGINAN,
  },
  {
    name: 'Janji Jiwa',
    aliases: ['janji jiwa', 'jiwa'],
    categoryHint: TransactionCategory.KEINGINAN,
  },
  {
    name: 'Tomoro Coffee',
    aliases: ['tomoro coffee', 'tomoro'],
    categoryHint: TransactionCategory.KEINGINAN,
  },
  {
    name: 'Starbucks',
    aliases: ['starbucks', 'starbuck', 'sbux'],
    categoryHint: TransactionCategory.KEINGINAN,
  },
  { name: 'Mixue', aliases: ['mixue'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Chatime', aliases: ['chatime'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Indomie', aliases: ['indomie'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Indomaret', aliases: ['indomaret', 'indomart'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Alfamart', aliases: ['alfamart', 'alfamidi'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Superindo', aliases: ['superindo'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Gojek', aliases: ['gojek', 'go jek', 'gofood', 'go food'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Grab', aliases: ['grab', 'grabfood', 'grab food'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'GoPay', aliases: ['gopay', 'go pay'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'OVO', aliases: ['ovo'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Shopee', aliases: ['shopee', 'shopee food', 'shopeefood'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Tokopedia', aliases: ['tokopedia', 'tokped'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Netflix', aliases: ['netflix'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Spotify', aliases: ['spotify'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Disney+ Hotstar', aliases: ['disney plus', 'disney hotstar', 'disney'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Vidio', aliases: ['vidio'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'KFC', aliases: ['kfc'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'McDonald\'s', aliases: ['mcdonald', 'mcdonalds', 'mcd'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Burger King', aliases: ['burger king'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'HokBen', aliases: ['hokben', 'hoka hoka bento'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Solaria', aliases: ['solaria'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Warteg', aliases: ['warteg', 'warung tegal'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Pertamina', aliases: ['pertamina'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Apotek K-24', aliases: ['apotek k24', 'k24'], categoryHint: TransactionCategory.KEBUTUHAN },
  { name: 'Mobile Legends', aliases: ['mobile legends', 'mlbb'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Free Fire', aliases: ['free fire'], categoryHint: TransactionCategory.KEINGINAN },
  { name: 'Genshin Impact', aliases: ['genshin impact', 'genshin'], categoryHint: TransactionCategory.KEINGINAN },
];
