import { describe, expect, it } from 'vitest';
import { translateAuthError, translateExtensionError, translateGeneratorError } from '../errorMessages';

describe('translateExtensionError', () => {
  it('recognizes a Chrome "receiving end does not exist" error', () => {
    const result = translateExtensionError('Could not establish connection. Receiving end does not exist.');
    expect(result).toBe("L'extension ResellOS ne répond pas. Vérifie qu'elle est bien installée et activée dans Chrome, puis réessaie.");
  });

  it('keeps the raw cause for an unrecognized error', () => {
    const result = translateExtensionError('Some unexpected Chrome error');
    expect(result).toContain('Some unexpected Chrome error');
    expect(result).toContain('extension ResellOS');
  });
});

describe('translateAuthError', () => {
  it('recognizes "User already registered"', () => {
    expect(translateAuthError('User already registered')).toContain('déjà associée à un compte');
  });

  it('recognizes a rate limit error', () => {
    expect(translateAuthError('email rate limit exceeded')).toContain('Trop de tentatives');
  });

  it('recognizes invalid login credentials', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('Email ou mot de passe incorrect.');
  });

  it('keeps the raw cause for an unrecognized error', () => {
    const result = translateAuthError('Some unexpected Supabase auth error');
    expect(result).toContain('Some unexpected Supabase auth error');
  });
});

describe('translateGeneratorError', () => {
  it('recognizes a Gemini 5xx error', () => {
    const result = translateGeneratorError('Gemini API error (503): service unavailable');
    expect(result).toContain('temporairement indisponible');
  });

  it('recognizes a Gemini rate limit (429) error', () => {
    const result = translateGeneratorError('Gemini API error (429): quota exceeded');
    expect(result).toContain('Trop de demandes');
  });

  it('recognizes an empty Gemini response', () => {
    const result = translateGeneratorError('Empty response from Gemini');
    expect(result).toContain("n'a renvoyé aucun résultat");
  });

  it('recognizes a network failure', () => {
    expect(translateGeneratorError('Failed to fetch')).toContain('connexion');
  });

  it('keeps the raw cause for an unrecognized error', () => {
    const result = translateGeneratorError('Some unexpected analysis error');
    expect(result).toContain('Some unexpected analysis error');
  });

  it('passes through the credit-limit message from analyze-clothing unchanged', () => {
    const raw = 'Tu as atteint ta limite de credits. Passe au plan Pro pour continuer.';
    expect(translateGeneratorError(raw)).toBe(raw);
  });

  it('passes through "Profil introuvable" unchanged', () => {
    expect(translateGeneratorError('Profil introuvable')).toBe('Profil introuvable');
  });

  it('passes through the missing GEMINI_API_KEY message unchanged', () => {
    const raw = 'GEMINI_API_KEY manquante. Impossible de générer une annonce réelle.';
    expect(translateGeneratorError(raw)).toBe(raw);
  });
});
