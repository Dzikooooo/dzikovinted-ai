import { describe, expect, it } from 'vitest';
import { ACTION_DEFINITIONS, findActionDefinition } from '../registry';

describe('ACTION_DEFINITIONS', () => {
  // Phase 3.1 (publication) a ajouté la première entrée réelle. Ce test
  // reste un garde-fou : il doit être mis à jour explicitement à chaque
  // nouvelle action enregistrée (Phase 3.2+), jamais "juste passer"
  // silencieusement.
  it('registers exactly the actions implemented so far', () => {
    expect(ACTION_DEFINITIONS.map((d) => d.kind)).toEqual(['publish_listing', 'edit_listing', 'scan_market']);
  });

  it('never registers the same kind twice', () => {
    const kinds = ACTION_DEFINITIONS.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('findActionDefinition', () => {
  it('finds a registered kind', () => {
    expect(findActionDefinition('publish_listing')).toBeDefined();
  });

  it('returns undefined for an unregistered kind', () => {
    expect(findActionDefinition('republish_listing')).toBeUndefined();
  });
});
