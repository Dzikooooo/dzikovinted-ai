// Conversion explicite Unix seconds (event.created, tel que fourni par
// Stripe) -> timestamptz. Jamais l'entier brut stocke tel quel.
export function stripeEventTimestamp(eventCreatedUnixSeconds: number): Date {
  return new Date(eventCreatedUnixSeconds * 1000);
}

// Garde anti-desordre -- utilise EXCLUSIVEMENT stripe_event_created_at
// (jamais updated_at, qui reste un horodatage de modification de ligne sans
// rapport avec l'horloge Stripe, voir migration 20260808120000).
//
// NULL stocke -> evenement accepte (aucun webhook n'a encore ete traite
// pour cette ligne).
// event.created >= stripe_event_created_at stocke -> accepte.
// event.created <  stripe_event_created_at stocke -> ignore, aucun etat
// modifie.
//
// Le cas "meme timestamp" (evenement rejoue, ou deux evenements distincts
// emis a la meme seconde par Stripe -- possible, pas suppose impossible)
// reste dans la branche ">=" -- IDEMPOTENT parce que l'upsert appele en
// aval ecrit toujours l'etat complet courant, jamais un delta. La
// correction explicite du Lot 3 : ne jamais construire de logique qui
// supposerait deux event.created necessairement distincts.
export function isEventApplicable(storedEventCreatedAt: Date | null, eventCreatedUnixSeconds: number): boolean {
  if (storedEventCreatedAt === null) return true;
  const incoming = stripeEventTimestamp(eventCreatedUnixSeconds);
  return incoming.getTime() >= storedEventCreatedAt.getTime();
}
