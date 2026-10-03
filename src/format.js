// Locale-aware number formatting for coins (○): "2.5" in English, "2,5" in Russian.
export const fmtCoins = (n, lng = 'en') =>
  new Intl.NumberFormat(lng, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
