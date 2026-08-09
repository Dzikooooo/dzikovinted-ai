// Conversion explicite Unix seconds (event.created, tel que fourni par
// Stripe) -> timestamptz. Jamais l'entier brut stocke tel quel.
//
// L'anti-desordre lui-meme (P1-2, audit pre-lancement Stripe LIVE
// 2026-08-09) vit desormais entierement dans la clause WHERE de la fonction
// SQL apply_subscription_event (migration 20260809100000) -- ce module ne
// contient plus qu'une conversion pure, la decision "evenement applicable
// ou non" est prise atomiquement au moment de l'ecriture en base, jamais
// par un SELECT-puis-decision cote application (l'ancienne isEventApplicable
// de ce fichier, non atomique, a ete retiree).
export function stripeEventTimestamp(eventCreatedUnixSeconds: number): Date {
  return new Date(eventCreatedUnixSeconds * 1000);
}
