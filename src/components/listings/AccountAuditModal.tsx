import { useState } from 'react';
import { Sparkles, AlertTriangle, ImageIcon, FileText, Clock3, RefreshCw, ArrowRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/ErrorBanner';
import { StatCard } from '../ui/StatCard';
import { auditAccount } from '../../lib/accountAuditService';
import type { AccountAudit, AccountAuditRecommendation } from '../../lib/types';

interface AccountAuditModalProps {
  onClose: () => void;
  // Compte Vinted SELECTIONNE dans le filtre du haut (VintedAccountFilterContext)
  // -- l'audit reste scope a ce compte precis, jamais tout le catalogue par
  // defaut (demande explicite 2026-08-30). `undefined`/'all' = tous les
  // comptes, comportement precedent conserve pour ce cas.
  vintedAccountId?: string;
  accountLabel: string;
  // "Injection" dans les cartes (demande explicite) : ouvre directement la
  // fiche de l'annonce concernee depuis une ligne du rapport -- l'appelant
  // (ListingsManagementSection.tsx) sait deja retrouver la Listing complete
  // par id et ouvrir ListingDetailModal, cette modale ne connait que l'id/titre.
  onOpenListing: (id: string) => void;
}

const SEVERITY_STYLE: Record<AccountAuditRecommendation['severity'], { label: string; className: string }> = {
  haute: { label: 'Haute', className: 'bg-red-500/10 text-red-700 border-red-500/20' },
  moyenne: { label: 'Moyenne', className: 'bg-amber-400/10 text-amber-700 border-amber-400/20' },
  basse: { label: 'Basse', className: 'bg-gray-100 text-gray-700 border-gray-200' },
};

function scoreTone(score: number): 'positive' | 'attention' | 'negative' {
  if (score >= 70) return 'positive';
  if (score >= 40) return 'attention';
  return 'negative';
}

// Audit du compte Vinted (2026-08-30, remplace Pricer Pro) -- meme principe
// que l'ancienne ListingAuditModal (retiree) : jamais de declenchement
// automatique a l'ouverture, un clic explicite reste necessaire (consomme 1
// credit, meme discipline "1 credit = 1 action IA" que le reste du produit).
// Perimetre "stock actuel du compte selectionne" (voir accountAuditService.ts) --
// les compteurs et le rapport ci-dessous decrivent EXACTEMENT les memes
// regles que les contours colores des cartes (src/lib/listingQuality.ts),
// jamais un chiffre different affiche a deux endroits du produit.
export function AccountAuditModal({ onClose, vintedAccountId, accountLabel, onOpenListing }: AccountAuditModalProps) {
  const [audit, setAudit] = useState<AccountAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await auditAccount(vintedAccountId);
      setAudit(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'audit a échoué. Réessaie plus tard.");
    }
    setLoading(false);
  };

  const sortedRecommendations = audit
    ? [...audit.recommendations].sort((a, b) => {
        const order = { haute: 0, moyenne: 1, basse: 2 };
        return order[a.severity] - order[b.severity];
      })
    : [];

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-neon-500" />
            Analyse du compte <span className="text-gray-500 font-normal text-sm">Vinted</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Stock actuellement en ligne — <span className="font-semibold text-gray-700">{accountLabel}</span>.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      {!audit && !loading && (
        <div className="bg-dark-400 border border-gray-200 rounded-xl p-5 text-center">
          <p className="text-sm text-gray-600 mb-2">
            Analyse le stock actuellement en ligne de <span className="font-semibold">{accountLabel}</span> (photos,
            descriptions, catégorisation, fraîcheur) et génère un rapport de recommandations concret.
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Ce premier audit ne couvre que tes annonces — la photo de profil et la bio Vinted ne sont pas encore analysées.
          </p>
          <Button icon={<Sparkles className="w-4 h-4" />} onClick={runAudit}>
            Lancer l'analyse (1 crédit)
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Sparkles className="w-6 h-6 text-neon-500 animate-pulse" />
          <span className="ml-3 text-sm text-gray-500">Analyse de ton stock en cours...</span>
        </div>
      )}

      {audit && (
        <div className="space-y-5">
          <div className="bg-neon-500/5 border border-neon-500/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-shrink-0 text-center sm:text-left">
              <p className="text-[10px] font-mono uppercase tracking-wider text-neon-500/80 mb-1">Score global</p>
              <p className={`text-4xl font-black ${scoreTone(audit.stats.score) === 'positive' ? 'text-green-700' : scoreTone(audit.stats.score) === 'attention' ? 'text-amber-700' : 'text-red-700'}`}>
                {audit.stats.score}<span className="text-lg text-gray-500">/100</span>
              </p>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{audit.summary}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Annonces en stock" value={audit.stats.totalListings} />
            <StatCard
              label="Sans défaut"
              value={audit.stats.perfectCount}
              tone={audit.stats.perfectCount === audit.stats.totalListings ? 'positive' : 'neutral'}
            />
            <StatCard
              label="Sans photo"
              value={audit.stats.noPhotoCount}
              tone={audit.stats.noPhotoCount > 0 ? 'negative' : 'positive'}
              icon={ImageIcon}
            />
            <StatCard
              label="Description courte"
              value={audit.stats.missingDescriptionCount}
              tone={audit.stats.missingDescriptionCount > 0 ? 'attention' : 'positive'}
              icon={FileText}
            />
            <StatCard
              label="En stock +21j"
              value={audit.stats.agingCount}
              tone={audit.stats.agingCount > 0 ? 'attention' : 'positive'}
              icon={Clock3}
            />
            <StatCard
              label="À republier"
              value={audit.stats.needsRepublishCount}
              tone={audit.stats.needsRepublishCount > 0 ? 'attention' : 'positive'}
              icon={RefreshCw}
            />
            <StatCard label="Catégorie phare" value={audit.stats.topCategory ?? '—'} />
            <StatCard label="Marque phare" value={audit.stats.topBrand ?? '—'} />
          </div>

          {sortedRecommendations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Recommandations</p>
              {sortedRecommendations.map((rec, i) => (
                <div key={i} className="bg-dark-400 border border-gray-200 rounded-xl p-3.5 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-gray-900">{rec.category}</span>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[rec.severity].className}`}>
                        {SEVERITY_STYLE[rec.severity].label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{rec.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {audit.stats.flaggedListings.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                Annonces concernées ({audit.stats.flaggedListings.length})
              </p>
              <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                {audit.stats.flaggedListings.map((listing) => (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => onOpenListing(listing.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left bg-dark-400 hover:bg-neon-500/5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{listing.title}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {listing.topMessage}
                        {listing.issueCount > 1 && ` (+${listing.issueCount - 1} autre${listing.issueCount > 2 ? 's' : ''})`}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={runAudit}>Relancer l'analyse (1 crédit)</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
