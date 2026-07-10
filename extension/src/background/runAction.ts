// Action Engine (Phase 3, preparation) : registre de handlers d'execution
// cote extension, intentionnellement VIDE de tout handler qui ecrit
// reellement sur Vinted. Chaque ActionKind resout aujourd'hui vers
// 'not_implemented' - preuve que le pipe complet (app -> RUN_ACTION -> ici
// -> reponse -> maj action_log cote app) fonctionne de bout en bout sans
// jamais ecrire une seule donnee sur Vinted. Phase 3.1+ ajoutera de vrais
// handlers ici, un par ActionKind, avec alors les permissions tabs/scripting
// absentes aujourd'hui. Voir EXTENSION.md.
//
// L'app web est la seule a ecrire action_log (insert dans prepare(), update
// dans confirm()/cancel()) - ce module ne touche pas Supabase, seulement un
// lookup de registre local, pour eviter toute ecriture concurrente.

import { logger } from "./logger";
import type { ActionKind, RunActionOutcome, RunActionRequest } from "../lib/messages";

type ActionHandler = (request: RunActionRequest) => Promise<RunActionOutcome>;

const HANDLERS: Partial<Record<ActionKind, ActionHandler>> = {};
// vide en Phase 3 - toute cle absente tombe sur le fallback not_implemented

export async function runAction(request: RunActionRequest): Promise<RunActionOutcome> {
  const handler = HANDLERS[request.kind];
  const outcome: RunActionOutcome = handler ? await handler(request) : { status: "not_implemented" };
  logger.info("RUN_ACTION traité", { kind: request.kind, status: outcome.status });
  return outcome;
}
