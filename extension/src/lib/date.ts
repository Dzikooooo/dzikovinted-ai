// Copie volontaire de src/lib/date.ts (pas de tooling monorepo partage
// entre l'app et l'extension, meme convention que messages.ts/ActionKind).
// `.toISOString().slice(0,10)` prend le jour calendaire UTC, pas le jour
// calendaire local -- une vente detectee tard le soir en France (UTC+1/+2)
// peut s'enregistrer sur le mauvais jour.

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
