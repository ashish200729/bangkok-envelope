const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const formatM2 = (m2: number) => `${NUMBER.format(m2)} m²`;
export const formatM = (m: number) => `${ONE_DECIMAL.format(m)} m`;
/** Whole degrees; 359.6 shows as 0°, not 360°. */
export const formatDeg = (deg: number) => `${NUMBER.format(Math.round(deg) % 360)}°`;

/**
 * Thai land units, as on a Thai title deed: 1 rai = 4 ngan = 400 square wah = 1,600 m².
 * e.g. 5,520 m² → "3 rai 1 ngan 80 sq. wah".
 */
export function formatThaiLandArea(m2: number): string {
  const totalWah = Math.round(m2 / 4);
  const rai = Math.floor(totalWah / 400);
  const ngan = Math.floor((totalWah % 400) / 100);
  const wah = totalWah % 100;
  const parts = [rai && `${rai} rai`, ngan && `${ngan} ngan`, wah && `${wah} sq. wah`].filter(
    Boolean,
  );
  return parts.length ? parts.join(" ") : "0 sq. wah";
}
