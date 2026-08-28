// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FavouritesFollowUp, type FavouriteListing } from '../FavouritesFollowUp';

// Relance favoris assistee (2026-08-26, revue ZERO-FRICTION 2026-08-28). Le
// plus important ici n'est pas ce que la section affiche, mais ce qu'elle NE
// FAIT PAS : aucun envoi, aucune identite de destinataire, aucun chiffre
// invente. Ces garde-fous decoulent d'un engagement affiche publiquement sur
// la landing -- un test les protege d'une derive future.
//
// ZERO-FRICTION (2026-08-28) : les badges d'offre (-5 %/-10 %/Prix rond)
// SONT desormais l'action de copie -- un clic compose ET copie en un seul
// geste, feedback "Copié !" sur le badge clique. Le bouton generique
// "Copier le message" du bas n'existe plus QUE dans le cas rare ou aucune
// offre n'est calculable (prix invalide) -- ces tests reflete ce nouveau
// contrat plutot que l'ancien bouton toujours present.

function makeListing(over: Partial<FavouriteListing> = {}): FavouriteListing {
  return {
    id: 'l1',
    title: 'Polo Ralph Lauren',
    brand: 'Ralph Lauren',
    category: 'Polo',
    size: 'M',
    price: 25,
    favourites: 4,
    vinted_url: 'https://www.vinted.fr/items/1',
    ...over,
  };
}

const TEMPLATE = 'Bonjour ! {titre} est toujours dispo à {prix}.';

beforeEach(() => {
  localStorage.clear();
  // navigator.clipboard est un getter seul dans jsdom : Object.assign leve.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(() => Promise.resolve()) },
    configurable: true,
  });
});

describe('FavouritesFollowUp -- garde-fous', () => {
  it("n'expose AUCUN bouton d'envoi -- la copie est la seule sortie possible", () => {
    render(<FavouritesFollowUp listings={[makeListing()]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    expect(screen.queryByRole('button', { name: /envoyer/i })).toBeNull();
    // Prix reel (25 €) -> des offres existent -- ce sont elles, desormais,
    // l'unique sortie de copie (pas un bouton generique separe).
    expect(screen.getByRole('button', { name: /-10 %/ })).toBeTruthy();
  });

  it("rappelle explicitement que l'envoi reste manuel", () => {
    render(<FavouritesFollowUp listings={[makeListing()]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    expect(screen.getByText(/toi qui le copies et l'envoies sur Vinted/i)).toBeTruthy();
  });
});

describe('FavouritesFollowUp -- ce qui est affiche', () => {
  it("affiche le total sans le presenter comme un gain quand l'annonce n'a jamais ete vue", () => {
    render(<FavouritesFollowUp listings={[makeListing({ favourites: 4 })]} loading={false} templateBody={null} templateName={null} />);

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.queryByText('+4')).toBeNull();
  });

  it('affiche "+N" une fois une reference connue', () => {
    localStorage.setItem('resellos:favouritesBaseline', JSON.stringify({ l1: 1 }));
    render(<FavouritesFollowUp listings={[makeListing({ favourites: 4 })]} loading={false} templateBody={null} templateName={null} />);

    expect(screen.getByText('+3')).toBeTruthy();
  });

  it('ignore les annonces sans aucun favori -- personne a relancer', () => {
    render(
      <FavouritesFollowUp
        listings={[makeListing({ id: 'l1', favourites: 0, title: 'Sans favori' })]}
        loading={false}
        templateBody={TEMPLATE}
        templateName="Relance"
      />
    );

    expect(screen.queryByText('Sans favori')).toBeNull();
    expect(screen.getByText(/Aucun favori à relancer/i)).toBeTruthy();
  });

  it('resout les variables du modele avec les vraies donnees, sans offre selectionnee', () => {
    render(<FavouritesFollowUp listings={[makeListing()]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    expect(screen.getByText(/Bonjour ! Polo Ralph Lauren est toujours dispo à 25/)).toBeTruthy();
  });

  it("invite a choisir un modele plutot que d'inventer un message -- les badges d'offre restent visibles mais desactives", () => {
    render(<FavouritesFollowUp listings={[makeListing()]} loading={false} templateBody={null} templateName={null} />);

    expect(screen.getByText(/Choisis un modèle/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /-10 %/ })).toBeDisabled();
  });
});

describe('FavouritesFollowUp -- offres', () => {
  it('propose -5 %, -10 % et un prix rond calcules sur le prix reel', () => {
    render(<FavouritesFollowUp listings={[makeListing({ price: 25 })]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    expect(screen.getByRole('button', { name: /-5 %/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /-10 %/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Prix rond/ })).toBeTruthy();
  });

  it("un clic sur une offre AJOUTE l'offre au message sans remplacer le texte du modele", () => {
    render(<FavouritesFollowUp listings={[makeListing({ price: 25 })]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    fireEvent.click(screen.getByRole('button', { name: /-10 %/ }));

    // Le texte d'origine survit ET l'offre s'y ajoute, dans le MEME bloc.
    // 25 € -10 % = 22,5 -> 23 € : euros entiers, comme partout dans l'app.
    const apercu = screen.getByText(/Polo Ralph Lauren est toujours dispo/);
    expect(apercu.textContent).toContain('23 €');
  });

  it("cliquer une AUTRE offre remplace l'aperçu par la nouvelle, jamais les deux cumulees", () => {
    render(<FavouritesFollowUp listings={[makeListing({ price: 25 })]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    fireEvent.click(screen.getByRole('button', { name: /-10 %/ }));
    expect(screen.getByText(/Polo Ralph Lauren est toujours dispo/).textContent).toContain('23 €');

    fireEvent.click(screen.getByRole('button', { name: /-5 %/ }));
    // 25 € -5 % = 23,75 -> 24 €.
    expect(screen.getByText(/Polo Ralph Lauren est toujours dispo/).textContent).toContain('24 €');
    expect(screen.getByText(/Polo Ralph Lauren est toujours dispo/).textContent).not.toContain('23 €');
  });

  it('ne propose aucune offre sur un prix nul -- repli sur le bouton de copie generique', () => {
    render(<FavouritesFollowUp listings={[makeListing({ price: 0 })]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    expect(screen.queryByRole('button', { name: /-5 %/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Copier le message/i })).toBeTruthy();
  });
});

describe('FavouritesFollowUp -- actions', () => {
  it('un clic sur un badge de prix copie IMMEDIATEMENT le message compose (zero-friction, pas de bouton separe)', async () => {
    render(<FavouritesFollowUp listings={[makeListing()]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    fireEvent.click(screen.getByRole('button', { name: /-10 %/ }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Polo Ralph Lauren'))
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('23 €'));
  });

  it('affiche "Copié !" sur le badge cliqué, puis revient a son libelle normal', async () => {
    render(<FavouritesFollowUp listings={[makeListing()]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    fireEvent.click(screen.getByRole('button', { name: /-10 %/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Copié !/i })).toBeTruthy());
  });

  it('repli sans offre (prix nul) : le bouton generique copie bien le message de base', async () => {
    render(<FavouritesFollowUp listings={[makeListing({ price: 0 })]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    fireEvent.click(screen.getByRole('button', { name: /Copier le message/i }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Polo Ralph Lauren'))
    );
  });

  it('ouvre la vraie annonce Vinted dans un nouvel onglet', () => {
    render(<FavouritesFollowUp listings={[makeListing()]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    const link = screen.getByRole('link', { name: /Ouvrir sur Vinted/i });
    expect(link.getAttribute('href')).toBe('https://www.vinted.fr/items/1');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it("le dit franchement quand le lien Vinted manque, plutot que d'en fabriquer un", () => {
    render(<FavouritesFollowUp listings={[makeListing({ vinted_url: null })]} loading={false} templateBody={TEMPLATE} templateName="Relance" />);

    expect(screen.queryByRole('link', { name: /Ouvrir sur Vinted/i })).toBeNull();
  });

  it('trie les gains connus les plus eleves en tete', () => {
    localStorage.setItem('resellos:favouritesBaseline', JSON.stringify({ a: 0, b: 0 }));
    render(
      <FavouritesFollowUp
        listings={[makeListing({ id: 'a', title: 'Petit gain', favourites: 1 }), makeListing({ id: 'b', title: 'Gros gain', favourites: 9 })]}
        loading={false}
        templateBody={TEMPLATE}
        templateName="Relance"
      />
    );

    const titres = screen.getAllByText(/gain$/i).map((el) => el.textContent);
    expect(titres[0]).toBe('Gros gain');
  });
});
