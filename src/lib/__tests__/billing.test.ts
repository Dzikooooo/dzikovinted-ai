import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('../supabase', () => ({
  supabase: { functions: { invoke } },
}));

// Import dynamique apres le mock -- billing.ts importe supabase au chargement
// du module, le mock doit deja etre en place (convention vi.mock standard,
// hoiste automatiquement par Vitest avant les imports).
const { startCheckout, openBillingPortal } = await import('../billing');

function functionsHttpError(status: number, body: unknown) {
  return {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(body), { status }),
  };
}

describe('startCheckout', () => {
  it('appelle create-checkout-session avec le plan demande et renvoie l\'URL', async () => {
    invoke.mockResolvedValueOnce({ data: { url: 'https://checkout.stripe.com/fake' }, error: null });
    const result = await startCheckout('pro');
    expect(invoke).toHaveBeenCalledWith('create-checkout-session', { body: { plan: 'pro' } });
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/fake' });
  });

  it('remonte le message d\'erreur reel du corps JSON (ex. 409 abonnement deja actif)', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: functionsHttpError(409, { error: 'Un abonnement est déjà actif. Gère ton abonnement depuis l\'espace facturation.' }),
    });
    const result = await startCheckout('team');
    expect(result).toEqual({ ok: false, error: 'Un abonnement est déjà actif. Gère ton abonnement depuis l\'espace facturation.' });
  });

  it('traduit les erreurs 401 brutes en message de session expiree', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: functionsHttpError(401, { error: 'Unauthorized' }) });
    const result = await startCheckout('pro');
    expect(result).toEqual({ ok: false, error: 'Ta session a expiré, reconnecte-toi.' });
  });

  it('renvoie un message generique si le corps est illisible', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: new Response('not json', { status: 500 }) } });
    const result = await startCheckout('pro');
    expect(result).toEqual({ ok: false, error: 'Impossible de démarrer le paiement, réessaie plus tard.' });
  });

  it('renvoie un message generique si aucune URL n\'est retournee', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    const result = await startCheckout('pro');
    expect(result).toEqual({ ok: false, error: 'Impossible de démarrer le paiement, réessaie plus tard.' });
  });
});

describe('openBillingPortal', () => {
  it('appelle create-portal-session sans body metier et renvoie l\'URL', async () => {
    invoke.mockResolvedValueOnce({ data: { url: 'https://billing.stripe.com/fake' }, error: null });
    const result = await openBillingPortal();
    expect(invoke).toHaveBeenCalledWith('create-portal-session', { body: {} });
    expect(result).toEqual({ ok: true, url: 'https://billing.stripe.com/fake' });
  });

  it('remonte le message "aucun abonnement" tel quel', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: functionsHttpError(404, { error: "Aucun abonnement Stripe n'est associé à ce compte." }),
    });
    const result = await openBillingPortal();
    expect(result).toEqual({ ok: false, error: "Aucun abonnement Stripe n'est associé à ce compte." });
  });

  it('traduit une erreur banned/403 -- pas de traduction, message deja FR', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: functionsHttpError(403, { error: 'Compte suspendu' }) });
    const result = await openBillingPortal();
    expect(result).toEqual({ ok: false, error: 'Compte suspendu' });
  });
});
