import { ArrowLeft, Save, X } from 'lucide-react';
import type { GeneratedListing, VintedFilter } from '../../../lib/types';

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
  { k: 'category', label: 'Categorie' },
  { k: 'size', label: 'Taille' },
  { k: 'color', label: 'Couleur' },
  { k: 'material', label: 'Matiere' },
];

const PRICE_FIELDS: { k: keyof GeneratedListing; label: string }[] = [
  { k: 'price', label: 'Prix recommande' },
  { k: 'quick_price', label: 'Vente rapide' },
  { k: 'premium_price', label: 'Prix premium' },
];

export function EditStep({ editForm, onChange, onBack, onReset, onSaveAndReturn, saving }: EditStepProps) {
  const updateField = (key: keyof GeneratedListing, value: string | number | string[] | VintedFilter[]) => {
    onChange({ ...editForm, [key]: value });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-neon-500 transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Retour au resultat
      </button>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-black">Modifier l'<span className="text-neon-500">annonce</span></h1>
        <div className="flex gap-2">
          <button onClick={onReset} className="flex items-center gap-2 border border-white/10 text-gray-300 font-medium px-4 py-2 rounded-xl hover:bg-white/5 transition-all text-sm">
            Reinitialiser
          </button>
          <button
            onClick={onSaveAndReturn}
            disabled={saving}
            className="flex items-center gap-2 bg-neon-500 text-black font-bold px-4 py-2 rounded-xl hover:bg-neon-600 transition-all text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-white/5 rounded-2xl p-5 sm:p-7 space-y-5">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Titre SEO</label>
          <input type="text" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={editForm.title} onChange={(e) => updateField('title', e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Description</label>
          <textarea className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[120px] resize-y" value={editForm.description} onChange={(e) => updateField('description', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {PRICE_FIELDS.map(({ k, label }) => (
            <div key={k}>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
              <input type="number" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={(editForm as unknown as Record<string, number>)[k]} onChange={(e) => updateField(k, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {TEXT_FIELDS.map(({ k, label }) => (
            <div key={k}>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
              <input type="text" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={(editForm as unknown as Record<string, string>)[k]} onChange={(e) => updateField(k, e.target.value)} />
            </div>
          ))}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Etat</label>
            <select className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all" value={editForm.condition} onChange={(e) => updateField('condition', e.target.value)}>
              <option>Neuf avec etiquette</option>
              <option>Neuf sans etiquette</option>
              <option>Tres bon etat</option>
              <option>Bon etat</option>
              <option>Etat satisfaisant</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Mots-cles / Hashtags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {editForm.keywords.map((kw, i) => (
              <span key={i} className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-neon-500/10 text-neon-500 rounded-full border border-neon-500/20">
                #{kw.replace(/\s+/g, '')}
                <button onClick={() => updateField('keywords', editForm.keywords.filter((_, j) => j !== i))} aria-label={`Supprimer le mot-cle ${kw}`} className="text-neon-500/40 hover:text-red-400 transition-colors ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input type="text" placeholder="Ajouter un mot-cle (Entree)" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
            onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v && !editForm.keywords.includes(v)) { updateField('keywords', [...editForm.keywords, v]); (e.target as HTMLInputElement).value = ''; } } }} />
        </div>
      </div>
    </div>
  );
}
