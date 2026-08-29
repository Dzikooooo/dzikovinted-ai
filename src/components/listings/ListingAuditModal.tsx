import { useState } from 'react';
import { Sparkles, Tag, Layers, TrendingUp, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/ErrorBanner';
import { FieldCard } from '../ui/FieldCard';
import { CopyBtn } from '../ui/CopyBtn';
import { formatEUR } from '../../lib/currency';
import { auditListing } from '../../lib/auditService';
import { supabase } from '../../lib/supabase';
import type { Listing, ListingAudit } from '../../lib/types';

interface ListingAuditModalProps {
  listing: Listing;
  onClose: () => void;
  onApplied: () => void;
}

// Pricer Pro -- audit d'une annonce deja publiee (2026-08-29). Contrairement
// au Generateur (analyseWithAI), l'audit ne se lance JAMAIS automatiquement
// a l'ouverture de la modale : consomme 1 credit (meme principe "1 credit =
// 1 action IA" que le reste du produit), un clic explicite reste necessaire
// pour ne jamais facturer un credit pour une modale ouverte par erreur.
export function ListingAuditModal({ listing, onClose, onApplied }: ListingAuditModalProps) {
  const [audit, setAudit] = useState<ListingAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await auditListing(listing.id);
      setAudit(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'audit a échoué. Réessaie plus tard.");
    }
    setLoading(false);
  };

  const applySuggestions = async () => {
    if (!audit) return;
    setApplying(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('listings')
      .update({ title: audit.suggested_title, description: audit.suggested_description })
      .eq('id', listing.id);
    setApplying(false);
    if (updateError) {
      console.error(updateError);
      setError("Impossible d'appliquer les suggestions. Réessaie plus tard.");
      return;
    }
    setApplied(true);
    onApplied();
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-neon-500" />
            Pricer Pro <span className="text-gray-500 font-normal text-sm">— audit d'annonce</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">{listing.title}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      {!audit && !loading && (
        <div className="bg-dark-400 border border-gray-200 rounded-xl p-5 text-center">
          <p className="text-sm text-gray-600 mb-4">
            Analyse le titre, la description, la catégorie et l'état actuels de cette annonce, et propose des
            améliorations SEO concrètes ainsi qu'un repère de prix basé sur le marché quand assez de données existent.
          </p>
          <Button icon={<Sparkles className="w-4 h-4" />} onClick={runAudit}>
            Lancer l'audit (1 crédit)
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Sparkles className="w-6 h-6 text-neon-500 animate-pulse" />
          <span className="ml-3 text-sm text-gray-500">Analyse en cours...</span>
        </div>
      )}

      {audit && (
        <div className="space-y-4">
          <FieldCard label="Titre suggéré" value={audit.suggested_title} icon={Tag} />
          <FieldCard label="Description suggérée" value={audit.suggested_description} icon={Layers} />

          {audit.keywords.length > 0 && (
            <div className="bg-dark-400 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-neon-500/60" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">Mots-clés SEO</span>
                </div>
                <CopyBtn text={audit.keywords.map((k) => `#${k.replace(/\s+/g, '')}`).join(' ')} />
              </div>
              <div className="flex flex-wrap gap-2">
                {audit.keywords.map((kw) => (
                  <span key={kw} className="px-3 py-1 text-xs font-mono bg-neon-500/10 text-neon-500 rounded-full border border-neon-500/20">
                    #{kw.replace(/\s+/g, '')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {audit.category_note && (
            <p className="text-sm text-gray-600 flex items-start gap-2">
              <Layers className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
              {audit.category_note}
            </p>
          )}
          {audit.photo_note && (
            <p className="text-sm text-gray-600 flex items-start gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
              {audit.photo_note}
            </p>
          )}

          {/* Prix : honnete, jamais devine sans donnee -- voir marketEngine.ts.
              pricing===null (tier 'none') affiche explicitement l'absence de
              comparables plutot qu'un silence qui laisserait croire a un oubli. */}
          <div className="bg-neon-500/5 border border-neon-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-neon-500" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/80">Repère de prix marché</span>
            </div>
            {audit.price?.pricing ? (
              <>
                <p className="text-3xl font-black text-neon-500">{formatEUR(audit.price.pricing.price)}</p>
                <p className="text-[11px] text-neon-500/70 mt-2">
                  Basé sur {audit.price.comparablesCount} annonce{audit.price.comparablesCount > 1 ? 's' : ''} comparable{audit.price.comparablesCount > 1 ? 's' : ''} réelle{audit.price.comparablesCount > 1 ? 's' : ''}
                  {' '}(vente rapide {formatEUR(audit.price.pricing.quickPrice)}, premium {formatEUR(audit.price.pricing.premiumPrice)})
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Pas assez de données de marché pour cette marque et cette catégorie — aucun prix comparatif fiable à afficher.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={runAudit}>Relancer (1 crédit)</Button>
            <Button
              size="sm"
              variant={applied ? 'success' : 'primary'}
              icon={applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              loading={applying}
              disabled={applied}
              onClick={applySuggestions}
            >
              {applied ? 'Appliqué !' : 'Appliquer titre + description'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
