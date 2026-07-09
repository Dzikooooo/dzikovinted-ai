// Injecte sur https://www.vinted.fr/member/* (voir manifest.config.ts).
// Lecture seule : detecte si la page affichee est le propre profil vendeur
// de l'utilisateur, et remonte son identite + la totalite de ses annonces
// (tous statuts) au background via l'API wardrobe de Vinted (voir
// wardrobeApi.ts). Aucune ecriture sur Vinted, aucune interaction avec la
// page - lecture automatique autorisee (voir EXTENSION.md §8).

import { OWN_PROFILE_MARKER_SELECTOR, USERNAME_SELECTOR, extractVintedUserIdFromUrl } from "./selectors";
import { fetchAllWardrobeItems } from "./wardrobeApi";
import type { InternalMessage } from "../lib/messages";

async function detectAndReport(): Promise<void> {
  const vintedUserId = extractVintedUserIdFromUrl(location.href);
  const usernameEl = document.querySelector(USERNAME_SELECTOR);
  const vintedUsername = usernameEl?.textContent?.trim();

  if (!vintedUserId || !vintedUsername) return;

  const accountMessage: InternalMessage = { type: "ACCOUNT_DETECTED", vintedUserId, vintedUsername };
  chrome.runtime.sendMessage(accountMessage);

  try {
    const listings = await fetchAllWardrobeItems(vintedUserId);
    // Envoye meme si vide : une liste vide est une information a part
    // entiere (miroir complet, voir sync.ts) - seule une erreur reseau doit
    // empecher l'envoi, pas un compte sans annonce.
    const listingsMessage: InternalMessage = { type: "LISTINGS_DETECTED", vintedUserId, vintedUsername, listings };
    chrome.runtime.sendMessage(listingsMessage);
  } catch {
    // Echec de recuperation : on n'envoie rien plutot qu'une liste vide qui
    // effacerait a tort les annonces deja connues en base.
  }
}

// Vinted est une SPA Next.js : le contenu peut s'hydrater/se rendre apres le
// chargement initial du document. On reessaie brievement plutot que
// d'abandonner si le marqueur "propre profil" n'est pas encore present.
function waitAndDetect(attemptsLeft = 10): void {
  const marker = document.querySelector(OWN_PROFILE_MARKER_SELECTOR);
  if (marker) {
    void detectAndReport();
    return;
  }
  if (attemptsLeft <= 0) return; // pas le profil de l'utilisateur (ou pas de vue vendeur) - ne rien envoyer
  setTimeout(() => waitAndDetect(attemptsLeft - 1), 300);
}

waitAndDetect();
