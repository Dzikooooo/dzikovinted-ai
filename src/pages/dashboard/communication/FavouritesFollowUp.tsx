import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Heart } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { VINTED_INK, VINTED_TEAL } from '../../../lib/brandColors';
import { formatEUR } from '../../../lib/currency';
import { computeOfferSuggestions, type OfferKind } from '../../../lib/offerPricing';
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

export interface FavouriteListing extends TemplateListingSource {
  id: string;
  favourites: number | null;
  vinted_url: string | null;
}

interface FavouritesFollowUpProps {
  listings: FavouriteListing[];
  loading: boolean;
  /** Corps du modele selectionne, ou null si aucun modele n'est choisi. */
  templateBody: string | null;
  templateName: string | null;
}

export function FavouritesFollowUp({ listings, loading, templateBody, templateName }: FavouritesFollowUpProps) {
  // Reference figee au MONTAGE : elle sert a calculer les gains affiches
  // pendant toute la visite. La rafraichir a chaque rendu ferait disparaitre
  // les "+N" sous les yeux de l'utilisateur.
  const [baseline] = useState(() => readFavouritesBaseline());
  const [selectedOffer, setSelectedOffer] = useState<Record<string, OfferKind>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const messageFor = (listing: FavouriteListing): string | null => {
    if (!templateBody) return null;
    const base = resolveMessageTemplate(templateBody, listing);
    const kind = selectedOffer[listing.id];
    if (!kind) return base;
    const offer = computeOfferSuggestions(listing.price).find((o) => o.kind === kind);
    if (!offer) return base;
    // L'offre est AJOUTEE au message prepare, jamais substituee au modele :
    // le vendeur garde le texte qu'il a ecrit, et voit exactement ce qui a
    // ete ajoute avant de copier.
    return `${base}\n\nJe peux te le faire à ${formatEUR(offer.price)} si ça t'intéresse.`;
  };

  const copy = (listingId: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(listingId);
      setTimeout(() => setCopiedId((current) => (current === listingId ? null : current)), 2000);
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
      {!templateBody && (
        <p className="text-xs text-gray-500">
          Choisis un modèle ci-dessus pour préparer le message de chaque relance.
        </p>
      )}

      {gains.map(({ listing, gain }) => {
        const offers = computeOfferSuggestions(listing.price);
        const message = messageFor(listing);
        const activeOffer = selectedOffer[listing.id];
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

            {offers.length > 0 && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[11px] text-gray-500">Proposer :</span>
                {offers.map((offer) => {
                  const active = activeOffer === offer.kind;
                  return (
                    <button
                      key={offer.kind}
                      aria-pressed={active}
                      onClick={() =>
                        setSelectedOffer((prev) => {
                          const next = { ...prev };
                          if (active) delete next[listing.id];
                          else next[listing.id] = offer.kind;
                          return next;
                        })
                      }
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                        active
                          ? 'bg-neon-500/10 text-neon-600 border-neon-500/30'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {offer.label} · {formatEUR(offer.price)}
                    </button>
                  );
                })}
              </div>
            )}

            {message && (
              <p className="text-xs text-gray-700 bg-surface-alt border border-gray-200 rounded-lg px-3 py-2 mt-3 whitespace-pre-wrap">
                {message}
              </p>
            )}

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => message && copy(listing.id, message)}
                disabled={!message}
                title={!message ? 'Choisis d\'abord un modèle de message' : undefined}
                className="inline-flex items-center justify-center gap-1.5 flex-1 text-xs font-bold px-3 py-2 rounded-lg bg-neon-500/10 text-neon-600 border border-neon-500/25 hover:bg-neon-500/20 transition-colors disabled:opacity-50"
              >
                {copiedId === listing.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === listing.id ? 'Copié' : 'Copier le message'}
              </button>
              {/* Ce bouton mene reellement sur Vinted, d'ou l'accent Vinted.
                  Fond VINTED_INK et non VINTED_TEAL : du blanc sur le teal ne
                  mesure que 2.62:1 (echec AA), sur l'ink 5.30:1. Corrige le
                  2026-08-26 avec la regle du playbook qui l'autorisait a tort. */}
              {listing.vinted_url ? (
                <a
                  href={listing.vinted_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white px-3 py-2 rounded-lg transition-opacity hover:opacity-90 flex-shrink-0"
                  style={{ backgroundColor: VINTED_INK }}
                >
                  Ouvrir sur Vinted <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <span className="text-[11px] text-gray-500 flex-shrink-0">Lien Vinted indisponible</span>
              )}
            </div>
          </div>
        );
      })}

      {templateName && (
        <p className="text-[11px] text-gray-500">
          Message préparé à partir du modèle « {templateName} ». Tu le copies et tu l'envoies toi-même sur Vinted.
        </p>
      )}
    </div>
  );
}
