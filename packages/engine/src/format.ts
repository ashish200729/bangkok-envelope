/** `toLocaleString` builds a formatter on every call; messages format dozens of numbers per run. */
const FORMATS = [0, 1, 2].map(
  (digits) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }),
);

/** "27,920", "8.25": thousands separated, at most `digits` decimals (0–2). */
export function formatNumber(value: number, digits: 0 | 1 | 2 = 0): string {
  return (FORMATS[digits] as Intl.NumberFormat).format(value);
}
