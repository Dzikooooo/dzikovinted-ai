// Extrait de sync.ts (mission "brouillon fantome", 2026-08-11) : logique pure,
// sans dependance chrome/supabase, pour rester testable directement --
// importer sync.ts dans un test declenche createClient() au chargement du
// module (supabaseClient.ts), qui appelle aussitot chrome.storage.local.get
// et echoue hors service worker (voir enrichListing.test.ts).

export function deriveResellOsStatus(vintedStatus: string): "draft" | "en_stock" | "vendu" {
  if (vintedStatus === "sold_completed") return "vendu";
  if (vintedStatus === "draft") return "draft";
  return "en_stock";
}

// Bug reel confirme en test live (2026-08-11, mission "brouillon fantome") :
// `status` (colonne ResellOS interne, lue par checkListingRepublishEligible
// dans src/lib/actions/checks.ts) n'etait ecrite qu'a la creation de la
// ligne (deriveResellOsStatus ci-dessus, dans la branche toInsert de
// recordListings) ou lors du passage a "vendu" -- jamais lors d'un retour a
// la normale. Une ligne inseree pendant que l'annonce etait encore un
// brouillon Vinted (l.status "draft" a l'epoque) OU manuellement passee en
// brouillon cote ResellOS (runBulkDraft, ListingsManagementSection.tsx)
// restait donc bloquee sur status:"draft" pour toujours, meme apres que
// Vinted confirme l'annonce reellement publiee (vinted_status, lui, est deja
// correctement rafraichi a chaque synchro) -- exactement le symptome
// observe : annonce visible et active sur Vinted, mais refusee par
// "termine-la avant de la republier". Ne re-derive JAMAIS un
// "en_stock"/"vendu" deja en place -- uniquement sortir d'un "draft" perime
// quand Vinted confirme qu'il ne l'est plus. Retourne null quand rien ne
// doit changer (status absent du payload d'update).
export function resolveStaleDraftStatus(
  existingStatus: string,
  rawVintedStatus: string
): "en_stock" | "vendu" | null {
  if (existingStatus !== "draft") return null;
  const refreshed = deriveResellOsStatus(rawVintedStatus);
  return refreshed !== "draft" ? refreshed : null;
}
