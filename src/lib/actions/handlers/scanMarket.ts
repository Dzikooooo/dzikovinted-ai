import { checkAuthenticated, checkNoScanInProgress } from '../checks';
import { supabase } from '../../supabase';
import type { ActionDefinition, ActionOutcome } from '../types';

// Aucune donnee necessaire au declenchement - le scan porte sur toute la
// watchlist active de l'utilisateur, lue cote serveur (par le workflow
// GitHub Actions declenche) - jamais transmise par le client, qui n'a pas a
// en connaitre le contenu pour lancer un scan.
export type ScanMarketPayload = Record<string, never>;

interface DispatchResponse {
  dispatched: boolean;
}

// Playwright ne peut pas tourner dans une Edge Function - confirme en
// direct le 2026-07-11 (voir supabase/functions/scan-market/index.ts).
// Le scan reel tourne via le workflow GitHub Actions existant
// (scripts/vinted-scan.ts, deja eprouve en production), demarre
// immediatement au lieu d'attendre le cron de 4h.
//
// CE DELAI COUVRE TOUTE LA CHAINE, pas seulement le scan : mise en file et
// demarrage du runner, `npm ci`, `npx playwright install --with-deps
// chromium` (l'etape la plus lourde du workflow, refaite a chaque run), PUIS
// le scan lui-meme.
//
// 6 minutes ne suffisaient plus (2026-08-26) : sur une watchlist de 24
// recherches, le scan seul depassait ce delai et la modale annoncait un
// echec pendant que le job finissait normalement -- exactement le symptome
// remonte par l'utilisateur. Les optimisations du meme jour (attente
// adaptative des cartes, galeries plafonnees au top 30 et parallelisees a 2,
// reutilisation des galeries connues) ramenent le scan a ~4 min ESTIMEES,
// auxquelles s'ajoutent ~2 a 3 min de mise en route CI.
//
// A RE-CALIBRER sur du mesure : ce 10 minutes vient d'un budget reconstitue
// depuis le code, pas d'un run chronometre. La ligne "[timing] RECAPITULATIF"
// des logs GitHub Actions donne desormais le vrai temps de cycle -- ajuster
// des qu'on en a deux ou trois.
//
// Un delai trop LONG ne coute presque rien : le sondage de secours detecte la
// fin des qu'elle arrive, le timeout ne se declenche que si le job est
// reellement bloque. Un delai trop COURT, lui, fait mentir l'interface.
const TERMINAL_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

// Message ecrit tel quel dans action_log.error_message au timeout client -
// useActionEngine.ts::prepareAction() s'appuie sur ce texte exact pour
// continuer a considerer un scan comme "en cours" apres ce timeout (voir
// checkNoScanInProgress) : le job GitHub Actions peut tres bien tourner
// encore et ecrire son propre statut terminal plus tard via service_role,
// qui ecrasera alors ce message. Sans ce garde-fou, le timeout client
// levait a tort le blocage anti-double-scan, permettant de lancer un 2e
// scan concurrent pendant que le 1er tournait toujours (race confirmee,
// audit du parcours Scanner, 2026-07-24).
export const SCAN_TIMEOUT_ERROR_MESSAGE =
  "Le scan prend plus de temps que prévu. Vérifie le Centre des Actions dans quelques minutes — il se peut qu'il se termine quand même.";

async function extractErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === 'string' && body.error.length > 0) return body.error;
      } catch {
        // corps non-JSON ou deja consomme - retombe plus bas
      }
      return `Erreur Edge Function (${context.status})`;
    }
  }
  if (error instanceof Error) return error.message;
  return 'Le scan a échoué pour une raison inconnue.';
}

// Frequence du sondage de secours ci-dessous -- assez rapide pour rester
// invisible pour l'utilisateur, assez espace pour ne jamais peser sur la
// base sur toute la duree d'un scan (jusqu'a 10 minutes, donc <= ~40
// requetes par scan).
const FALLBACK_POLL_INTERVAL_MS = 15000;

// Le declenchement (execute() ci-dessous) rend la main des que le workflow
// GitHub Actions est lance - le travail reel se termine de facon
// asynchrone, minutes plus tard, quand scripts/vinted-scan.ts ecrit
// lui-meme le statut terminal (authentifie en service_role, meme table
// action_log que le reste de l'Action Engine). On attend ce statut via
// Realtime, complete par un sondage de secours (voir plus bas) plutot que
// par polling seul, meme mecanisme deja etabli pour le Centre des Actions
// (useActionHistory.ts).
//
// BUG REEL confirme le 2026-08-04 (diagnostic "le scan ne se termine
// jamais") : un scan reel a termine avec succes cote base (status='success'
// ecrit par scripts/vinted-scan.ts en 5m3s, largement sous les 6 minutes de
// TERMINAL_WAIT_TIMEOUT_MS) sans que la modale ne le reflete jamais -- le
// seul mecanisme de reception cote client etait l'evenement Realtime UPDATE
// + une unique verification au moment de l'abonnement, sans aucun sondage
// pendant l'attente. Un canal Realtime qui rate son evenement (onglet mis en
// arriere-plan, reconnexion WebSocket silencieuse, etc. -- comportement deja
// documente comme non garanti pour Supabase Realtime) laissait alors la
// modale bloquee jusqu'au timeout local de 6 minutes, et potentiellement
// au-dela si ce meme setTimeout etait lui-meme retarde par le throttling
// d'un onglet en arriere-plan. Le sondage de secours ci-dessous rend la
// detection de fin independante de la fiabilite d'un seul evenement Realtime.
function waitForTerminalOutcome(historyId: string): Promise<ActionOutcome> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (outcome: ActionOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      clearInterval(pollHandle);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
      resolve(outcome);
    };

    // Un onglet mis en arriere-plan peut retarder aussi bien la reception
    // Realtime que setInterval/setTimeout (throttling navigateur) -- au
    // retour au premier plan, verifie immediatement au lieu d'attendre le
    // prochain tick du sondage (jusqu'a FALLBACK_POLL_INTERVAL_MS de plus).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkNow();
    };
    document.addEventListener('visibilitychange', onVisible);

    const timeoutHandle = setTimeout(() => {
      settle({ status: 'error', errorMessage: SCAN_TIMEOUT_ERROR_MESSAGE });
    }, TERMINAL_WAIT_TIMEOUT_MS);

    async function checkNow() {
      const { data } = await supabase
        .from('action_log')
        .select('status, result_payload, error_message')
        .eq('id', historyId)
        .single();
      if (!data) return;
      if (data.status === 'success') {
        settle({ status: 'success', resultPayload: (data.result_payload as Record<string, unknown>) ?? {} });
      } else if (data.status === 'error') {
        settle({ status: 'error', errorMessage: data.error_message ?? 'Le scan a échoué.' });
      }
    }

    const channel = supabase
      .channel(`scan_market_wait_${historyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'action_log', filter: `id=eq.${historyId}` },
        () => void checkNow()
      )
      .subscribe();

    const pollHandle = setInterval(() => void checkNow(), FALLBACK_POLL_INTERVAL_MS);

    // Verification immediate : couvre le cas rare ou le statut terminal
    // aurait deja ete ecrit avant que l'abonnement Realtime ne soit actif.
    void checkNow();
  });
}

// execute() dedie (pas d'appel a l'extension) : premiere action du
// registre a le faire - voir engine.ts::confirm(), qui bascule sur
// execute() quand il est fourni au lieu de deps.runViaExtension().
export const scanMarketDefinition: ActionDefinition<ScanMarketPayload> = {
  kind: 'scan_market',
  label: 'Scanner le marché',
  checks: [checkAuthenticated, checkNoScanInProgress],
  buildPreview: () => ({
    summary: 'Scanner le marché Vinted pour de nouvelles opportunités',
    details: {},
  }),
  execute: async (_request, _ctx, _deps, historyId): Promise<ActionOutcome> => {
    const { data, error } = await supabase.functions.invoke<DispatchResponse>('scan-market', {
      body: { action_id: historyId },
    });

    if (error) {
      return { status: 'error', errorMessage: await extractErrorMessage(error) };
    }
    if (!data?.dispatched) {
      return { status: 'error', errorMessage: "Le scan n'a pas pu être déclenché." };
    }

    return waitForTerminalOutcome(historyId);
  },
};
