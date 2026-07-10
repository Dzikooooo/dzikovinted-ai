import { ACTION_DEFINITIONS } from './handlers';
import type { ActionDefinition, ActionKind } from './types';

export function findActionDefinition(kind: ActionKind): ActionDefinition | undefined {
  return ACTION_DEFINITIONS.find((definition) => definition.kind === kind);
}

export { ACTION_DEFINITIONS };
