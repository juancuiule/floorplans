// Where the sun is, for a local date and time. NOAA's solar calculator
// (Meeus, "Astronomical Algorithms"), good to well under a minute of arc for
// years near 2000 and to a minute or so for sunrise and sunset.
//
// Angles are degrees. Azimuth is a compass bearing: 0 north, 90 east,
// clockwise seen from above. Elevation includes atmospheric refraction.

export interface Place {
  lat: number
  /** East positive. */
  lon: number
  /** Hours from UTC (Buenos Aires: −3 all year, no DST). */
  tz: number
}

export const BUENOS_AIRES: Place = { lat: -34.6037, lon: -58.3816, tz: -3 }

export interface SunPosition {
  azimuth: number
  elevation: number
}

export interface SunTimes {
  /** Minutes after local midnight; NaN when the sun never rises or sets that day. */
  sunrise: number
  sunset: number
  noon: number
}

const RAD = Math.PI / 180
const sin = (d: number) => Math.sin(d * RAD)
const cos = (d: number) => Math.cos(d * RAD)
const tan = (d: number) => Math.tan(d * RAD)
const mod = (a: number, n: number) => ((a % n) + n) % n

/** Julian day for a local date ("YYYY-MM-DD") at a local minute of the day. */
function julianDay(date: string, minutes: number, tz: number): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000 + 2440587.5 + (minutes - tz * 60) / 1440
}

/** Declination (deg) and equation of time (min) at a Julian day. */
function sunCoords(jd: number) {
  const t = (jd - 2451545) / 36525
  const l0 = mod(280.46646 + t * (36000.76983 + t * 0.0003032), 360)
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const c =
    sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + sin(2 * m) * (0.019993 - 0.000101 * t) + sin(3 * m) * 0.000289
  const omega = 125.04 - 1934.136 * t
  const lambda = l0 + c - 0.00569 - 0.00478 * sin(omega)
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * cos(omega)
  const declination = Math.asin(sin(eps) * sin(lambda)) / RAD
  const y = tan(eps / 2) ** 2
  const eqTime =
    (4 / RAD) *
    (y * sin(2 * l0) -
      2 * e * sin(m) +
      4 * e * y * sin(m) * cos(2 * l0) -
      0.5 * y * y * sin(4 * l0) -
      1.25 * e * e * sin(2 * m))
  return { declination, eqTime }
}

/** Refraction lifts the apparent sun near the horizon (NOAA's approximation), in degrees. */
function refraction(elevation: number): number {
  if (elevation > 85) return 0
  const te = tan(elevation)
  let arcsec: number
  if (elevation > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
  else if (elevation > -0.575)
    arcsec = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))
  else arcsec = -20.772 / te
  return arcsec / 3600
}

/** The sun's azimuth and apparent elevation at a local date and minute of the day. */
export function solarPosition(date: string, minutes: number, place: Place = BUENOS_AIRES): SunPosition {
  const { declination: dec, eqTime } = sunCoords(julianDay(date, minutes, place.tz))
  const trueSolar = mod(minutes + eqTime + 4 * place.lon - 60 * place.tz, 1440)
  const hourAngle = trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180
  const cosZenith = Math.min(1, Math.max(-1, sin(place.lat) * sin(dec) + cos(place.lat) * cos(dec) * cos(hourAngle)))
  const zenith = Math.acos(cosZenith) / RAD
  const geometric = 90 - zenith

  const denom = cos(place.lat) * sin(zenith)
  let azimuth: number
  if (Math.abs(denom) < 1e-9) azimuth = place.lat > 0 ? 180 : 0
  else {
    const a = Math.acos(Math.min(1, Math.max(-1, (sin(place.lat) * cosZenith - sin(dec)) / denom))) / RAD
    azimuth = hourAngle > 0 ? mod(a + 180, 360) : mod(540 - a, 360)
  }
  return { azimuth, elevation: geometric + refraction(geometric) }
}

/** Local minutes when the sun's center crosses a zenith angle (90.833° = sunrise/sunset). */
function crossing(date: string, place: Place, rising: boolean, zenith: number): number {
  let minutes = rising ? 360 : 1080
  for (let i = 0; i < 3; i++) {
    const { declination: dec, eqTime } = sunCoords(julianDay(date, minutes, place.tz))
    const cosH = cos(zenith) / (cos(place.lat) * cos(dec)) - tan(place.lat) * tan(dec)
    if (cosH < -1 || cosH > 1) return NaN
    const h = Math.acos(cosH) / RAD
    const noon = 720 - 4 * place.lon - eqTime + place.tz * 60
    minutes = noon + (rising ? -4 : 4) * h
  }
  return minutes
}

/** Sunrise, sunset and solar noon for a local date, in minutes after local midnight. */
export function sunTimes(date: string, place: Place = BUENOS_AIRES): SunTimes {
  const { eqTime } = sunCoords(julianDay(date, 720, place.tz))
  return {
    sunrise: crossing(date, place, true, 90.833),
    sunset: crossing(date, place, false, 90.833),
    noon: 720 - 4 * place.lon - eqTime + place.tz * 60,
  }
}

// ---------- orientation ----------

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type Compass = (typeof COMPASS)[number]

export function compassBearing(c: Compass): number {
  return COMPASS.indexOf(c) * 45
}

/** The nearest compass point to a bearing, or null when it is more than 1° off every one. */
export function compassName(bearing: number): Compass | null {
  const b = mod(bearing, 360)
  const i = Math.round(b / 45) % 8
  return Math.abs(mod(b - i * 45 + 180, 360) - 180) < 1 ? COMPASS[i] : null
}

/** A compass point (N, SW…) or a bearing in degrees; null when it is neither. */
export function parseFacing(s: string | null | undefined): number | null {
  if (!s) return null
  const up = s.trim().toUpperCase() as Compass
  if (COMPASS.includes(up)) return compassBearing(up)
  const n = Number(s)
  return Number.isFinite(n) ? mod(n, 360) : null
}

/**
 * Unit vector toward the sun in plan coordinates (x toward the balcony, z
 * toward the kitchen side, y up) when the balcony — the facade normal, +x —
 * faces the compass bearing `facing`. Seen from above, +x → +z turns
 * clockwise, like compass bearings, so bearing facing + 90° is +z.
 */
export function sunDirection({ azimuth, elevation }: SunPosition, facing: number): [number, number, number] {
  const d = azimuth - facing
  const h = cos(elevation)
  return [cos(d) * h, sin(elevation), sin(d) * h]
}

// ---------- time helpers ----------

/** Today's date in a place's time zone, "YYYY-MM-DD". */
export function todayIn(place: Place = BUENOS_AIRES, now = Date.now()): string {
  return new Date(now + place.tz * 3600000).toISOString().slice(0, 10)
}

export function formatMinutes(minutes: number): string {
  const m = mod(Math.round(minutes), 1440)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** "HH:MM" → minutes after midnight, or null. */
export function parseClock(s: string | null | undefined): number | null {
  const match = s?.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? h * 60 + m : null
}

export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}
