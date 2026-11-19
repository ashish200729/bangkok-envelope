/** Bangkok keeps UTC+7 all year (no daylight saving). */
export const BANGKOK_UTC_OFFSET_H = 7;

const RAD = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export type SunPosition = {
  /** Degrees clockwise from north. */
  azimuthDeg: number;
  /** Degrees above the horizon; negative after sunset. */
  altitudeDeg: number;
};

/** Milliseconds since the epoch for a Bangkok calendar date ("YYYY-MM-DD") and decimal hour. */
export function bangkokTimestamp(date: string, hour: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1) + (hour - BANGKOK_UTC_OFFSET_H) * 3_600_000;
}

/**
 * Low-precision solar position (the Astronomical Almanac's approximation, good to about 0.01°
 * between 1950 and 2050): plenty for lighting and shadows.
 */
export function sunPosition(timestampMs: number, lat: number, lng: number): SunPosition {
  const d = (timestampMs - J2000_MS) / 86_400_000;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(e) * Math.sin(lambda));
  const gmstH = 18.697374558 + 24.06570982441908 * d;
  const hourAngle = (gmstH * 15 + lng) * RAD - ra;
  const phi = lat * RAD;
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    -Math.sin(hourAngle) * Math.cos(dec),
    Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(hourAngle),
  );
  return {
    azimuthDeg: (((azimuth / RAD) % 360) + 360) % 360,
    altitudeDeg: altitude / RAD,
  };
}

type Rgb = [number, number, number];
export type Light = { color: Rgb; intensity: number };
export type SceneLighting = {
  ambient: Light;
  /** The direction light travels (x east, y north, z up), as deck.gl's DirectionalLight wants. */
  sun: Light & { direction: [number, number, number] };
  /** The sun is above the horizon and high enough to cast shadows worth drawing. */
  castsShadows: boolean;
  phase: "day" | "golden" | "dusk" | "night";
};

function directionFrom(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
  const a = azimuthDeg * RAD;
  const h = altitudeDeg * RAD;
  return [-Math.sin(a) * Math.cos(h), -Math.cos(a) * Math.cos(h), -Math.sin(h)];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round((a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t)) as Rgb;
}

const NOON: Rgb = [255, 250, 240];
const LOW_SUN: Rgb = [255, 196, 140];
const DUSK_SKY: Rgb = [176, 184, 214];
const NIGHT_SKY: Rgb = [110, 126, 170];
const MOON: Rgb = [170, 186, 230];

/**
 * Light for a sun position, or for night. After sunset the sun is held just above the horizon
 * with a weak warm light, so the massing still reads instead of going black from below.
 */
export function sceneLighting(sun: SunPosition, night: boolean): SceneLighting {
  if (night) {
    return {
      ambient: { color: NIGHT_SKY, intensity: 0.55 },
      sun: { color: MOON, intensity: 0.35, direction: directionFrom(220, 40) },
      castsShadows: false,
      phase: "night",
    };
  }
  const alt = sun.altitudeDeg;
  if (alt <= 0) {
    return {
      ambient: { color: DUSK_SKY, intensity: 0.75 },
      sun: { color: LOW_SUN, intensity: 0.45, direction: directionFrom(sun.azimuthDeg, 4) },
      castsShadows: false,
      phase: "dusk",
    };
  }
  const warmth = Math.max(0, Math.min(1, (25 - alt) / 22));
  return {
    ambient: {
      color: mix([255, 255, 255], [235, 225, 230], warmth),
      intensity: 1 - 0.12 * warmth,
    },
    sun: {
      color: mix(NOON, LOW_SUN, warmth),
      intensity: 0.95 - 0.25 * warmth,
      direction: directionFrom(sun.azimuthDeg, Math.max(alt, 4)),
    },
    castsShadows: alt > 3,
    phase: warmth > 0.5 ? "golden" : "day",
  };
}

/** "16:00" for 16, "18:30" for 18.5. */
export function formatHour(hour: number): string {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
