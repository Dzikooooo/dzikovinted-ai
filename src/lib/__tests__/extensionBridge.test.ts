import { describe, expect, it } from 'vitest';
import { translateResponseError } from '../extensionBridge';

// P1-3 (Freeze Audit correctif) : translateResponseError() est le point
// commun qui doit traduire tout {ok:false, error:"..."} technique venant du
// background AVANT qu'il n'atteigne l'utilisateur (deja applique a
// pairExtension/unpairExtension, desormais aussi a runAction()). Ces tests
// couvrent exactement la classe de bug confirmee : un texte technique brut
// qui passait inchange jusqu'ici sur le chemin RUN_ACTION.

describe('translateResponseError', () => {
  it('returns the fallback error when the response is undefined', () => {
    const result = translateResponseError(undefined, 'Réponse vide de l\'extension');
    expect(result).toEqual({ ok: false, error: "Réponse vide de l'extension" });
  });

  it('leaves a successful response untouched', () => {
    const response = { ok: true as const, outcome: { status: 'success' as const } };
    expect(translateResponseError(response, 'fallback')).toBe(response);
  });

  it('leaves a failed response without an error message untouched', () => {
    const response = { ok: false as const };
    expect(translateResponseError(response, 'fallback')).toBe(response);
  });

  it('translates a known raw technical error into a clean French message', () => {
    const response = { ok: false as const, error: 'Message externe inconnu' };
    const result = translateResponseError(response, 'fallback');
    expect(result.error).toContain("ne reconnaît pas encore cette action");
    expect(result.error).not.toBe('Message externe inconnu');
  });

  it('translates an unrecognized raw error while keeping the technical cause visible', () => {
    const response = { ok: false as const, error: 'TypeError: cannot read property of undefined' };
    const result = translateResponseError(response, 'fallback');
    expect(result.error).toContain('extension ResellOS');
    expect(result.error).toContain('TypeError: cannot read property of undefined');
  });

  it('preserves extra fields (outcome, timedOut) untouched while translating error', () => {
    const response = { ok: false as const, error: 'Message externe inconnu', timedOut: false };
    const result = translateResponseError(response, 'fallback');
    expect(result.timedOut).toBe(false);
    expect(result.ok).toBe(false);
  });
});
