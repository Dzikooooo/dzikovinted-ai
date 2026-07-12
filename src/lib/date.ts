// `.toISOString().slice(0,10)` prend le jour calendaire UTC, pas le jour
// calendaire local -- une vente faite tard le soir en France (UTC+1/+2)
// peut s'enregistrer sur le mauvais jour. Ces deux fonctions manipulent
// systematiquement le jour calendaire LOCAL de l'utilisateur.

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Instant ISO correspondant a minuit heure locale du jour de `d` -- utile
// pour comparer une borne de date locale contre une colonne timestamptz
// (`.gte(...)`) plutot qu'une colonne `date` (comparee via
// toLocalDateString ci-dessus).
export function startOfLocalDayISO(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return local.toISOString();
}
