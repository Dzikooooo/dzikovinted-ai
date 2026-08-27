import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('../supabase', () => ({
  supabase: { functions: { invoke } },
}));

const { notifyTicketDiscord } = await import('../notifyTicketDiscord');

// Contrat central (voir l'en-tete du module) : cette fonction ne doit JAMAIS
// rejeter, quelle que soit la facon dont l'appel echoue -- le ticket est deja
// ecrit en base avant qu'elle ne soit appelee, une notification ratee ne doit
// jamais remonter comme un echec de creation de ticket.
describe('notifyTicketDiscord', () => {
  it("appelle notify-ticket-discord avec le ticket_id fourni", async () => {
    invoke.mockResolvedValueOnce({ data: { notified: true }, error: null });
    await notifyTicketDiscord('ticket-1');
    expect(invoke).toHaveBeenCalledWith('notify-ticket-discord', { body: { ticket_id: 'ticket-1' } });
  });

  it("ne rejette jamais quand l'Edge Function renvoie une erreur", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(notifyTicketDiscord('ticket-2')).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("ne rejette jamais quand l'appel reseau lui-meme echoue (throw)", async () => {
    invoke.mockRejectedValueOnce(new Error('network down'));
    await expect(notifyTicketDiscord('ticket-3')).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
