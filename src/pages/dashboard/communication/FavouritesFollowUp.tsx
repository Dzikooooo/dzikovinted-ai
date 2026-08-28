import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Heart } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { VINTED_INK, VINTED_TEAL } from '../../../lib/brandColors';
import { formatEUR } from '../../../lib/currency';
import { computeOfferSuggestions, type OfferKind, type OfferSuggestion } from '../../../lib/offerPricing';
import {
  computeFavouritesGains,
  readFavouritesBaseline,
  writeFavouritesBaseline,
} from '../../../lib/favouritesBaseline';
import { resolveMessageTemplate, type TemplateListingSource } from '../../../lib/messageTemplate';

// RELANCE FAVORIS ASSISTEE (2026-08-26).
//
// Ce que cette section fait : dire QUOI relancer, et preparer le message.
// Ce qu'elle ne fait PAS, et ne fera pas : envoyer. L'engagement affiche sur
// la landing ("Toujours confirme par toi, jamais automatique") et en bas de
// cette page tient toujours -- la copie et l'envoi restent des gestes du
// vendeur, sur Vinted.
//
// Aucune donnee n'est inventee ni collectee : le compteur `favourites` est
// deja synchronise par l'extension sur la table listings. ResellOS ne connait
// TOUJOURS pas l'identite des personnes qui ont mis en favori -- Vinted ne
// l'expose pas, et rien ici ne cherche a la deviner.
//
// ZERO-FRICTION (2026-08-28) : le bouton "Copier le message" separe, en bas
// de chaque carte, obligeait un aller-retour visuel (choisir une offre en
// haut -> repondre le message compose plus bas -> chercher le bouton encore
// plus bas). Les badges d'offre SONT desormais l'action -- un clic compose
// ET copie en un seul geste, avec un retour "Copie !" directement sur le
// badge clique (jamais un etat global ambigu qui ne dit pas LEQUEL vient
// d'etre copie).

export interface FavouriteListing extends TemplateListingSource {
  id: string;
  favourites: number | null;
  vinted_url: string | null;
}

interface FavouritesFollowUpProps {
  listings: FavouriteListing[];
  loading: boolean;
  /** Corps du modele effectif (choisi ou par defaut), ou null si aucun. */
  templateBody: string | null;
  templateName: string | null;
}

// Compose le message pour UNE offre precise, jamais depuis un etat qui
// pourrait etre perime au moment du clic (voir le commentaire sur
// composeMessage plus bas) -- reutilise pour le clic ET pour l'aperçu.
function composeMessage(templateBody: string | null, listing: FavouriteListing, offer: OfferSuggestion | null): string | null {
  if (!templateBody) return null;
  const base = resolveMessageTemplate(templateBody, listing);
  if (!offer) return base;
  // L'offre est AJOUTEE au message prepare, jamais substituee au modele : le
  // vendeur garde le texte qu'il a ecrit, et voit exactement ce qui a ete
  // ajoute avant de copier.
  return `${base}\n\nJe peux te le faire à ${formatEUR(offer.price)} si ça t'intéresse.`;
}

export function FavouritesFollowUp({ listings, loading, templateBody, templateName }: FavouritesFollowUpProps) {
  // Reference figee au MONTAGE : elle sert a calculer les gains affiches
  // pendant toute la visite. La rafraichir a chaque rendu ferait disparaitre
  // les "+N" sous les yeux de l'utilisateur.
  const [baseline] = useState(() => readFavouritesBaseline());
  const [selectedOffer, setSelectedOffer] = useState<Record<string, OfferKind>>({});
  // Cle composite `${listingId}:${offerKind|'base'}` -- jamais un simple id
  // de carte : plusieurs badges different UNIQUEMENT par leur offre sur la
  // meme carte, un etat par carte seule ne saurait pas LEQUEL vient d'etre
  // copie.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const gains = useMemo(() => {
    const byId = new Map(computeFavouritesGains(listings, baseline).map((g) => [g.listingId, g]));
    return listings
      .map((l) => ({ listing: l, gain: byId.get(l.id)! }))
      // Une annonce sans aucun favori n'a personne a relancer.
      .filter(({ gain }) => gain.current > 0)
      // Les gains connus d'abord (les plus eleves en tete), puis les annonces
      // jamais vues -- pour lesquelles on ne peut pas parler de nouveaute.
      .sort((a, b) => (b.gain.gained ?? -1) - (a.gain.gained ?? -1) || b.gain.current - a.gain.current);
  }, [listings, baseline]);

  // La reference n'est mise a jour qu'une fois la liste REELLEMENT affichee.
  // L'ecrire au montage d'une page jamais consultee effacerait des relances
  // que l'utilisateur n'a pas vues.
  useEffect(() => {
    if (loading || listings.length === 0) return;
    writeFavouritesBaseline(Object.fromEntries(listings.map((l) => [l.id, l.favourites ?? 0])));
  }, [loading, listings]);

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    });
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton shape="block" className="h-24" />
        <Skeleton shape="block" className="h-24" />
      </div>
    );
  }

  if (gains.length === 0) {
    return (
      <EmptyState
        bare
        icon={Heart}
        title="Aucun favori à relancer"
        description="Dès qu'une de tes annonces est mise en favori, elle apparaîtra ici avec un message prêt à copier."
      />
    );
  }

  return (
    <div className="space-y-3">
      {gains.map(({ listing, gain }) => {
        const offers = computeOfferSuggestions(listing.price);
        const activeOfferKind = selectedOffer[listing.id];
        const activeOffer = offers.find((o) => o.kind === activeOfferKind) ?? null;
        const preview = composeMessage(templateBody, listing, activeOffer);
        return (
          <div key={listing.id} className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{listing.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatEUR(listing.price)}
                  {listing.size ? ` · ${listing.size}` : ''}
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full text-gray-700 flex-shrink-0"
                style={{ backgroundColor: `${VINTED_TEAL}1F` }}
              >
                <Heart className="w-3 h-3" aria-hidden="true" />
                {/* "+N" seulement quand le gain est REELLEMENT connu. Une
                    annonce vue pour la premiere fois affiche son total, sans
                    pretendre qu'il est nouveau. */}
                {gain.gained !== null && gain.gained > 0 ? `+${gain.gained}` : gain.current}
              </span>
            </div>

            {offers.length > 0 ? (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[11px] text-gray-500">Copier et proposer :</span>
                {offers.map((offer) => {
                  const key = `${listing.id}:${offer.kind}`;
                  const isCopied = copiedKey === key;
                  return (
                    <button
                      key={offer.kind}
                      onClick={() => {
                        setSelectedOffer((prev) => ({ ...prev, [listing.id]: offer.kind }));
                        const text = composeMessage(templateBody, listing, offer);
                        if (text) copy(key, text);
                      }}
                      disabled={!templateBody}
                      title={!templateBody ? "Choisis d'abord un modèle de message" : `Copier le message avec ${offer.label}`}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                        isCopied
                          ? 'bg-green-500/10 text-green-700 border-green-500/30'
                          : 'bg-neon-500/10 text-neon-600 border-neon-500/25 hover:bg-neon-500/20'
                      }`}
                    >
                      {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {isCopied ? 'Copié !' : `${offer.label} · ${formatEUR(offer.price)}`}
                    </button>
                  );
                })}
              </div>
            ) : (
              // Repli RARE (prix invalide, computeOfferSuggestions ne
              // propose alors aucune offre -- voir offerPricing.ts) : seul
              // cas ou un bouton de copie generique reste necessaire, faute
              // de badge de prix a cliquer.
              templateBody && (
                <button
                  onClick={() => {
                    const text = composeMessage(templateBody, listing, null);
                    if (text) copy(`${listing.id}:base`, text);
                  }}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors mt-3 ${
                    copiedKey === `${listing.id}:base`
                      ? 'bg-green-500/10 text-green-700 border-green-500/30'
                      : 'bg-neon-500/10 text-neon-600 border-neon-500/25 hover:bg-neon-500/20'
                  }`}
                >
                  {copiedKey === `${listing.id}:base` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === `${listing.id}:base` ? 'Copié !' : 'Copier le message'}
                </button>
              )
            )}

            {preview && (
              <p className="text-xs text-gray-700 bg-surface-alt border border-gray-200 rounded-lg px-3 py-2 mt-3 whitespace-pre-wrap">
                {preview}
              </p>
            )}

            {!templateBody && <p className="text-xs text-gray-500 mt-3">Choisis un modèle ci-dessus pour préparer le message de cette relance.</p>}

            {/* Ce bouton mene reellement sur Vinted, d'ou l'accent Vinted.
                Fond VINTED_INK et non VINTED_TEAL : du blanc sur le teal ne
                mesure que 2.62:1 (echec AA), sur l'ink 5.30:1. Corrige le
                2026-08-26 avec la regle du playbook qui l'autorisait a tort. */}
            {listing.vinted_url && (
              <a
                href={listing.vinted_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white px-3 py-2 rounded-lg transition-opacity hover:opacity-90 mt-3"
                style={{ backgroundColor: VINTED_INK }}
              >
                Ouvrir sur Vinted <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        );
      })}

      {templateName && (
        <p className="text-[11px] text-gray-500">
          Message préparé à partir du modèle « {templateName} ». Clique un prix pour le copier — c'est toujours toi
          qui le copies et l'envoies sur Vinted.
        </p>
      )}
    </div>
  );
}
