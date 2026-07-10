// Bornes de date pour le filtre "Aujourd'hui / Cette semaine / Ce mois /
// Tout" du Centre des Actions. Fonction pure (now injecté), pas de
// dépendance à l'horloge système dans les tests.

export type ActionPeriod = 'today' | 'week' | 'month' | 'all';

export interface PeriodRange {
  from: string | null;
  to: string | null;
}

export function computePeriodRange(period: ActionPeriod, now: Date = new Date()): PeriodRange {
  if (period === 'all') return { from: null, to: null };

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'today') {
    return { from: start.toISOString(), to: null };
  }

  if (period === 'week') {
    const day = start.getDay(); // 0 = dimanche
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diffToMonday);
    return { from: start.toISOString(), to: null };
  }

  // month
  start.setDate(1);
  return { from: start.toISOString(), to: null };
}
