/** Built once: these run for every line of every design on each edit. */
const SIGNIFICANT = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "฿2.48 bn", "฿330 m", "฿12,500", "−฿1.2 bn": three significant figures from a million up. */
export function formatTHB(value: number): string {
  const sign = value < 0 ? "−" : "";
  const n = Math.abs(value);
  if (n >= 999_500_000) return `${sign}฿${SIGNIFICANT.format(n / 1e9)} bn`;
  if (n >= 999_500) return `${sign}฿${SIGNIFICANT.format(n / 1e6)} m`;
  return `${sign}฿${WHOLE.format(n)}`;
}

/** "฿35,000 per m²". */
export function formatTHBPerM2(value: number): string {
  return `${formatTHB(value)} per m²`;
}

/** "฿2.8 m per sq wah" (1 sq wah = 4 m²). */
export function formatTHBPerSqWah(value: number): string {
  return `${formatTHB(value)} per sq wah`;
}
