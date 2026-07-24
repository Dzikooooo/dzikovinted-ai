import type { Alert, Recommendation } from './insights/types';
import type { DashboardPage } from './types';
import { formatEUR } from './currency';

// Selectionne LA seule information qui merite l'attention de l'utilisateur
// en ouvrant le Dashboard (decision produit validee le 2026-07-23, remplace
// l'ancienne liste "Priorites du jour" de src/lib/insights/priorities.ts,
// qui classait alertes+recommandations par un score continu -- exactement
// le type d'heuristique floue explicitement ecarte ici).
//
// Regle : une chaine de conditions ordonnee, jamais un score. Le premier
// palier dont la condition est vraie l'emporte, sans exception :
//
//   1. Alerte critique   -- un probleme reel et urgent (aucune regle du
//      moteur n'emet 'critical' aujourd'hui, palier reserve pour l'avenir :
//      s'il en existe un jour, il doit dominer tout le reste sans debat).
//   2. Opportunite marche -- au moins une opportunite detectee dans les
//      dernieres 24h. Devant les alertes "warning" car une opportunite
//      d'achat est perissable (un autre revendeur peut la saisir avant
//      toi) ; un stock dormant ou une marge faible, eux, restent vrais
//      demain -- rien n'est perdu a les traiter un peu plus tard.
//   3. Alerte avertissement -- un probleme reel sur le stock existant
//      (severity 'warning'). Devant une simple recommandation d'optimisation.
//   4. Recommandation -- une suggestion actionnable sur une annonce precise.
//   5. Statistique principale -- repli toujours disponible, jamais vide :
//      le benefice du mois en cours.
//
// A egalite au sein d'un meme palier (ex. plusieurs alertes 'warning'),
// le premier element du tableau l'emporte -- cet ordre est deja
// deterministe en amont (ordre des listings x ordre fixe des regles dans
// alerts.ts/recommendations.ts), jamais un second tri ajoute ici.
export type DominantSignalTier = 'critical_alert' | 'opportunity' | 'warning_alert' | 'recommendation' | 'stat';

export interface DominantSignal {
  tier: DominantSignalTier;
  message: string;
  listingId?: string;
  actionPage: DashboardPage;
}

export interface DominantSignalInput {
  alerts: Alert[];
  recommendations: Recommendation[];
  newOpportunitiesLast24h: number;
  profitMonth: number;
}

export function computeDominantSignal(input: DominantSignalInput): DominantSignal {
  const criticalAlert = input.alerts.find((a) => a.severity === 'critical');
  if (criticalAlert) {
    return { tier: 'critical_alert', message: criticalAlert.message, listingId: criticalAlert.listingId, actionPage: 'stock' };
  }

  if (input.newOpportunitiesLast24h > 0) {
    const n = input.newOpportunitiesLast24h;
    return {
      tier: 'opportunity',
      message: `${n} nouvelle${n > 1 ? 's' : ''} opportunité${n > 1 ? 's' : ''} détectée${n > 1 ? 's' : ''} sur les dernières 24h.`,
      actionPage: 'opportunities',
    };
  }

  const warningAlert = input.alerts.find((a) => a.severity === 'warning');
  if (warningAlert) {
    return { tier: 'warning_alert', message: warningAlert.message, listingId: warningAlert.listingId, actionPage: 'stock' };
  }

  const topRecommendation = input.recommendations[0];
  if (topRecommendation) {
    return { tier: 'recommendation', message: topRecommendation.message, listingId: topRecommendation.listingId, actionPage: 'stock' };
  }

  const sign = input.profitMonth >= 0 ? '+' : '';
  return {
    tier: 'stat',
    message: `Bénéfice ce mois-ci : ${sign}${formatEUR(input.profitMonth)}.`,
    actionPage: 'stats',
  };
}
