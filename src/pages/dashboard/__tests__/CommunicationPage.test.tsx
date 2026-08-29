// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ZERO-FRICTION (2026-08-28) : plus d'etat "Aucun modèle pour l'instant"
// qui bloquait toute la page tant qu'un modele personnel n'existait pas --
// un modele par defaut ("Relance favoris") devient le modele EFFECTIF tant
// qu'aucun modele reel n'est cree, etiquete "Par défaut" partout ou il
// apparait (jamais confondu avec un choix reel de l'utilisateur).

let listingsRows: Array<Record<string, unknown>> = [];
// P0 #9 : configurable pour prouver qu'une erreur reseau/requete ne se
// confond plus avec "aucune annonce" (voir describe dedie plus bas).
let listingsQueryError: { message: string } | null = null;

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const result = Promise.resolve({ data: listingsQueryError ? null : listingsRows, error: listingsQueryError });
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'or', 'order']) chain[m] = () => chain;
      Object.assign(chain, { then: result.then.bind(result) });
      return chain;
    },
  },
}));
// Objet STABLE : `user` est dans les dependances de useListingOptions.
const AUTH = { user: { id: 'u1' } };
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

let templateRows: Array<{ id: string; name: string; body: string }> = [];
const createTemplate = vi.fn().mockResolvedValue(true);
vi.mock('../../../hooks/useMessageTemplates', () => ({
  useMessageTemplates: () => ({
    templates: templateRows,
    loading: false,
    error: null,
    createTemplate,
    updateTemplate: vi.fn().mockResolvedValue(true),
    deleteTemplate: vi.fn().mockResolvedValue(true),
  }),
}));

const CommunicationPage = (await import('../CommunicationPage')).default;

function makeListing(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'l1',
    title: 'Polo Ralph Lauren',
    brand: 'Ralph Lauren',
    category: 'Polo',
    size: 'M',
    price: 25,
    vinted_url: 'https://www.vinted.fr/items/1',
    favourites: 0,
    ...over,
  };
}

beforeEach(() => {
  listingsRows = [];
  listingsQueryError = null;
  templateRows = [];
  createTemplate.mockClear();
});

async function renderPage() {
  render(<CommunicationPage />);
  await waitFor(() => expect(screen.getByText('Tes modèles')).toBeTruthy());
}

describe('CommunicationPage -- modèle par défaut (aucun modèle personnel)', () => {
  it("n'affiche plus l'etat vide -- le modele par defaut est visible et etiquete comme tel", async () => {
    await renderPage();

    expect(screen.queryByText(/Aucun modèle pour l'instant/i)).toBeNull();
    // "Relance favoris" apparait aussi, sans rapport, comme titre de la
    // section "Relance favoris" plus bas -- collision de texte fortuite,
    // "Par défaut" (unique) suffit a prouver que le modele par defaut
    // s'affiche bien comme tel.
    expect(screen.getAllByText('Relance favoris').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Par défaut')).toBeTruthy();
  });

  it("n'affiche qu'UNE seule idée de modèle -- 'Relance favoris' est deja le defaut actif, ne pas la reproposer", async () => {
    await renderPage();

    expect(screen.getByText('Idées de modèles')).toBeTruthy();
    expect(screen.queryByText('+ Relance favoris')).toBeNull();
    expect(screen.getByText('+ Baisse de prix')).toBeTruthy();
  });

  it('le sélecteur "Préparer un message" propose le modèle par défaut', async () => {
    await renderPage();

    expect(screen.getByText('Relance favoris (par défaut)')).toBeTruthy();
  });

  it('"Personnaliser" ouvre le formulaire pré-rempli avec le contenu du modèle par défaut', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByLabelText('Personnaliser'));

    expect(screen.getByDisplayValue('Relance favoris')).toBeTruthy();
    expect(screen.getByText('Nouveau modèle de message')).toBeTruthy();
  });

  it('choisir une annonce sans rien sélectionner de plus prépare déjà un message via le modèle par défaut', async () => {
    listingsRows = [makeListing()];
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => expect(screen.getByText('Choisir une annonce...')).toBeTruthy());
    await user.selectOptions(screen.getByDisplayValue('Choisir une annonce...'), 'Polo Ralph Lauren');

    // getByDisplayValue cible precisement le textarea (sa valeur RESOLUE,
    // avec les vraies donnees de l'annonce) -- getByText matcherait aussi
    // le texte brut du modele affiche dans "Tes modèles", sans rapport ici.
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("Bonjour ! Polo Ralph Lauren a l'air de t'intéresser, il est toujours disponible à 25 €. N'hésite pas si tu as des questions 🙂")
      ).toBeTruthy()
    );
  });
});

describe('CommunicationPage -- au moins un modèle personnel existe', () => {
  beforeEach(() => {
    templateRows = [{ id: 't1', name: 'Mon modèle', body: 'Salut {titre} !' }];
  });

  it('le modèle par défaut disparaît -- plus jamais de fallback silencieux une fois un vrai modèle créé', async () => {
    await renderPage();

    expect(screen.queryByText('Par défaut')).toBeNull();
    // "Mon modèle" apparait deux fois sans rapport (la carte ET l'option du
    // select "Préparer un message") -- getAllByText, pas getByText.
    expect(screen.getAllByText('Mon modèle').length).toBeGreaterThanOrEqual(1);
  });

  it('les DEUX idées de modèles redeviennent proposées (plus de défaut actif à éviter de dupliquer)', async () => {
    await renderPage();

    expect(screen.getByText('+ Relance favoris')).toBeTruthy();
    expect(screen.getByText('+ Baisse de prix')).toBeTruthy();
  });
});

describe('CommunicationPage -- P0 #9 : une erreur de chargement des annonces ne se confond plus avec "aucune annonce"', () => {
  it("affiche un message d'erreur honnête au lieu d'ignorer silencieusement l'échec de la requête", async () => {
    listingsQueryError = { message: 'network down' };
    await renderPage();

    // Avant le correctif, `useListingOptions()` ne destructurait que `data`
    // -- un vrai echec reseau retombait sur `data ?? []` sans qu'aucun
    // signal n'apparaisse nulle part sur la page (FavouritesFollowUp.tsx
    // affiche toujours son EmptyState pour une liste vide, avec ou sans
    // erreur -- meme convention que le reste du dashboard, ex.
    // ListingsManagementSection.tsx : banniere d'erreur ET etat vide
    // peuvent coexister, l'important est que l'erreur soit VISIBLE quelque
    // part, ce qu'elle n'etait pas du tout avant ce correctif).
    expect(await screen.findByText(/impossible de charger tes annonces/i)).toBeInTheDocument();
  });
});
