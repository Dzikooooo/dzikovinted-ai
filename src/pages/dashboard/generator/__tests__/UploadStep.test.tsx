// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadStep } from '../UploadStep';

// Refonte 2026-08-26 du Generateur. Ces tests portent sur ce qui a change et
// sur ce qui pourrait regresser sans se voir : disparition du contenu
// statique, collage au presse-papier, compteur, et libelle du bouton (qui
// annonce un cout reel).

const noop = () => {};

function renderStep(over: Partial<React.ComponentProps<typeof UploadStep>> = {}) {
  const props: React.ComponentProps<typeof UploadStep> = {
    images: [],
    onImagesChange: vi.fn(),
    photoLimit: 10,
    error: null,
    isLimitReached: false,
    credits: 8,
    limit: 10,
    unlimitedCredits: false,
    backgroundStyle: 'original',
    onBackgroundStyleChange: vi.fn(),
    onGenerate: noop,
    ...over,
  };
  return { props, ...render(<UploadStep {...props} />) };
}

// URL.createObjectURL n'existe pas dans jsdom -- requis des qu'une image est
// acceptee par handleFiles.
beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:fake', configurable: true });
});

describe('UploadStep -- contenu statique retire', () => {
  it("n'affiche plus l'encart \"Exemple de résultat\" ni le Polo Ralph Lauren", () => {
    renderStep();

    expect(screen.queryByText(/Exemple de résultat/i)).toBeNull();
    expect(screen.queryByText(/Polo Ralph Lauren/i)).toBeNull();
  });

  it("n'affiche plus les 3 cartes explicatives 01/02/03", () => {
    renderStep();

    expect(screen.queryByText('01')).toBeNull();
    expect(screen.queryByText('02')).toBeNull();
    expect(screen.queryByText('03')).toBeNull();
    // Le fil d'Ariane vit dans GeneratorPage et ne doit PAS apparaitre ici :
    // il ne s'active que pendant une analyse en cours.
    expect(screen.queryByLabelText(/Progression de la génération/i)).toBeNull();
  });
});

describe('UploadStep -- dropzone', () => {
  it('annonce le raccourci de collage', () => {
    renderStep();

    expect(screen.getByText(/Glisse tes photos ici/i)).toBeTruthy();
    expect(screen.getByText(/pour coller/i)).toBeTruthy();
  });

  it('accepte une image collée au presse-papier (Ctrl+V)', async () => {
    const onImagesChange = vi.fn();
    renderStep({ onImagesChange });

    const file = new File(['x'], 'capture.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
    document.dispatchEvent(event);

    await waitFor(() => expect(onImagesChange).toHaveBeenCalledWith(['blob:fake']));
  });

  it("n'écoute PAS le collage quand la limite de crédits est atteinte", async () => {
    const onImagesChange = vi.fn();
    renderStep({ onImagesChange, isLimitReached: true });

    const file = new File(['x'], 'capture.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
    document.dispatchEvent(event);

    expect(onImagesChange).not.toHaveBeenCalled();
  });

  it('ignore un collage sans fichier (texte simple)', () => {
    const onImagesChange = vi.fn();
    renderStep({ onImagesChange });

    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [] } });
    document.dispatchEvent(event);

    expect(onImagesChange).not.toHaveBeenCalled();
  });

  it('retire son écouteur au démontage', () => {
    const onImagesChange = vi.fn();
    const { unmount } = renderStep({ onImagesChange });
    unmount();

    const file = new File(['x'], 'capture.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
    document.dispatchEvent(event);

    expect(onImagesChange).not.toHaveBeenCalled();
  });
});

describe('UploadStep -- grille et action', () => {
  it('affiche le compteur "n / max" dès qu\'une photo est présente', () => {
    renderStep({ images: ['blob:a', 'blob:b', 'blob:c', 'blob:d'] });

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText(/\/ 10 photos/)).toBeTruthy();
  });

  it('donne un bouton de suppression accessible sur chaque vignette', () => {
    renderStep({ images: ['blob:a', 'blob:b'] });

    expect(screen.getAllByLabelText('Supprimer cette image')).toHaveLength(2);
  });

  it('supprime la bonne vignette', async () => {
    const onImagesChange = vi.fn();
    const user = userEvent.setup();
    renderStep({ images: ['blob:a', 'blob:b', 'blob:c'], onImagesChange });

    await user.click(screen.getAllByLabelText('Supprimer cette image')[1]);

    expect(onImagesChange).toHaveBeenCalledWith(['blob:a', 'blob:c']);
  });

  it('annonce le coût sur le bouton principal', () => {
    renderStep({ images: ['blob:a'] });

    expect(screen.getByRole('button', { name: /Générer l'annonce \(1 crédit\)/i })).toBeTruthy();
  });

  it("n'annonce PAS de coût quand les crédits sont illimités", () => {
    renderStep({ images: ['blob:a'], unlimitedCredits: true, limit: null });

    expect(screen.getByRole('button', { name: /Lancer la génération IA/i })).toBeTruthy();
    expect(screen.queryByText(/1 crédit/i)).toBeNull();
  });

  it('désactive la génération quand la limite est atteinte', () => {
    renderStep({ images: ['blob:a'], isLimitReached: true });

    expect(screen.getByRole('button', { name: /Générer l'annonce/i })).toBeDisabled();
  });

  it("affiche l'erreur en rouge conforme au contraste", () => {
    renderStep({ error: 'Analyse impossible' });

    const msg = screen.getByText('Analyse impossible');
    expect(msg.className).toContain('text-red-700');
  });
});

describe('UploadStep -- fond de photo genere (2026-08-30)', () => {
  it("n'affiche aucun avertissement de latence sur 'original' (defaut)", () => {
    renderStep({ images: ['blob:a'] });

    expect(screen.queryByText(/réellement généré par IA/i)).toBeNull();
  });

  it('avertit du cout/latence des qu\'un vrai fond est choisi', () => {
    renderStep({ images: ['blob:a'], backgroundStyle: 'blanc_studio' });

    expect(screen.getByText(/réellement généré par IA/i)).toBeTruthy();
  });

  it('propage le changement de fond selectionne', async () => {
    const onBackgroundStyleChange = vi.fn();
    const user = userEvent.setup();
    renderStep({ images: ['blob:a'], onBackgroundStyleChange });

    await user.selectOptions(screen.getByLabelText('Fond des photos'), 'marbre_clair');

    expect(onBackgroundStyleChange).toHaveBeenCalledWith('marbre_clair');
  });
});
