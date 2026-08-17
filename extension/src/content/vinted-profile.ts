// Injecte sur https://www.vinted.fr/member/* (voir manifest.config.ts).
// Lecture seule : detecte si la page affichee est le propre profil vendeur
// de l'utilisateur, et remonte son identite + la totalite de ses annonces
// (tous statuts) au background via l'API wardrobe de Vinted (voir
// wardrobeApi.ts). Aucune ecriture sur Vinted, aucune interaction avec la
// page - lecture automatique autorisee (voir EXTENSION.md §8).

import { OWN_PROFILE_MARKER_SELECTOR, USERNAME_SELECTOR, extractVintedUserIdFromUrl } from "./selectors";
import { fetchAllWardrobeItems } from "./wardrobeApi";
import type { InternalMessage } from "../lib/messages";
import { logger } from "../background/logger";
import { errorMessage } from "../lib/errorMessage";

async function detectAndReport(): Promise<void> {
  const vintedUserId = extractVintedUserIdFromUrl(location.href);
  const usernameEl = document.querySelector(USERNAME_SELECTOR);
  const vintedUsername = usernameEl?.textContent?.trim();

  if (!vintedUserId || !vintedUsername) return;

  const accountMessage: InternalMessage = { type: "ACCOUNT_DETECTED", vintedUserId, vintedUsername };
  chrome.runtime.sendMessage(accountMessage);

  try {
    const wardrobeResult = await fetchAllWardrobeItems(vintedUserId);
    // Envoye meme si vide/partiel : une liste vide est une information a
    // part entiere (miroir complet, voir sync.ts) - seule une erreur reseau
    // SUR LA PREMIERE PAGE empeche completement l'envoi (voir catch
    // ci-dessous). `complete` (mission "FIABILISATION SYNCHRO VINTED, lot 1")
    // est desormais transmis explicitement : sync.ts::recordListings() ne
    // doit jamais traiter une absence comme une suppression tant que
    // complete !== true.
    const listingsMessage: InternalMessage = {
      type: "LISTINGS_DETECTED",
      vintedUserId,
      vintedUsername,
      listings: wardrobeResult.items,
      complete: wardrobeResult.complete,
      pagesRead: wardrobeResult.pagesRead,
      pagesExpected: wardrobeResult.pagesExpected,
    };
    chrome.runtime.sendMessage(listingsMessage);
    if (!wardrobeResult.complete) {
      logger.warn("Pagination wardrobe Vinted incomplete -- scan partiel envoye, aucune suppression ne sera appliquee", {
        vintedUserId,
        pagesRead: wardrobeResult.pagesRead,
        pagesExpected: wardrobeResult.pagesExpected,
        itemsCollected: wardrobeResult.items.length,
      });
    }
  } catch (err) {
    // Echec de recuperation : on n'envoie rien plutot qu'une liste vide qui
    // effacerait a tort les annonces deja connues en base. Bug reel trouve
    // le 2026-07-27 (annonce reelle disparue de ResellOS sans aucune trace) :
    // cet echec restait totalement silencieux (aucun log, meme pas une
    // console.log) alors qu'ACCOUNT_DETECTED avait deja ete envoye juste
    // au-dessus -- vinted_accounts.last_synced_at se rafraichissait donc
    // normalement, donnant une fausse impression de synchro reussie pendant
    // que les annonces elles-memes n'etaient jamais mises a jour. Journalise
    // desormais dans le meme ring buffer persiste (resellos_log) que le
    // reste de l'extension, visible depuis le popup.
    logger.error("Echec recuperation wardrobe Vinted -- LISTINGS_DETECTED non envoye", {
      vintedUserId,
      error: errorMessage(err),
    });
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
