import { describe, expect, it } from 'vitest';
import { ACTION_KIND_LABELS, ACTION_KIND_ICONS, ACTION_STEP_LOG_MESSAGES } from '../labels';
import { ACTION_STEP_ORDER } from '../types';
import type { ActionKind } from '../types';

// Garde-fou : toute nouvelle ActionKind (Phase 3.2+) doit recevoir un
// libelle et une icone ici pour apparaitre correctement dans le Centre des
// Actions - ce test casse volontairement si l'union type et ces registres
// divergent (meme esprit que registry.test.ts).
const ALL_KINDS: ActionKind[] = [
  'publish_listing',
  'edit_listing',
  'edit_price',
  'edit_photos',
  'republish_listing',
  'pause_listing',
  'reactivate_listing',
  'delete_listing',
  'reply_message',
  'accept_offer',
  'counter_offer',
];

describe('ACTION_KIND_LABELS', () => {
  it('has a non-empty label for every ActionKind', () => {
    for (const kind of ALL_KINDS) {
      expect(ACTION_KIND_LABELS[kind]).toBeTruthy();
    }
  });
});

describe('ACTION_KIND_ICONS', () => {
  it('has an icon for every ActionKind', () => {
    for (const kind of ALL_KINDS) {
      expect(ACTION_KIND_ICONS[kind]).toBeDefined();
    }
  });
});

describe('ACTION_STEP_LOG_MESSAGES', () => {
  it('has a non-empty message for every ActionStep', () => {
    for (const step of ACTION_STEP_ORDER) {
      expect(ACTION_STEP_LOG_MESSAGES[step]).toBeTruthy();
    }
  });
});
