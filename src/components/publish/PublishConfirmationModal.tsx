import { useState } from 'react';
import { X, Package, AlertTriangle } from 'lucide-react';
import AccountAvatar from '../ui/AccountAvatar';
import { Modal } from '../ui/Modal';
import type { Listing, VintedAccount } from '../../lib/types';
import { formatEUR } from '../../lib/currency';

export type PackageSize = 'small' | 'medium' | 'large';

const PACKAGE_SIZE_OPTIONS: { value: PackageSize; label: string; hint: string }[] = [
  { value: 'small', label: 'Petit', hint: 'Accessoires, chaussures légères' },
  { value: 'medium', label: 'Moyen', hint: 'Vêtements, chaussures' },
  { value: 'large', label: 'Grand', hint: 'Manteaux, articles volumineux' },
];

// Heuristique de pre-remplissage uniquement (jamais soumise sans revue
// utilisateur, voir l'ecran de confirmation) : la taille de colis n'a pas
// d'equivalent dans le modele Listing, decision utilisateur explicite
// (voir plan) de toujours la demander en confirmation avec une valeur par
// defaut ajustable plutot que de la deviner silencieusement.
// Accepte null (Listing.category peut reellement l'etre, voir types.ts) --
// bug confirme le 2026-07-23 : category.toLowerCase() plantait sans garde
// pour toute annonce importee/synchronisee sans categorie jamais capturee.
// checkListingHasRequiredVintedFields (checks.ts) bloque desormais
// publish_listing en amont dans ce cas, mais cette fonction reste
// defensive independamment de cette garde.
function defaultPackageSize(category: string | null): PackageSize {
  const normalized = (category ?? '').toLowerCase();
  if (/(chaussure|sac|accessoire|bijou|montre)/.test(normalized)) return 'small';
  if (/(manteau|veste|doudoune|canapé|meuble)/.test(normalized)) return 'large';
  return 'medium';
}

interface PublishConfirmationModalProps {
  listing: Listing;
  account: VintedAccount;
  onCancel: () => void;
  onConfirm: (packageSize: PackageSize) => void;
  // true quand l'annonce a deja un vinted_item_id (etait publiee, ne l'est
  // plus reellement -- voir checks.ts::checkListingNeedsRepublish). Le
  // formulaire de confirmation reste identique (memes champs a valider),
  // seul le libelle change pour ne jamais laisser croire a une
  // "reactivation" de l'ancienne fiche Vinted -- il s'agit toujours d'une
  // creation.
  isRepublish?: boolean;
}

export default function PublishConfirmationModal({
  listing,
  account,
  onCancel,
  onConfirm,
  isRepublish = false,
}: PublishConfirmationModalProps) {
  const [packageSize, setPackageSize] = useState<PackageSize>(defaultPackageSize(listing.category));

  return (
    <Modal onClose={onCancel} size="md">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-black">{isRepublish ? 'Republier sur Vinted' : 'Publier sur Vinted'}</h2>
          <p className="text-xs text-gray-500 mt-1">{listing.title}</p>
        </div>
        <button onClick={onCancel} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="space-y-4">
        {isRepublish && (
          <div className="flex items-start gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Cette annonce a déjà été publiée mais n'est plus en ligne sur Vinted (masquée, supprimée ou introuvable).
              Une <strong>nouvelle</strong> fiche Vinted va être créée avec ces informations -- l'ancienne n'est jamais
              modifiée ni supprimée.
            </p>
          </div>
        )}
        {listing.image_urls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {listing.image_urls.slice(0, 5).map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-white/10 flex-shrink-0"
              />
            ))}
          </div>
        )}

        <div className="bg-dark-400 border border-white/10 rounded-xl p-4 space-y-2 text-sm">
          <Row label="Prix" value={formatEUR(listing.price)} />
          <Row label="Catégorie" value={listing.category || '—'} />
          <Row label="Marque" value={listing.brand || '—'} />
          <Row label="Taille" value={listing.size || '—'} />
          <Row label="État" value={listing.condition || '—'} />
          <div className="flex items-center justify-between pt-1">
            <span className="text-gray-500">Compte Vinted</span>
            <span className="flex items-center gap-2 font-semibold text-gray-200">
              <AccountAvatar label={account.label} size="sm" />
              {account.label}
            </span>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-2">
            <Package className="w-3 h-3" /> Taille du colis
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PACKAGE_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPackageSize(option.value)}
                title={option.hint}
                className={`text-xs font-semibold py-2.5 rounded-xl border transition-all ${
                  packageSize === option.value
                    ? 'bg-neon-600 text-white border-neon-500'
                    : 'bg-dark-400 text-gray-400 border-white/10 hover:border-white/20'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onConfirm(packageSize)}
          className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 transition-all"
        >
          {isRepublish ? 'Republier' : 'Publier'}
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-200">{value}</span>
    </div>
  );
}
