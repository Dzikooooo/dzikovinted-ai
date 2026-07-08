import { ArrowLeft, Copy, DollarSign, Filter, Layers, Palette, Pencil, Ruler, Save, Star, Tag } from 'lucide-react';
import type { GeneratedListing } from '../../../lib/types';
import { CopyBtn } from '../../../components/ui/CopyBtn';
import { FieldCard } from '../../../components/ui/FieldCard';

interface ResultStepProps {
  result: GeneratedListing;
  images: string[];
  onReset: () => void;
  onEdit: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

export function ResultStep({ result, images, onReset, onEdit, onSave, saving, saved }: ResultStepProps) {
  const handleCopyAll = () => {
    const t = [
      result.title, '',
      result.description, '',
      `Prix recommande: ${result.price} EUR`,
      `Vente rapide: ${result.quick_price} EUR`,
      `Premium: ${result.premium_price} EUR`,
      `Marque: ${result.brand}`,
      `Categorie: ${result.category}`,
      `Taille: ${result.size}`,
      `Couleur: ${result.color}`,
      `Matiere: ${result.material}`,
      `Etat: ${result.condition}`,
      `Mots-cles: ${result.keywords.join(', ')}`,
    ].join('\n');
    navigator.clipboard.writeText(t);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <button onClick={onReset} className="flex items-center gap-2 text-sm text-gray-400 hover:text-neon-500 transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Nouvelle annonce
      </button>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">
            Annonce <span className="text-neon-500">prête</span>
          </h1>
          <p className="text-gray-400 text-sm">Optimisée pour Vinted</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleCopyAll} className="flex items-center gap-2 border border-white/10 text-gray-300 font-medium px-4 py-2 rounded-xl hover:bg-white/5 transition-all text-sm">
            <Copy className="w-4 h-4" /> Copier tout
          </button>
          <button onClick={onEdit} className="flex items-center gap-2 border border-neon-500/30 text-neon-500 font-medium px-4 py-2 rounded-xl hover:bg-neon-500/10 transition-all text-sm">
            <Pencil className="w-4 h-4" /> Modifier
          </button>
          <button
            onClick={onSave}
            disabled={saving || saved}
            className={`flex items-center gap-2 font-medium px-4 py-2 rounded-xl transition-all text-sm ${saved ? 'bg-neon-500/20 text-neon-500 border border-neon-500/30' : 'bg-neon-500 text-black hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] disabled:opacity-60'}`}
          >
            <Save className="w-4 h-4" />
            {saved ? 'Sauvegarde !' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Image preview strip */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
          {images.map((src, i) => (
            <div key={i} className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface border border-white/5 rounded-2xl p-5 sm:p-7 space-y-4">
        <FieldCard label="Titre SEO" value={result.title} icon={Tag} />
        <FieldCard label="Description" value={result.description} icon={Layers} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Prix recommande', val: `${result.price} EUR`, color: 'text-neon-500', border: 'border-neon-500/20', bg: 'bg-neon-500/5' },
            { label: 'Vente rapide', val: `${result.quick_price} EUR`, color: 'text-orange-400', border: 'border-orange-400/20', bg: 'bg-orange-400/5' },
            { label: 'Prix premium', val: `${result.premium_price} EUR`, color: 'text-blue-400', border: 'border-blue-400/20', bg: 'bg-blue-400/5' },
          ].map(({ label, val, color, border, bg }) => (
            <div key={label} className={`${bg} border ${border} rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className={`w-3.5 h-3.5 ${color}`} />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
                </div>
                <CopyBtn text={val} />
              </div>
              <p className={`text-2xl font-black ${color}`}>{val}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <FieldCard label="Marque" value={result.brand} icon={Star} />
          <FieldCard label="Categorie" value={result.category} icon={Layers} />
          <FieldCard label="Taille" value={result.size} icon={Ruler} />
          <FieldCard label="Couleur" value={result.color} icon={Palette} />
          <FieldCard label="Matiere" value={result.material} icon={Tag} />
          <FieldCard label="Etat" value={result.condition} icon={Tag} />
        </div>

        <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-neon-500/60" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">Hashtags / Mots-cles</span>
            </div>
            <CopyBtn text={result.keywords.map(k => `#${k.replace(/\s+/g, '')}`).join(' ')} />
          </div>
          <div className="flex flex-wrap gap-2">
            {result.keywords.map((kw) => (
              <span key={kw} onClick={() => navigator.clipboard.writeText(`#${kw.replace(/\s+/g, '')}`)} className="px-3 py-1 text-xs font-mono bg-neon-500/10 text-neon-500 rounded-full border border-neon-500/20 cursor-pointer hover:bg-neon-500/20 transition-colors">
                #{kw.replace(/\s+/g, '')}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-neon-500/60" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">Filtres Vinted</span>
            </div>
            <CopyBtn text={result.vinted_filters.map((f) => `${f.label}: ${f.value}`).join('\n')} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {result.vinted_filters.map((f) => (
              <div key={f.label} onClick={() => navigator.clipboard.writeText(f.value)} className="bg-surface rounded-lg px-3 py-2 border border-white/5 cursor-pointer hover:border-neon-500/20 transition-colors">
                <p className="text-[9px] font-mono uppercase tracking-wider text-gray-600 mb-0.5">{f.label}</p>
                <p className="text-xs text-gray-200">{f.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
