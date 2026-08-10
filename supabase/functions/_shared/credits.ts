// Extrait de analyze-clothing/index.ts (Lot 3, Programme Beta ResellOS,
// 2026-08-10) pour rendre isMetered testable sans monter tout le monolithe
// Deno.serve -- meme convention que plans.ts (fonctions pures, sans effet
// de bord, testables en Deno test standard).
//
// La decision reste entierement cote serveur : cette fonction ne lit que
// des valeurs deja recuperees depuis profiles via le client authentifie
// (jamais une valeur envoyee par le client dans le body de la requete).
// profiles.credits_mode = 'unlimited' ne modifie jamais profiles.credits
// (le solde reel) -- voir 20260810100000_add_beta_program_status.sql.

export interface CreditsProfile {
  plan: string;
  role: string;
  credits_mode: string;
}

// Matrice attendue (Lot 3) :
// - free + standard   -> true  (consomme normalement)
// - free + unlimited  -> false (aucune reservation/consommation)
// - pro/team          -> false (inchange, deja illimite par le plan)
// - admin             -> false (inchange)
export function isMetered(profile: CreditsProfile): boolean {
  if (profile.plan !== "free") return false;
  if (profile.role === "admin") return false;
  if (profile.credits_mode === "unlimited") return false;
  return true;
}
