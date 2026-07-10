import { describe, expect, it } from 'vitest';
import { ACTION_DEFINITIONS, findActionDefinition } from '../registry';

describe('ACTION_DEFINITIONS', () => {
  // Garde-fou volontaire : cette phase (préparation du Action Engine, voir
  // ROADMAP.md) n'enregistre aucune action réelle. Ce test doit être mis à
  // jour explicitement dès que la Phase 3.1 ajoute la première entrée
  // (publication) - il ne doit jamais "juste passer" silencieusement.
  it('is empty until the first real action is registered (Phase 3.1+)', () => {
    expect(ACTION_DEFINITIONS).toHaveLength(0);
  });
});

describe('findActionDefinition', () => {
  it('returns undefined for any kind while the registry is empty', () => {
    expect(findActionDefinition('republish_listing')).toBeUndefined();
    expect(findActionDefinition('publish_listing')).toBeUndefined();
  });
});
