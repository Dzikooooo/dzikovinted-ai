import { useState } from 'react';
import { AlertCircle, ImageIcon, RefreshCw, Save, Sparkles, UploadCloud, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { analyzeWithAI } from '../../lib/aiService';
import { uploadListingPhotos } from '../../lib/storage';
import type { Listing, VintedFilter } from '../../lib/types';
import type { EditableFieldName } from '../../lib/actions/handlers/editListing';

interface EditForm {
  title: string;
  description: string;
  brand: string;
  category: string;
  color: string;
  size: string;
  material: string;
  condition: string;
  price: number;
  quick_price: number;
  premium_price: number;
  keywords: string[];
  vinted_filters: VintedFilter[];
}

// Ces colonnes sont nullables en base (voir supabase/migrations) malgre un
// type TypeScript qui les declare `string` -- une annonce importee/
// synchronisee depuis Vinted (extension/src/background/sync.ts::recordListings)
// n'ecrit jamais category/color/material/description a la creation, donc
// `listing.brand` etc. valent reellement `null` a l'execution pour ces
// annonces malgre ce que dit le type. Sans normalisation, un <input
// value={null}> passe React en mode non controle (avertissement console,
// comportement de saisie non fiable) -- voir aussi la normalisation
// symetrique dans le calcul de changedFields ci-dessous.
function toEditForm(listing: Listing): EditForm {
  return {
    title: listing.title,
    description: listing.description ?? '',
    brand: listing.brand ?? '',
    category: listing.category ?? '',
    color: listing.color ?? '',
    size: listing.size ?? '',
    material: listing.material ?? '',
    condition: listing.condition ?? '',
    price: listing.price,
    quick_price: listing.quick_price,
    premium_price: listing.premium_price,
    keywords: listing.keywords,
    vinted_filters: listing.vinted_filters,
  };
}

const TEXT_FIELDS: { k: 'brand' | 'category' | 'size' | 'color' | 'material'; label: string }[] = [
  { k: 'brand', label: 'Marque' },
  { k: 'category', label: 'Categorie' },
  { k: 'size', label: 'Taille' },
  { k: 'color', label: 'Couleur' },
  { k: 'material', label: 'Matiere' },
];

const PRICE_FIELDS: { k: 'price' | 'quick_price' | 'premium_price'; label: string }[] = [
  { k: 'price', label: 'Prix recommande' },
  { k: 'quick_price', label: 'Vente rapide' },
  { k: 'premium_price', label: 'Prix premium' },
];

// 'publish' : enchainer sur "Publier sur Vinted" (annonce pas encore liee).
// 'update' : enchainer sur "Mettre a jour sur Vinted" (annonce deja liee,
// Partie 4 -- pousse les champs texte/attributs modifies vers le formulaire
// d'edition Vinted).
type SaveIntent = 'none' | 'publish' | 'update';

interface EditListingModalProps {
  listing: Listing;
  onClose: () => void;
  // Appele apres un enregistrement reussi avec l'annonce a jour -- l'appelant
  // recharge la liste et enchaine selon `intent`. `changedFields` (2026-07-16,
  // "un champ non modifie ne doit provoquer aucune attente DOM") liste
  // uniquement les champs Vinted reellement modifies par rapport a
  // l'annonce d'origine -- vide pour intent 'none'/'publish' (non
  // pertinent, tout est "nouveau" a la publication).
  onSaved: (updated: Listing, intent: SaveIntent, changedFields: EditableFieldName[]) => void;
  // Meme condition que le bouton "Publier sur Vinted" existant
  // (StockPage.tsx) : un compte Vinted precis doit etre selectionne pour
  // pouvoir enchainer sur la publication.
  canPublish: boolean;
  // Condition distincte de canPublish : pour une annonce DEJA liee, le
  // compte Vinted selectionne doit etre EXACTEMENT celui auquel elle
  // appartient (pas juste "un compte au hasard") -- sinon on ouvrirait la
  // page d'edition d'un article avec le mauvais compte connecte.
  canUpdateOnVinted: boolean;
  // Plafond de photos selon le plan de l'utilisateur (voir
  // PLAN_PHOTO_LIMITS, src/lib/types.ts) -- meme logique que UploadStep.tsx.
  photoLimit: number;
}

export function EditListingModal({ listing, onClose, onSaved, canPublish, canUpdateOnVinted, photoLimit }: EditListingModalProps) {
  const [form, setForm] = useState<EditForm>(() => toEditForm(listing));
  const [images, setImages] = useState<string[]>(listing.image_urls);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLinkedToVinted = listing.vinted_account_id !== null;

  const updateField = (key: keyof EditForm, value: string | number) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleAddPhotos = (files: FileList | null) => {
    if (!files) return;
    const next: string[] = [];
    Array.from(files).forEach((f) => {
      if (f.type.startsWith('image/')) next.push(URL.createObjectURL(f));
    });
    setImages((prev) => [...prev, ...next].slice(0, photoLimit));
  };

  const handleRegenerateText = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const generated = await analyzeWithAI({ imageUrls: images, photoStyle: 'white', enhancePhoto: true });
      setForm({
        title: generated.title,
        description: generated.description,
        brand: generated.brand,
        category: generated.category,
        color: generated.color,
        size: generated.size,
        material: generated.material,
        condition: generated.condition,
        price: generated.price,
        quick_price: generated.quick_price,
        premium_price: generated.premium_price,
        keywords: generated.keywords,
        vinted_filters: generated.vinted_filters,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de relancer l'analyse IA.");
    } finally {
      setRegenerating(false);
    }
  };

  const save = async (intent: SaveIntent) => {
    // INSTRUMENTATION TEMPORAIRE (diagnostic edit_listing silencieux,
    // 2026-07-24) -- a retirer une fois la cause racine confirmee. Premiere
    // ligne de save(), avant tout await : si ce log n'apparait jamais apres
    // un clic sur "Enregistrer et mettre a jour sur Vinted", le bouton
    // lui-meme n'a pas declenche save('update') (bouton non rendu/disabled,
    // ou mauvais bouton clique).
    console.log('[ResellOS][DIAGNOSTIC] EditListingModal.save() demarre', {
      intent,
      listingId: listing.id,
      isLinkedToVinted,
      canUpdateOnVinted,
      formPrice: form.price,
      listingPrice: listing.price,
    });
    setSaving(true);
    setError(null);
    try {
      const blobUrls = images.filter((u) => u.startsWith('blob:'));
      let finalImageUrls = images;
      if (blobUrls.length > 0) {
        const uploaded = await uploadListingPhotos(listing.user_id, blobUrls);
        const uploadedMap = new Map(blobUrls.map((u, i) => [u, uploaded[i]]));
        finalImageUrls = images.map((u) => uploadedMap.get(u) ?? u);
      }

      // Ne touche que les champs proprietaire de l'app -- jamais
      // vinted_status/favourites/views/synced_at/vinted_url/vinted_account_id/
      // vinted_item_id, geres exclusivement par la synchro extension (voir
      // extension/src/background/sync.ts:108-122).
      //
      // "La base ResellOS ne doit jamais diverger de Vinted" (demande
      // explicite 2026-07-15) : pour l'intention 'update' (annonce deja
      // liee), les champs REELLEMENT pousses vers Vinted par edit_listing
      // (title/description/brand/category/color/size/material/condition/
      // price -- voir buildEditPayload dans StockPage.tsx) ne sont PAS
      // ecrits en base ici. Ils restent en memoire (onSaved ci-dessous) et
      // ne seront ecrits que par StockPage.tsx::runVintedAction, UNIQUEMENT
      // si Vinted confirme reellement la mise a jour (sync_success) -- en
      // cas d'echec, la ligne `listings` garde exactement sa valeur
      // precedente (sync_failed, aucune donnee ecrasee). Les champs qui ne
      // sont jamais pousses vers Vinted (quick_price/premium_price/
      // keywords/vinted_filters/photos) restent en revanche ecrits
      // immediatement : ils ne peuvent pas "diverger" de Vinted puisque
      // Vinted ne les connait pas.
      const lastEditedAt = new Date().toISOString();
      const vintedPushedFields = {
        title: form.title,
        description: form.description,
        brand: form.brand,
        category: form.category,
        color: form.color,
        size: form.size,
        material: form.material,
        condition: form.condition,
        price: form.price,
      };
      const localOnlyFields = {
        quick_price: form.quick_price,
        premium_price: form.premium_price,
        keywords: form.keywords,
        vinted_filters: form.vinted_filters,
        image_urls: finalImageUrls,
        last_edited_at: lastEditedAt,
      };

      const { error: updateError } = await supabase
        .from('listings')
        .update(intent === 'update' ? localOnlyFields : { ...vintedPushedFields, ...localOnlyFields })
        .eq('id', listing.id);

      if (updateError) throw new Error(updateError.message);

      // "Un champ non modifie ne doit provoquer aucune attente DOM"
      // (demande explicite 2026-07-16) -- compare le formulaire a
      // l'annonce D'ORIGINE (avant toute fusion) pour ne lister que ce qui
      // a reellement change. Le titre SKU-formate n'est jamais compare
      // directement ici (buildEditPayload s'en charge cote StockPage.tsx) :
      // seul le titre "brut" saisi par l'utilisateur compte.
      //
      // `vintedPushedFields[key]` est TOUJOURS une chaine (toEditForm
      // normalise null -> '' juste au-dessus), mais `listing[key]` peut
      // encore valoir reellement `null` pour une annonce synchronisee
      // (voir le commentaire de toEditForm). Sans normaliser l'original de
      // la meme facon ici, un champ jamais touche par l'utilisateur
      // ('' cote formulaire, null cote annonce d'origine) serait marque a
      // tort comme "modifie" des l'ouverture de la modale.
      const changedFields = (Object.keys(vintedPushedFields) as (keyof typeof vintedPushedFields)[]).filter((key) => {
        const current = vintedPushedFields[key];
        const original = listing[key];
        const normalizedOriginal = typeof current === 'string' ? (original ?? '') : original;
        return current !== normalizedOriginal;
      });

      if (intent === 'update') {
        console.log(
          '[ResellOS][action] enregistrement local (champs non pousses vers Vinted uniquement) -- titre/prix/description restent en attente de confirmation Vinted',
          { listingId: listing.id, price: form.price, title: form.title, changedFields }
        );
      }
      onSaved(
        {
          ...listing,
          ...form,
          image_urls: finalImageUrls,
          last_edited_at: lastEditedAt,
        },
        intent,
        changedFields
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-black">Modifier l'annonce</h2>
          <p className="text-xs text-gray-500 mt-1">
            {listing.title}
            {listing.sku !== null && <span className="text-gray-600 font-mono"> #{listing.sku}</span>}
          </p>
          {listing.last_edited_at && (
            <p className="text-[10px] text-gray-600 mt-0.5">
              Modifiee le {new Date(listing.last_edited_at).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Photos</label>
          <div className="grid grid-cols-4 gap-2">
            {images.map((src, i) => (
              <div key={`${src}-${i}`} className="relative aspect-square rounded-xl overflow-hidden bg-dark-400 border border-white/5 group">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Supprimer cette photo"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/80"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {images.length < photoLimit && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center cursor-pointer hover:border-neon-500/40 hover:bg-neon-500/5 transition-all">
                <ImageIcon className="w-4 h-4 text-gray-600" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleAddPhotos(e.target.files)} />
              </label>
            )}
          </div>
          <p className="text-[11px] text-gray-600 mt-2">
            Remplacement manuel uniquement -- aucune regeneration IA de la photo n'est disponible pour l'instant.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Titre</label>
          <input
            type="text"
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Description</label>
          <textarea
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[100px] resize-y"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
          />
        </div>

        <button
          onClick={handleRegenerateText}
          disabled={regenerating || images.length === 0}
          className="flex items-center gap-2 text-xs font-semibold border border-neon-500/30 text-neon-500 px-3 py-2 rounded-xl hover:bg-neon-500/10 transition-all disabled:opacity-40"
        >
          {regenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {regenerating ? 'Analyse en cours...' : 'Relancer titre / description / prix'}
        </button>

        <div className="grid grid-cols-3 gap-3">
          {PRICE_FIELDS.map(({ k, label }) => (
            <div key={k}>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
              <input
                type="number"
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                value={form[k]}
                onChange={(e) => updateField(k, parseFloat(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEXT_FIELDS.map(({ k, label }) => (
            <div key={k}>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
              <input
                type="text"
                className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                value={form[k]}
                onChange={(e) => updateField(k, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Etat</label>
            <select
              className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
              value={form.condition}
              onChange={(e) => updateField('condition', e.target.value)}
            >
              <option>Neuf avec etiquette</option>
              <option>Neuf sans etiquette</option>
              <option>Tres bon etat</option>
              <option>Bon etat</option>
              <option>Etat satisfaisant</option>
            </select>
          </div>
        </div>

        {listing.vinted_sync_status === 'sync_failed' && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              La dernière tentative de mise à jour sur Vinted a échoué -- Vinted n'a pas été mis à jour, et aucune
              donnée locale n'a été modifiée (les valeurs ci-dessous sont toujours celles confirmées sur Vinted).
              Réessaie "Enregistrer et mettre à jour sur Vinted".
            </p>
          </div>
        )}

        {isLinkedToVinted ? (
          <div className="flex items-start gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Cette annonce est deja liee a un compte Vinted. "Enregistrer et mettre a jour sur Vinted" pousse le
              titre, le prix, la description, la marque, la taille, l'etat, la couleur et la matiere vers la fiche
              Vinted -- tu valides toi-meme l'enregistrement sur place. Les photos ne sont pas encore synchronisees
              par cette mise a jour (modifie-les directement sur Vinted si besoin), et un changement de categorie
              n'est pas garanti d'etre pris en compte -- non teste en conditions reelles.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Cette annonce n'est pas encore publiee sur Vinted -- une fois enregistree, tu pourras la publier avec les
            nouvelles informations.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            onClick={() => save('none')}
            disabled={saving || regenerating}
            className="flex-1 flex items-center justify-center gap-2 bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
          {!isLinkedToVinted && canPublish && (
            <button
              onClick={() => save('publish')}
              disabled={saving || regenerating}
              className="flex-1 flex items-center justify-center gap-2 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl hover:bg-white/5 transition-all disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              Enregistrer et publier sur Vinted
            </button>
          )}
          {isLinkedToVinted && canUpdateOnVinted && (
            <button
              onClick={() => {
                console.log('[ResellOS][action] clic "Enregistrer et mettre a jour sur Vinted" (etape 1)', {
                  listingId: listing.id,
                  price: form.price,
                });
                void save('update');
              }}
              disabled={saving || regenerating}
              className="flex-1 flex items-center justify-center gap-2 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl hover:bg-white/5 transition-all disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              Enregistrer et mettre à jour sur Vinted
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
