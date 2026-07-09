// Injecte sur https://www.vinted.fr/member/* (voir manifest.config.ts).
// Lecture seule : detecte si la page affichee est le propre profil vendeur
// de l'utilisateur, et remonte son identite + ses annonces visibles (onglet
// "Actifs" par defaut) au background. Aucune ecriture sur Vinted, aucune
// interaction avec la page - lecture automatique autorisee (voir
// EXTENSION.md §8).

import {
  OWN_PROFILE_MARKER_SELECTOR,
  USERNAME_SELECTOR,
  extractVintedUserIdFromUrl,
  extractListingCards,
} from "./selectors";
import type { InternalMessage } from "../lib/messages";

function detectAndReport(): void {
  const vintedUserId = extractVintedUserIdFromUrl(location.href);
  const usernameEl = document.querySelector(USERNAME_SELECTOR);
  const vintedUsername = usernameEl?.textContent?.trim();

  if (!vintedUserId || !vintedUsername) return;

  const accountMessage: InternalMessage = { type: "ACCOUNT_DETECTED", vintedUserId, vintedUsername };
  chrome.runtime.sendMessage(accountMessage);

  const listings = extractListingCards(document);
  if (listings.length > 0) {
    const listingsMessage: InternalMessage = { type: "LISTINGS_DETECTED", listings };
    chrome.runtime.sendMessage(listingsMessage);
  }
}

// Vinted est une SPA Next.js : le contenu peut s'hydrater/se rendre apres le
// chargement initial du document. On reessaie brievement plutot que
// d'abandonner si le marqueur "propre profil" n'est pas encore present.
function waitAndDetect(attemptsLeft = 10): void {
  const marker = document.querySelector(OWN_PROFILE_MARKER_SELECTOR);
  if (marker) {
    detectAndReport();
    return;
  }
  if (attemptsLeft <= 0) return; // pas le profil de l'utilisateur (ou pas de vue vendeur) - ne rien envoyer
  setTimeout(() => waitAndDetect(attemptsLeft - 1), 300);
}

waitAndDetect();
