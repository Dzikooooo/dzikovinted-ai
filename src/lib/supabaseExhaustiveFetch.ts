// Chantier #2 (useInsights.ts, 2026-08-28) a introduit ce pattern pour
// contourner le plafond reel de PostgREST/Supabase : un select() sans
// .range() est silencieusement tronque a 1000 lignes des qu'un vendeur
// depasse ce volume. Chantier #3 (2026-08-28) l'etend a DashboardHome.tsx et
// AccountingPage.tsx, qui ont exactement le meme besoin -- des CALCULS
// agreges (chiffre d'affaires, marge, benefice, repartitions) sur
// l'integralite du catalogue, pas une simple liste qu'on peut paginer a
// l'ecran. Extrait ici (3e consommateur reel) plutot que duplique.
export const EXHAUSTIVE_FETCH_CHUNK_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: (rangeStart: number, rangeEnd: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildQuery(offset, offset + EXHAUSTIVE_FETCH_CHUNK_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < EXHAUSTIVE_FETCH_CHUNK_SIZE) return rows;
    offset += EXHAUSTIVE_FETCH_CHUNK_SIZE;
  }
}
