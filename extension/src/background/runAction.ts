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
import type { ActionKind, PublishStep, RunActionOutcome, RunActionRequest } from "../lib/messages";

type ActionHandler = (request: RunActionRequest, onProgress: (step: PublishStep) => void) => Promise<RunActionOutcome>;

const HANDLERS: Partial<Record<ActionKind, ActionHandler>> = {
  publish_listing: handlePublishListing,
};
// toute cle absente (Phase 3.1 : tout sauf publish_listing) tombe sur le
// fallback not_implemented

export async function runAction(
  request: RunActionRequest,
  onProgress: (step: PublishStep) => void = () => {}
): Promise<RunActionOutcome> {
  const handler = HANDLERS[request.kind];
  const outcome: RunActionOutcome = handler ? await handler(request, onProgress) : { status: "not_implemented" };
  logger.info("RUN_ACTION traité", { kind: request.kind, status: outcome.status });
  return outcome;
}
