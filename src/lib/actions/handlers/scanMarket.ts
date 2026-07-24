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
// immediatement au lieu d'attendre le cron de 4h. Demarrage de runner +
// installation de Playwright + scan reel : quelques minutes, marge large
// prise ici.
const TERMINAL_WAIT_TIMEOUT_MS = 6 * 60 * 1000;

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

// Le declenchement (execute() ci-dessous) rend la main des que le workflow
// GitHub Actions est lance - le travail reel se termine de facon
// asynchrone, minutes plus tard, quand scripts/vinted-scan.ts ecrit
// lui-meme le statut terminal (authentifie en service_role, meme table
// action_log que le reste de l'Action Engine). On attend ce statut via
// Realtime plutot que par polling, meme mecanisme deja etabli pour le
// Centre des Actions (useActionHistory.ts).
function waitForTerminalOutcome(historyId: string): Promise<ActionOutcome> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (outcome: ActionOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      void supabase.removeChannel(channel);
      resolve(outcome);
    };

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
