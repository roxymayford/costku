/**
 * Slang / abbreviation dictionary (§4.1).
 *
 * Alias → canonical, both lowercase. **Values must be single words** — the
 * normaliser keeps token positions aligned with the original input, and a
 * multi-word expansion would break that.
 *
 * Only genuine *rewrites* live here. Identity entries (`kopi → kopi`) are
 * pointless: any word that needs protecting from fuzzy correction is already
 * covered by the vocabulary built in `buildNormalizerDictionary()`.
 *
 * This is the *seed*. At runtime the rows from `public.slang_dictionary`
 * are merged on top (§6), so the table can grow without a redeploy.
 */
export const SLANG_DICTIONARY: Record<string, string> = {
  /* ── pronouns ── */
  gua: 'saya',
  gue: 'saya',
  gw: 'saya',
  aku: 'saya',
  ane: 'saya',
  sy: 'saya',

  /* ── negation ── */
  ga: 'tidak',
  gak: 'tidak',
  gk: 'tidak',
  ngga: 'tidak',
  nggak: 'tidak',
  engga: 'tidak',
  enggak: 'tidak',
  tdk: 'tidak',
  tak: 'tidak',
  bkn: 'bukan',

  /* ── verbs ── */
  abis: 'habis',
  abiss: 'habis',
  hbs: 'habis',
  beliin: 'beli',
  bl: 'beli',
  byr: 'bayar',
  ngebayar: 'bayar',
  blj: 'belanja',
  ngopi: 'kopi',
  nyari: 'cari',
  pake: 'pakai',
  pk: 'pakai',
  dpt: 'dapat',
  mnt: 'minta',
  service: 'servis',

  /* ── time / connectives ── */
  udah: 'sudah',
  udh: 'sudah',
  dah: 'sudah',
  blm: 'belum',
  belom: 'belum',
  jd: 'jadi',
  jdi: 'jadi',
  klo: 'kalau',
  kalo: 'kalau',
  klu: 'kalau',
  krn: 'karena',
  karna: 'karena',
  tp: 'tapi',
  tpi: 'tapi',
  sm: 'sama',
  ama: 'sama',
  trs: 'terus',
  trus: 'terus',
  yg: 'yang',
  dgn: 'dengan',
  utk: 'untuk',
  skrg: 'sekarang',
  skrng: 'sekarang',
  dl: 'dulu',
  hr: 'hari',
  tmn: 'teman',
  org: 'orang',
  brg: 'barang',

  /* ── intensity / quantity ── */
  bgt: 'banget',
  bgd: 'banget',
  byk: 'banyak',
  ckp: 'cukup',
  emg: 'memang',
  emang: 'memang',

  /* ── daily items & money ── */
  kos: 'kost',
  parkiran: 'parkir',
  shampoo: 'sampo',
  duit: 'uang',
  duid: 'uang',
  mkn: 'makan',
  nongki: 'nongkrong',
  subs: 'langganan',
};
