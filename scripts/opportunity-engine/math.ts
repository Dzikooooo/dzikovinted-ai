// Dupliqué délibérément de src/lib/insights/math.ts plutôt qu'importé : ce
// module tourne côté Node (scripts/, scan Playwright), l'autre côté
// navigateur (Vite) - deux frontières de build distinctes, pas de partage
// de code entre elles dans ce projet (voir aussi PublishStep/scanSteps pour
// le même choix côté Action Engine).

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Ecart-type / moyenne : mesure de dispersion relative, comparable entre des
// prix de gammes différentes (un écart-type de 20€ n'a pas le même sens sur
// un article à 30€ que sur un article à 300€). Null si la moyenne est nulle
// ou l'échantillon insuffisant pour un écart-type - jamais une division par
// zéro déguisée en "faible dispersion".
export function coefficientOfVariation(values: number[]): number | null {
  const m = mean(values);
  const sd = stdev(values);
  if (m === null || sd === null || m === 0) return null;
  return sd / m;
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (24 * 60 * 60 * 1000);
}

export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function searchKey(brand: string | null | undefined, category: string | null | undefined): string {
  return `${normalizeKey(brand)}|${normalizeKey(category)}`;
}
