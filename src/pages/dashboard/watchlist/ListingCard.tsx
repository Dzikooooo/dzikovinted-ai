import {
  Sparkles, Clock, Eye, Heart, Lightbulb, UploadCloud,
  CheckSquare, Square, Info, History, CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react';
import type { Listing } from '../../../lib/types';
import { Button } from '../../../components/ui/Button';
import AccountAvatar from '../../../components/ui/AccountAvatar';
import VintedStatusBadge from '../../../components/ui/VintedStatusBadge';
import { OneScoreBar } from '../../../components/ui/OneScoreBar';
import { AGING_STOCK_DAYS } from '../../../lib/insights/constants';
import { formatEUR } from '../../../lib/currency';
import type { ListingRecommendationResult } from '../../../lib/insights/types';
import { needsRepublish } from '../../../lib/listingStatus';
import { formatScheduleLabel, isoToLocalDateTime, type RepublishSchedule } from '../../../lib/republishSchedule';
import { explainRepublishFailure } from '../../../lib/republishOutcome';
import type { RepublishOutcomeRow } from '../../../services/republishSchedules';
import { Card } from '../../../components/ui/Card';

// Extrait de ListingsManagementSection.tsx (audit 2026-08-28, Phase 2 --
// "renforcer le coeur avant d'empiler dessus") : ListingCard etait defini
// dans le meme fichier de 1845 lignes que tout l'etat/la logique de la page
// "Mes annonces". Aucun changement de comportement -- meme JSX, memes
// props, RepublishOutcomeBlock/MiniValue restent des helpers PRIVES a ce
// fichier (jamais utilises ailleurs, voir grep avant extraction).

export interface ListingCardProps {
  item: Listing;
  selected: boolean;
  onToggleSelect: () => void;
  showAccount: boolean;
  accountLabel: (id: string | null) => string;
  score: number | null;
  recommendationState: ListingRecommendationResult | undefined;
  aging: boolean;
  onMarkSold: () => void;
  onOpenDetail: () => void;
  // Republication depuis la carte (2026-08-26) : l'action n'existait que dans
  // la barre groupee, et exigeait donc de SELECTIONNER l'annonce d'abord.
  // Optionnel : la carte ne l'affiche que si l'appelant la fournit ET que
  // l'annonce en releve reellement (needsRepublish).
  onRepublish?: () => void;
  // Mission "UI DE PROGRAMMATION DES REPUBLICATIONS" (2026-08-20) : tous
  // optionnels -- une carte sans programmation (cas normal) ne rend rien de
  // plus qu'avant. `schedule` ne rend un affichage que si mode==='scheduled'
  // (jamais pour {mode:'now'}). Depuis le round 2, derive d'une ligne
  // republish_schedules reelle via toUiSchedule() -- {mode:'now'} n'est
  // toujours construit nulle part, une absence de programmation reste
  // `undefined`, jamais devine.
  schedule?: RepublishSchedule;
  onEditSchedule?: () => void;
  onCancelSchedule?: () => void;
  // Mission "ROUND 5" (2026-08-23) : resultat d'une republication programmee
  // deja EXECUTEE. `undefined` = rien a montrer (aucune execution recente, ou
  // resultat deja acquitte par l'utilisateur) -- l'appelant filtre les
  // acquittes, la carte ne connait pas le localStorage.
  outcome?: RepublishOutcomeRow;
  onAcknowledgeOutcome?: () => void;
  onRescheduleAfterFailure?: () => void;
}

export function ListingCard({ item, selected, onToggleSelect, showAccount, accountLabel, score, recommendationState, aging, onMarkSold, onOpenDetail, onRepublish, schedule, onEditSchedule, onCancelSchedule, outcome, onAcknowledgeOutcome, onRescheduleAfterFailure }: ListingCardProps) {
  const isSold = item.status === 'vendu';
  const hasCost = item.purchase_price !== null;
  const margin = isSold
    ? Number(item.sold_price || 0) - Number(item.purchase_price || 0) - Number(item.fees || 0)
    : Number(item.price || 0) - Number(item.purchase_price || 0);
  const roi = hasCost && Number(item.purchase_price) > 0 ? Math.round((margin / Number(item.purchase_price)) * 100) : 0;

  return (
    <Card
      padding="none"
      background="alt"
      interactive
      selected={selected}
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail();
        }
      }}
      aria-label={`Voir le détail de ${item.title}`}
      // Card ne porte que la bordure/l'ombre/le hover (etat interactive/
      // selected) -- le focus-ring reste ici, specifique a cette carte
      // precise agissant comme un bouton clavier (role="button"), pas une
      // generalisation que tout Card interactif devrait porter.
      className="group overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-500"
    >
      <div className="relative h-32 bg-dark-400 border-b border-gray-200 overflow-hidden">
        {item.image_urls?.[0] ? (
          <img src={item.image_urls[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <Sparkles className="w-8 h-8" />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          aria-label={selected ? 'Désélectionner' : 'Sélectionner'}
          className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
            selected ? 'bg-neon-600 text-white' : 'bg-black/60 text-white hover:bg-black/80'
          }`}
        >
          {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </button>
        {item.vinted_status && (
          <div className="absolute top-2 right-2">
            <VintedStatusBadge status={item.vinted_status} />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="font-semibold text-sm text-gray-900 truncate">{item.title}</p>
        </div>
        {item.sku !== null && <p className="text-[11px] text-gray-500 font-mono mb-1">#{item.sku}</p>}
        <p className="text-xs text-gray-500 truncate">{[item.brand, item.category, item.size].filter(Boolean).join(' · ') || '—'}</p>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-[11px] ${isSold ? 'text-green-700' : item.status === 'en_attente' ? 'text-amber-700' : 'text-neon-500'}`}>
            {isSold ? 'Vendu' : item.status === 'draft' ? 'Brouillon' : item.status === 'en_attente' ? 'En attente' : 'En stock'}
          </span>
          {aging && (
            <span className="flex items-center gap-1 text-[11px] text-amber-700">
              <Clock className="w-3 h-3" /> +{AGING_STOCK_DAYS}j
            </span>
          )}
          {item.vinted_sync_status === 'sync_failed' && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-700 border border-red-500/20">
              Échec sync
            </span>
          )}
          {showAccount && item.vinted_account_id && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <AccountAvatar label={accountLabel(item.vinted_account_id)} size="sm" />
              {accountLabel(item.vinted_account_id)}
            </span>
          )}
          {item.views !== null && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500"><Eye className="w-3 h-3" /> {item.views}</span>
          )}
          {item.favourites !== null && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500"><Heart className="w-3 h-3" /> {item.favourites}</span>
          )}
        </div>

        {/* 'attendre' reste volontairement silencieux (aucun badge) -- les 3
            autres etats du Decision Engine (action/donnees_insuffisantes/
            recommandation_differee) restent visuellement distincts, jamais
            confondus (voir LOT1_SPEC.md). */}
        {recommendationState?.status === 'action' && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold text-neon-500 bg-neon-500/10 px-1.5 py-0.5 rounded-md mt-2"
            title={recommendationState.reason}
          >
            <Lightbulb className="w-3 h-3" /> {recommendationState.message}
            {recommendationState.confidence === 'standard' && (
              <span className="font-normal text-neon-500/70">· à confirmer</span>
            )}
          </span>
        )}
        {recommendationState?.status === 'donnees_insuffisantes' && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md mt-2"
            title={recommendationState.reason}
          >
            <Info className="w-3 h-3" /> Données insuffisantes
          </span>
        )}
        {recommendationState?.status === 'recommandation_differee' && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded-md mt-2"
            title={recommendationState.reason}
          >
            <History className="w-3 h-3" /> Action déjà tentée récemment
          </span>
        )}

        {score !== null && <OneScoreBar score={score} size="sm" className="mt-2" />}

        {/* Le prix devient l'element dominant du bas de carte. Avant, il
            partageait une grille de 4 colonnes avec Achat/Marge/ROI, tous
            trois affiches en "—" tant qu'aucun prix d'achat n'est saisi --
            soit, en pratique, sur la majorite des annonces importees depuis
            Vinted. Trois tirets sur quatre colonnes, c'est du bruit qui
            noyait la seule valeur reellement connue. */}
        <div className="flex items-end justify-between gap-3 mt-3 pt-3 border-t border-gray-200">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              {isSold ? 'Prix de vente' : 'Prix'}
            </p>
            <p className="text-lg font-black text-gray-900 tabular-nums leading-tight">
              {formatEUR(isSold ? item.sold_price ?? 0 : item.price ?? 0)}
            </p>
          </div>
          {/* Achat / Marge / ROI n'apparaissent QUE s'ils sont connus. */}
          {hasCost && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <MiniValue label="Achat" value={formatEUR(item.purchase_price!)} />
              <MiniValue label={isSold ? 'Bénéfice' : 'Marge'} value={formatEUR(margin)} highlight />
              {Number(item.purchase_price) > 0 && <MiniValue label="ROI" value={`${roi} %`} highlight />}
            </div>
          )}
        </div>

        {/* Mission "ROUND 5" : resultat d'une republication programmee deja
            executee. Rendu AVANT le bloc "Programmée le..." -- si
            l'utilisateur a deja reprogramme, il voit le resultat passe puis
            la prochaine echeance, dans l'ordre chronologique. */}
        {outcome && (
          <RepublishOutcomeBlock
            outcome={outcome}
            onAcknowledge={onAcknowledgeOutcome}
            onReschedule={onRescheduleAfterFailure}
          />
        )}

        {schedule?.mode === 'scheduled' && (
          <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-neon-500">
              <Clock className="w-3 h-3" /> Programmée le {formatScheduleLabel(schedule.date, schedule.time)}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditSchedule?.();
                }}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-900"
              >
                Modifier
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelSchedule?.();
                }}
                className="text-[11px] font-semibold text-red-700 hover:text-red-700"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Actions selon le STATUT reel : "Republier" n'apparait que pour une
            annonce qui en releve (en stock, absente de Vinted), et jamais sur
            une annonce vendue. */}
        {!isSold && (
          <div className="flex gap-2 mt-3">
            {onRepublish && needsRepublish(item) && (
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                icon={<UploadCloud className="w-3.5 h-3.5" />}
                // Nom accessible qui NOMME l'annonce : une grille en affiche
                // plusieurs, et "Republier" seul ne dit pas laquelle -- ni a
                // un lecteur d'ecran, ni a un test. Ce libelle le distingue
                // aussi du "Republier" de la barre d'action groupee, qui
                // porte sur la selection et non sur cette carte.
                aria-label={`Republier ${item.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRepublish();
                }}
              >
                Republier
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onMarkSold();
              }}
            >
              Marquer vendu
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// Mission "ROUND 5 -- RESULTAT D'UNE REPUBLICATION PROGRAMMEE" (2026-08-23).
// Repond au trou identifie a l'audit : l'extension ecrivait bien
// succeeded/failed en base, mais l'app ne lisait que scheduled/running -- une
// republication executee la nuit disparaissait sans laisser de trace, ECHEC
// COMPRIS. Un echec silencieux contredit frontalement la promesse produit
// affichee en FAQ ("toujours apres ta confirmation, jamais en silence").
//
// Le message d'erreur BRUT n'est jamais affiche tel quel (regle explicite de
// l'utilisateur) : explainRepublishFailure() en tire un message vendeur +
// une piste d'action, et conserve le brut dans un <details> replie pour un
// rapport de bug exploitable.
//
// "Reprogrammer" n'est propose que si l'echec a une chance d'aboutir au
// second essai (canReschedule) -- reproposer l'action apres "annonce
// supprimee" ferait echouer l'utilisateur une deuxieme fois.
function RepublishOutcomeBlock({
  outcome,
  onAcknowledge,
  onReschedule,
}: {
  outcome: RepublishOutcomeRow;
  onAcknowledge?: () => void;
  onReschedule?: () => void;
}) {
  const completedLabel = outcome.completed_at
    ? (() => {
        const { date, time } = isoToLocalDateTime(outcome.completed_at as string);
        return formatScheduleLabel(date, time);
      })()
    : null;

  if (outcome.status === 'succeeded') {
    return (
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            Republiée{completedLabel ? ` le ${completedLabel}` : ''}
          </span>
          {onAcknowledge && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
              }}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 flex-shrink-0"
            >
              OK
            </button>
          )}
        </div>
        {outcome.result_vinted_url && (
          <a
            href={outcome.result_vinted_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-neon-500 hover:text-neon-400"
          >
            Voir la nouvelle annonce <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  }

  const explanation = explainRepublishFailure(outcome.error_message);

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-start gap-1.5 text-[11px] font-semibold text-red-700">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>{explanation.message}</span>
        </span>
        {onAcknowledge && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAcknowledge();
            }}
            className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 flex-shrink-0"
          >
            OK
          </button>
        )}
      </div>

      {explanation.hint && <p className="mt-1 text-[11px] text-gray-500">{explanation.hint}</p>}

      {/* "Tentative precedente" et non "Tentative du ..." (retour test reel
          2026-08-24) : cette ligne peut s'afficher JUSTE AU-DESSUS d'un bloc
          "Programmée le ..." qui, lui, concerne un cycle DIFFERENT et encore a
          venir. Le libelle d'origine laissait croire a une incoherence de date
          alors que les deux dates etaient correctes -- il s'agissait bien de
          deux programmations distinctes. */}
      {completedLabel && <p className="mt-1 text-[10px] text-gray-500">Tentative précédente : {completedLabel}</p>}

      {explanation.canReschedule && onReschedule && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReschedule();
          }}
          className="mt-2 text-[11px] font-semibold text-neon-500 hover:text-neon-400"
        >
          Reprogrammer
        </button>
      )}

      {explanation.technicalDetail && (
        <details className="mt-2" onClick={(e) => e.stopPropagation()}>
          <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-500">Détail technique</summary>
          <p className="mt-1 text-[10px] font-mono text-gray-500 break-words">{explanation.technicalDetail}</p>
        </details>
      )}
    </div>
  );
}

function MiniValue({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-gray-500 truncate">{label}</p>
      <p className={`text-xs font-bold truncate ${highlight ? 'text-neon-500' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}
