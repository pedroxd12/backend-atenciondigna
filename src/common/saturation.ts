export type SaturationLevel = 'bajo' | 'medio' | 'alto' | 'critico';

export function levelFromMinutes(min: number): SaturationLevel {
  if (min <= 10) return 'bajo';
  if (min <= 20) return 'medio';
  if (min <= 35) return 'alto';
  return 'critico';
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}
