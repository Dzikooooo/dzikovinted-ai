import { useState } from 'react';
import { AlertCircle, ImageIcon, RefreshCw, Save, Sparkles, UploadCloud, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { analyzeWithAI } from '../../lib/aiService';
import { uploadListingPhotos } from '../../lib/storage';
import type { Listing, VintedFilter } from '../../lib/types';

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

function toEditForm(listing: Listing): EditForm {
  return {
    title: listing.title,
    description: listing.description,
    brand: listing.brand,
    category: listing.category,
    color: listing.color,
    size: listing.size,
    material: listing.material,
    condition: listing.condition,
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

interface EditListingModalProps {
  listing: Listing;
  onClose: () => void;
  // Appele apres un enregistrement reussi avec l'annonce a jour -- l'appelant
  // recharge la liste. `publish` indique si l'utilisateur a demande
  // d'enchainer sur "Publier sur Vinted" juste apres (uniquement propose si
  // jamais publiee).
  onSaved: (updated: Listing, publish: boolean) => void;
  // Meme condition que le bouton "Publier sur Vinted" existant
  // (StockPage.tsx) : un compte Vinted precis doit etre selectionne pour
  // pouvoir enchainer sur la publication.
  canPublish: boolean;
}

export function EditListingModal({ listing, onClose, onSaved, canPublish }: EditListingModalProps) {
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
    setImages((prev) => [...prev, ...next].slice(0, 4));
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

  const save = async (publish: boolean) => {
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
      const lastEditedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('listings')
        .update({
          title: form.title,
          description: form.description,
          brand: form.brand,
          category: form.category,
          color: form.color,
          size: form.size,
          material: form.material,
          condition: form.condition,
          price: form.price,
          quick_price: form.quick_price,
          premium_price: form.premium_price,
          keywords: form.keywords,
          vinted_filters: form.vinted_filters,
          image_urls: finalImageUrls,
          last_edited_at: lastEditedAt,
        })
        .eq('id', listing.id);

      if (updateError) throw new Error(updateError.message);
      onSaved({ ...listing, ...form, image_urls: finalImageUrls, last_edited_at: lastEditedAt }, publish);
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
          <p className="text-xs text-gray-500 mt-1">{listing.title}</p>
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
            {images.length < 4 && (
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

        {isLinkedToVinted ? (
          <div className="flex items-start gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Cette annonce est deja liee a un compte Vinted. Le prix sera ecrase par le prix reel sur Vinted a la
              prochaine synchronisation -- il n'existe pas encore de republication automatique depuis ResellOS.
              Modifie le prix directement sur Vinted si besoin.
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
            onClick={() => save(false)}
            disabled={saving || regenerating}
            className="flex-1 flex items-center justify-center gap-2 bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
          {!isLinkedToVinted && canPublish && (
            <button
              onClick={() => save(true)}
              disabled={saving || regenerating}
              className="flex-1 flex items-center justify-center gap-2 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl hover:bg-white/5 transition-all disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              Enregistrer et publier sur Vinted
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
