// Action Engine : registre de handlers d'execution cote extension. La
// Phase 3 (preparation) l'a laisse intentionnellement vide - toute
// ActionKind resolvait alors 'not_implemented', prouvant que le pipe
// complet (app -> RUN_ACTION -> ici -> reponse -> maj action_log cote app)
// fonctionne de bout en bout sans jamais ecrire sur Vinted. La Phase 3.1
// ajoute le premier handler reel (publish_listing) ; les actions futures
// (republication, offres...) suivront le meme registre, jamais un nouveau
// mecanisme. Voir EXTENSION.md et ARCHITECTURE.md §4.6.
//
// L'app web est la seule a ecrire action_log (insert dans prepare(), update
// dans confirm()/cancel()) - ce module ne touche pas Supabase directement.

import { logger } from "./logger";
import { handlePublishListing } from "./handlers/publishListing";
import { handleEditListing } from "./handlers/editListing";
import type { ActionKind, PublishStep, RunActionOutcome, RunActionRequest } from "../lib/messages";

type ActionHandler = (request: RunActionRequest, onProgress: (step: PublishStep) => void) => Promise<RunActionOutcome>;

const HANDLERS: Partial<Record<ActionKind, ActionHandler>> = {
  publish_listing: handlePublishListing,
  edit_listing: handleEditListing,
};
// toute cle absente tombe sur le fallback not_implemented

// Maintien du service worker actif (Manifest V3, demande explicite
// 2026-07-17) : un service worker MV3 est eligible a la suspension par
// Chrome apres ~30s SANS appel d'API extension reel -- une Promise en
// attente (meme avec sendResponse() jamais encore appele) NE SUFFIT PAS a
// le garantir vivant, limite documentee de Manifest V3, distincte du
// delai metier lui-meme. Bug reel demontre le 2026-07-16 : une tentative
// edit_listing (prix reellement ecrit sur Vinted) est restee
// "pending_confirmation" plus de 7 minutes, aucun des deux filets de
// securite (setTimeout 90s cote extension ET cote app) ne s'etant
// declenche -- preuve que le contexte executant ces minuteurs a lui-meme
// ete interrompu.
//
// Solution : reutilise le port de progression DEJA ouvert par l'app
// (ACTION_PROGRESS_PORT_NAME, voir background/index.ts) -- un appel
// periodique a port.postMessage() (via le canal "heartbeat" DEDIE, distinct
// du canal "progress" -- voir ActionProgressPortMessage) est un VRAI appel
// d'API d'extension, qui reinitialise le minuteur d'inactivite de Chrome.
// Volontairement SEPARE de onProgress (et non une re-emission de la
// derniere etape sur le meme canal) pour que l'app ne journalise jamais
// une entree "Centre des Actions" en double pour la meme etape reemise
// toutes les 20s. Ce n'est pas une logique metier ni un delai qui
// gouverne la reussite/l'echec de l'action (celle-ci reste entierement
// pilotee par les evenements reels du content script) -- uniquement une
// garantie d'infrastructure. 20s < 30s (marge de securite) garantit
// qu'aucun intervalle d'inactivite reel ne peut jamais depasser le seuil
// de suspension. Coupe immediatement et inconditionnellement (finally) des
// que le handler se termine, succes ou echec -- jamais de service worker
// maintenu artificiellement actif apres la fin du pipeline.
const KEEPALIVE_INTERVAL_MS = 20000;

export async function runAction(
  request: RunActionRequest,
  onProgress: (step: PublishStep) => void = () => {},
  onKeepalive: () => void = () => {}
): Promise<RunActionOutcome> {
  const handler = HANDLERS[request.kind];
  logger.info(`[${request.historyId}] runAction : dispatch vers le handler`, {
    kind: request.kind,
    handlerTrouve: !!handler,
  });

  const keepaliveTimer = setInterval(() => {
    logger.debug(`[${request.historyId}] keepalive : maintien du service worker (aucune signification metier)`);
    onKeepalive();
  }, KEEPALIVE_INTERVAL_MS);

  try {
    const outcome: RunActionOutcome = handler ? await handler(request, onProgress) : { status: "not_implemented" };
    logger.info(`[${request.historyId}] RUN_ACTION traité`, { kind: request.kind, status: outcome.status });
    return outcome;
  } finally {
    clearInterval(keepaliveTimer);
  }
}
