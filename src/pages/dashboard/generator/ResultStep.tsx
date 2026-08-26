import { AlertCircle, ArrowLeft, CheckCircle2, Copy, DollarSign, Filter, Layers, Package, Palette, Pencil, Ruler, Save, Sparkles, Star, Tag, TrendingUp } from 'lucide-react';
import type { GeneratedListing } from '../../../lib/types';
import { CopyBtn } from '../../../components/ui/CopyBtn';
import { FieldCard } from '../../../components/ui/FieldCard';
import { Button } from '../../../components/ui/Button';
import { formatEUR } from '../../../lib/currency';

interface ResultStepProps {
  result: GeneratedListing;
  images: string[];
  error: string | null;
  onReset: () => void;
  onEdit: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onGoToStock: () => void;
  onCreateNew: () => void;
}

export function ResultStep({ result, images, error, onReset, onEdit, onSave, saving, saved, onGoToStock, onCreateNew }: ResultStepProps) {
  const handleCopyAll = () => {
    const t = [
      result.title, '',
      result.description, '',
      `Prix recommandé: ${formatEUR(result.price)}`,
      `Vente rapide: ${formatEUR(result.quick_price)}`,
      `Premium: ${formatEUR(result.premium_price)}`,
      `Marque: ${result.brand}`,
      `Catégorie: ${result.category}`,
      `Taille: ${result.size}`,
      `Couleur: ${result.color}`,
      `Matière: ${result.material}`,
      `État: ${result.condition}`,
      `Mots-clés: ${result.keywords.join(', ')}`,
    ].join('\n');
    navigator.clipboard.writeText(t);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <button onClick={onReset} className="flex items-center gap-2 text-sm text-gray-500 hover:text-neon-500 transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Nouvelle annonce
      </button>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">
            Annonce <span className="text-neon-500">prête</span>
          </h1>
          <p className="text-gray-500 text-sm">Optimisée pour Vinted</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" icon={<Copy className="w-4 h-4" />} onClick={handleCopyAll}>
            Copier tout
          </Button>
          <Button variant="secondary" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={onEdit}>
            Modifier
          </Button>
          <Button
            variant={saved ? 'success' : 'primary'}
            size="sm"
            icon={<Save className="w-4 h-4" />}
            loading={saving}
            disabled={saved}
            onClick={onSave}
          >
            {saved ? 'Sauvegarde !' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-red-700 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Empeche l'ecran-sans-suite apres sauvegarde : deux actions
          principales plutot que laisser l'utilisateur seul face a
          l'annonce deja enregistree (decision produit validee le
          2026-07-24, audit du parcours Generateur). */}
      {saved && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-neon-500/10 border border-neon-500/20 rounded-xl px-4 py-3.5 mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-neon-500 flex-shrink-0" />
            <p className="text-sm text-neon-500">Annonce enregistrée dans Mes annonces.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" icon={<Package className="w-3.5 h-3.5" />} onClick={onGoToStock}>
              Voir dans Mes annonces
            </Button>
            <Button variant="secondary" size="sm" onClick={onCreateNew}>
              Créer une nouvelle annonce
            </Button>
          </div>
        </div>
      )}

      {/* Image preview strip */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
          {images.map((src, i) => (
            <div key={i} className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface border border-gray-200 rounded-2xl p-5 sm:p-7 space-y-4">
        <FieldCard label="Titre SEO" value={result.title} icon={Tag} />
        <FieldCard label="Description" value={result.description} icon={Layers} />

        {/* Un seul prix dominant (le recommande) -- les deux alternatives
            restent visibles mais nettement secondaires, memes couleurs
            neutres que les FieldCard d'attributs ci-dessous plutot que
            trois accents concurrents de poids visuel egal (audit Brand
            Book, 2026-07-23). */}
        <div className="bg-neon-500/5 border border-neon-500/20 rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(124,92,255,0.12)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-neon-500" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/80">Prix recommandé</span>
            </div>
            <CopyBtn text={formatEUR(result.price)} />
          </div>
          <p className="text-3xl sm:text-4xl font-black text-neon-500">{formatEUR(result.price)}</p>
          {/* Provenance honnete du prix (2026-07-28) : jamais presenter une
              estimation Gemini comme une donnee de marche confirmee, ni
              l'inverse. price_source vient de analyze-clothing/index.ts --
              'market' seulement quand >= 3 vraies annonces comparables ont
              ete trouvees dans market_price_observations (couverture limitee
              a la Watchlist -- la majorite des generations restent
              honnetement 'ai_estimate'). */}
          {result.price_source === 'market' ? (
            <p className="flex items-center gap-1.5 text-[11px] text-neon-500/70 mt-2">
              <TrendingUp className="w-3 h-3 flex-shrink-0" />
              Basé sur {result.price_comparables_count} annonce{result.price_comparables_count > 1 ? 's' : ''} comparable{result.price_comparables_count > 1 ? 's' : ''} réelle{result.price_comparables_count > 1 ? 's' : ''}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-2">
              <Sparkles className="w-3 h-3 flex-shrink-0" />
              Estimation IA — pas de donnée de marché pour cet article
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Vente rapide', val: formatEUR(result.quick_price) },
            { label: 'Prix premium', val: formatEUR(result.premium_price) },
          ].map(({ label, val }) => (
            <div key={label} className="bg-dark-400 border border-gray-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
                <CopyBtn text={val} />
              </div>
              <p className="text-lg font-bold text-gray-700">{val}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <FieldCard label="Marque" value={result.brand} icon={Star} />
          <FieldCard label="Catégorie" value={result.category} icon={Layers} />
          <FieldCard label="Taille" value={result.size} icon={Ruler} />
          <FieldCard label="Couleur" value={result.color} icon={Palette} />
          <FieldCard label="Matière" value={result.material} icon={Tag} />
          <FieldCard label="État" value={result.condition} icon={Tag} />
        </div>

        <div className="bg-dark-400 border border-gray-200 rounded-xl p-4">
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

        <div className="bg-dark-400 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-neon-500/60" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">Filtres Vinted</span>
            </div>
            <CopyBtn text={result.vinted_filters.map((f) => `${f.label}: ${f.value}`).join('\n')} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {result.vinted_filters.map((f) => (
              <div key={f.label} onClick={() => navigator.clipboard.writeText(f.value)} className="bg-surface rounded-lg px-3 py-2 border border-gray-200 cursor-pointer hover:border-neon-500/20 transition-colors">
                <p className="text-[9px] font-mono uppercase tracking-wider text-gray-500 mb-0.5">{f.label}</p>
                <p className="text-xs text-gray-800">{f.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
