import { ArrowLeft, Save, X } from 'lucide-react';
import type { GeneratedListing, VintedFilter } from '../../../lib/types';
import { Button } from '../../../components/ui/Button';

interface EditStepProps {
  editForm: GeneratedListing;
  onChange: (form: GeneratedListing) => void;
  onBack: () => void;
  onReset: () => void;
  onSaveAndReturn: () => void;
  saving: boolean;
}

const TEXT_FIELDS: { k: keyof GeneratedListing; label: string }[] = [
  { k: 'brand', label: 'Marque' },
  { k: 'category', label: 'Catégorie' },
  { k: 'size', label: 'Taille' },
  { k: 'color', label: 'Couleur' },
  { k: 'material', label: 'Matière' },
];

const PRICE_FIELDS: { k: keyof GeneratedListing; label: string }[] = [
  { k: 'price', label: 'Prix recommandé' },
  { k: 'quick_price', label: 'Vente rapide' },
  { k: 'premium_price', label: 'Prix premium' },
];

export function EditStep({ editForm, onChange, onBack, onReset, onSaveAndReturn, saving }: EditStepProps) {
  const updateField = (key: keyof GeneratedListing, value: string | number | string[] | VintedFilter[]) => {
    // Un prix tape manuellement n'est plus une donnee de marche reelle --
    // l'etiquette "Base sur N annonces comparables" deviendrait mensongere
    // si on la laissait collee a une valeur que l'utilisateur vient de
    // changer lui-meme (voir ResultStep.tsx, meme principe d'honnetete que
    // price_source cote analyze-clothing).
    if (key === 'price') {
      onChange({
        ...editForm,
        price: value as number,
        price_source: 'ai_estimate',
        price_comparables_count: 0,
        market_tier: 'none',
        market_confidence_level: 'ia_uniquement',
        market_confidence_score: 0,
        market_freshness: null,
      });
      return;
    }
    onChange({ ...editForm, [key]: value });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-neon-500 transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Retour au résultat
      </button>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-black">Modifier l'<span className="text-neon-500">annonce</span></h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onReset}>
            Réinitialiser
          </Button>
          <Button size="sm" icon={<Save className="w-4 h-4" />} loading={saving} onClick={onSaveAndReturn}>
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-2xl p-5 sm:p-7 space-y-5">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Titre SEO</label>
          <input type="text" className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={editForm.title} onChange={(e) => updateField('title', e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Description</label>
          <textarea className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[120px] resize-y" value={editForm.description} onChange={(e) => updateField('description', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {PRICE_FIELDS.map(({ k, label }) => (
            <div key={k}>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
              <input type="number" className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={(editForm as unknown as Record<string, number>)[k]} onChange={(e) => updateField(k, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {TEXT_FIELDS.map(({ k, label }) => (
            <div key={k}>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
              <input type="text" className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={(editForm as unknown as Record<string, string>)[k]} onChange={(e) => updateField(k, e.target.value)} />
            </div>
          ))}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">État</label>
            <select className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={editForm.condition} onChange={(e) => updateField('condition', e.target.value)}>
              <option>Neuf avec étiquette</option>
              <option>Neuf sans étiquette</option>
              <option>Très bon état</option>
              <option>Bon état</option>
              <option>État satisfaisant</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Mots-clés / Hashtags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {editForm.keywords.map((kw, i) => (
              <span key={i} className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-neon-500/10 text-neon-500 rounded-full border border-neon-500/20">
                #{kw.replace(/\s+/g, '')}
                <button onClick={() => updateField('keywords', editForm.keywords.filter((_, j) => j !== i))} aria-label={`Supprimer le mot-clé ${kw}`} className="text-neon-500/40 hover:text-red-700 transition-colors ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input type="text" placeholder="Ajouter un mot-clé (Entrée)" className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
            onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v && !editForm.keywords.includes(v)) { updateField('keywords', [...editForm.keywords, v]); (e.target as HTMLInputElement).value = ''; } } }} />
        </div>
      </div>
    </div>
  );
}
