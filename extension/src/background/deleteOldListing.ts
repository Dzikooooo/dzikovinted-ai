// Mission "REPUBLICATION : DIAGNOSTIC LIVE SUPPRESSION ANCIENNE ANNONCE
// VINTED" (2026-08-17) : implementation REELLE du mecanisme de suppression
// d'une annonce Vinted, remplace le stub "pas encore implémenté" de
// republishTransaction.ts (voir son ancien commentaire, avant cette
// mission). Flow confirme en direct par l'utilisateur sur une annonce
// propriétaire : page /items/{id} -> bouton "Supprimer" -> modale
// "Supprimer l'article" -> bouton "Confirmer et supprimer" (voir
// extension/src/content/deleteFlowSelectors.ts pour les selecteurs texte,
// aucun data-testid n'ayant ete releve en direct).
//
// DECISION D'ARCHITECTURE REVISEE (mission "AUTOMATISER LA SUPPRESSION --
// DERNIER CLIC", 2026-08-19) : la version precedente laissait le clic sur
// "Confirmer et supprimer" a l'utilisateur, par analogie avec la route de
// sauvegarde d'edition (vinted-edit.ts::submitEdit, prouvee protegee
// anti-bot) -- mais cette analogie n'avait JAMAIS ete testee sur CE bouton
// precis. Le meme round a confirme en direct que le bouton "Ajouter" de
// creation (/items/new, meme famille de bouton "soumettre") accepte deja un
// clic synthetique sans isTrusted:true. Le clic sur "Confirmer et
// supprimer" est donc desormais lui aussi automatise (vinted-item.ts::
// handleDeleteListing, une seule tentative, jamais de retry) -- CE MODULE
// (deleteOldListing.ts) reste totalement INCHANGE : il continue de traiter
// DELETE_RESULT{ok:true} exactement comme avant (une preuve que le clic a
// ete tente, jamais que la suppression a reussi) et de faire reposer
// deletedOld:true/false EXCLUSIVEMENT sur verifyReallyDeleted() ci-dessous
// (onglet independant, reload + lecture ld+json).
//
// ONGLET ACTIF (mission "ONGLET ACTIF POUR LA MODALE REACT", 2026-08-26) :
// le mode background du 2026-08-19 est ANNULE -- preuve live, la modale de
// confirmation React de Vinted ne se monte JAMAIS dans un onglet non rendu
// (throttling Chromium), alors meme que le declencheur etait bien trouve et
// clique. L'onglet de SUPPRESSION s'ouvre donc en active:true (voir
// performDeleteOldVintedListing) ; celui de VERIFICATION reste en
// active:false, il ne fait que lire du ld+json. Ce flow n'est atteint QUE
// pour republish_listing (oldVintedItemId, republishTransaction.ts, n'existe
// jamais pour une premiere publication). Le filet de secours (onglet garde
// ouvert et ramene au premier plan si outcomeAllowsTabClose n'a jamais ete
// mis a true, voir settle()) est conserve, avec une seule exception : le
// timeout de securite ferme l'onglet dans tous les cas.
//
// PREUVE INDEPENDANTE (ne jamais se fier au seul "un clic a ete detecte") :
// une fois DELETE_RESULT{ok:true} recu du content script, ce module ouvre
// une SECONDE fois (onglet cache, active:false) la page publique de
// l'ancienne annonce et verifie que le bloc <script type="application/
// ld+json"> (deja valide en direct pour cette page, voir itemSelectors.ts)
// ne rapporte plus de prix -- seule cette relecture independante declenche
// REPUBLISH_OLD_DELETE_CONFIRMED (voir republishTransaction.ts). Meme
// discipline que readLdJsonForVerification (editListing.ts) : jamais un
// faux succes uniquement parce qu'un clic a semble fonctionner.

import { logger } from "./logger";
import { withRetry } from "./retry";
import { errorDetails, errorMessage } from "../lib/errorMessage";
import type { ContentCommand, DeleteCommandResponse, DeleteListingOutcome, DeleteStep } from "../lib/messages";
import { isContentReport } from "../lib/messages";

const TAB_LOAD_TIMEOUT_MS = 20000;
const VERIFY_TAB_LOAD_TIMEOUT_MS = 20000;
// Couvre : ouverture d'onglet + chargement + jusqu'a 90s d'attente du clic
// humain (voir vinted-item.ts::handleDeleteListing) + marge -- reste tres
// en dessous de GLOBAL_TIMEOUT_MS (publishListing.ts, 600000ms) qui englobe
// cette etape.
const DELETE_GLOBAL_TIMEOUT_MS = 180000;
const TAB_PURPOSE = "delete" as const;

export interface DeleteOldListingResult {
  ok: boolean;
  error?: string;
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    function cleanup(): void {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
    }
    function onUpdated(updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void {
      if (updatedTabId !== tabId || changeInfo.status !== "complete" || settled) return;
      settled = true;
      cleanup();
      resolve();
    }
    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId || settled) return;
      settled = true;
      cleanup();
      reject(new Error("Onglet fermé avant chargement complet"));
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Chargement de l'onglet non confirmé sous ${timeoutMs}ms`));
    }, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

// Mission "CORRIGER LA REPETITION DELETE_LISTING" (2026-08-17) -- CAUSE
// RACINE PROUVEE en test live : le listener DELETE_LISTING (vinted-item.ts)
// ne repondait JAMAIS (ni sendResponse, ni return true) -- exactement le
// meme bug deja corrige pour PUBLISH_LISTING (voir DeleteCommandResponse,
// messages.ts, mission "ACK PUBLISH_LISTING MANQUANT"). Chrome pouvait alors
// fermer le port AVANT reponse ("message port closed before a response was
// received."), MEME quand le content script avait deja reellement recu la
// commande et demarre handleDeleteListing() -- withRetry() traitait ce faux
// negatif comme un echec d'envoi et renvoyait DELETE_LISTING, demarrant
// plusieurs handleDeleteListing() concurrents dans le MEME document
// (documentInstanceId identique confirme sur toute la sequence repetee en
// test live). Desormais : (1) un ACK EXPLICITE et VALIDE (DeleteCommandResponse,
// meme discipline stricte que sendPublishCommand) est requis pour que CETTE
// tentative soit consideree reussie -- une reponse absente/invalide reste
// une erreur de transport, retentee normalement ; (2) `isAlreadyConfirmed`
// (verifie AVANT tout envoi, a CHAQUE tentative de withRetry) permet
// d'arreter tout renvoi des qu'une preuve INDEPENDANTE de reception existe
// deja (l'ACK de CETTE fonction via `onAcked`, OU un DELETE_PROGRESS/
// DELETE_RESULT authentique recu entre-temps via l'autre canal, voir
// performDeleteOldVintedListing/contentScriptConfirmedAlive ci-dessous) --
// couvre le cas ou une tentative ulterieure rejetterait malgre tout
// (tardivement) apres qu'une preuve de reception soit deja arrivee par un
// autre chemin.
async function sendDeleteCommand(
  tabId: number,
  vintedItemId: string,
  isAlreadyConfirmed: () => boolean,
  onAcked: (documentInstanceId: string) => void
): Promise<void> {
  await withRetry(
    () =>
      new Promise<void>((resolve, reject) => {
        if (isAlreadyConfirmed()) {
          logger.info("REPUBLISH_OLD_DELETE_SEND_SKIPPED_ALREADY_CONFIRMED", { tabId, vintedItemId });
          resolve();
          return;
        }
        const command: ContentCommand = { type: "DELETE_LISTING", payload: { vintedItemId } };
        // INSTRUMENTATION TEMPORAIRE PHASE DELETE (2026-08-25).
        logger.warn("REPUBLISH_DELETE_COMMAND_SENT", { tabId, oldItemId: vintedItemId });
        chrome.tabs.sendMessage(tabId, command, (response: DeleteCommandResponse | undefined) => {
          if (chrome.runtime.lastError) {
            // "Could not establish connection" / "Receiving end does not
            // exist" = aucun content script vivant dans cet onglet. C'est le
            // symptome attendu d'un content script ORPHELIN (extension
            // rechargee alors qu'un onglet Vinted etait deja ouvert) --
            // exactement la famille de "chrome-extension://invalid/".
            logger.warn("REPUBLISH_DELETE_RESPONSE", {
              tabId,
              oldItemId: vintedItemId,
              acked: false,
              reason: chrome.runtime.lastError.message ?? "(lastError sans message)",
            });
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || response.ok !== true || response.accepted !== true) {
            logger.warn("REPUBLISH_DELETE_RESPONSE", {
              tabId,
              oldItemId: vintedItemId,
              acked: false,
              reason: "ACK absent ou invalide",
              responseOk: response?.ok ?? null,
              responseAccepted: response?.accepted ?? null,
            });
            reject(new Error("Réponse ACK absente ou invalide du content script"));
            return;
          }
          logger.warn("REPUBLISH_DELETE_RESPONSE", {
            tabId,
            oldItemId: vintedItemId,
            acked: true,
            documentInstanceId: response.documentInstanceId,
          });
          onAcked(response.documentInstanceId);
          resolve();
        });
      }),
    { attempts: 6, baseDelayMs: 250 }
  );
}

// Fonction autonome injectee via chrome.scripting.executeScript({func}) --
// aucune fermeture possible sur des variables/imports externes (meme
// contrainte que readLdJsonForVerification, editListing.ts) : duplique
// volontairement la lecture minimale du ld+json plutot que d'importer
// itemSelectors.ts. Attend jusqu'a 10s (meme delai/mecanisme deja valide en
// direct pour cette page, voir editListing.ts) avant de conclure -- une
// vraie fiche article active affiche TOUJOURS ce bloc une fois rendue,
// jamais une lecture synchrone immediate qui risquerait un faux "supprime"
// par simple lenteur de rendu.
function readItemStillActiveAfterWait(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = (): boolean | null => {
      const script = document.querySelector('script[type="application/ld+json"]');
      if (!script?.textContent) return null;
      try {
        const data = JSON.parse(script.textContent) as { offers?: { price?: number } };
        return typeof data.offers?.price === "number";
      } catch {
        return null;
      }
    };
    const immediate = check();
    if (immediate !== null) {
      resolve(immediate);
      return;
    }
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, 10000);
    const observer = new MutationObserver(() => {
      const result = check();
      if (result !== null) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

const VERIFY_SCRIPT_RETRY_ATTEMPTS = 3;
const VERIFY_SCRIPT_RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mission "ROUND DELETE -- implementation du correctif de verification
// post-suppression" (2026-08-17), suite de l'audit precedent (meme session) :
// chrome.scripting.executeScript() peut rejeter avec "Frame with ID 0 was
// removed" quand le frame cible a ete detruit/remplace entre la resolution
// de waitForTabComplete() ("complete") et l'execution reelle de l'injection
// -- une course de timing generique (souvent une navigation cote Vinted),
// PAS une preuve en soi que l'annonce a ete supprimee. Quelques tentatives
// rapprochees suffisent a absorber cette course sans jamais transformer un
// echec transitoire en verdict premature dans un sens ou l'autre.
async function runVerificationScriptWithRetry(tabId: number, oldVintedItemId: string): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= VERIFY_SCRIPT_RETRY_ATTEMPTS; attempt++) {
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId }, func: readItemStillActiveAfterWait });
      // Par defaut (resultat absent) : suppose ENCORE active -- jamais un faux
      // succès faute de preuve exploitable.
      return results[0]?.result ?? true;
    } catch (err) {
      lastError = err;
      if (attempt < VERIFY_SCRIPT_RETRY_ATTEMPTS) {
        logger.info("REPUBLISH_OLD_DELETE_VERIFICATION_RETRY", { oldVintedItemId, tabId, attempt, error: errorMessage(err) });
        await delay(VERIFY_SCRIPT_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

async function verifyReallyDeleted(oldVintedItemId: string): Promise<DeleteOldListingResult> {
  const url = `https://www.vinted.fr/items/${oldVintedItemId}`;
  let tab: chrome.tabs.Tab;
  try {
    // Onglet de VERIFICATION uniquement : reload + lecture ld+json, aucune
    // modale ni interaction. Reste donc en active:false, contrairement a
    // l'onglet de suppression (voir performDeleteOldVintedListing).
    tab = await chrome.tabs.create({ url, active: false });
  } catch (err) {
    return { ok: false, error: `Vérification de la suppression impossible (ouverture d'onglet) : ${errorMessage(err)}` };
  }
  if (tab.id === undefined) {
    return { ok: false, error: "Vérification de la suppression impossible (onglet invalide)" };
  }
  const tabId = tab.id;
  try {
    await waitForTabComplete(tabId, VERIFY_TAB_LOAD_TIMEOUT_MS);

    let stillActive: boolean;
    try {
      stillActive = await runVerificationScriptWithRetry(tabId, oldVintedItemId);
    } catch (firstErr) {
      // Tous les retries de lecture ont echoue. Avant de conclure : verifier
      // si Vinted a lui-meme navigue ailleurs -- un INDICE seulement (jamais
      // une preuve a lui seul, voir mission), puis retenter une lecture
      // reelle apres une renavigation explicite vers l'URL cible.
      let currentUrl: string | undefined;
      try {
        const currentTab = await chrome.tabs.get(tabId);
        currentUrl = currentTab.url;
      } catch {
        currentUrl = undefined;
      }
      if (currentUrl !== undefined && !currentUrl.startsWith(url)) {
        logger.info("REPUBLISH_OLD_DELETE_VERIFICATION_NAVIGATION_DETECTED", { oldVintedItemId, tabId, currentUrl });
      }

      logger.info("REPUBLISH_OLD_DELETE_VERIFICATION_RELOAD", { oldVintedItemId, tabId, url });
      try {
        await chrome.tabs.update(tabId, { url });
        await waitForTabComplete(tabId, VERIFY_TAB_LOAD_TIMEOUT_MS);
        stillActive = await runVerificationScriptWithRetry(tabId, oldVintedItemId);
      } catch (secondErr) {
        logger.warn("REPUBLISH_OLD_DELETE_VERIFICATION_FINAL_FAILURE", {
          oldVintedItemId,
          tabId,
          firstError: errorMessage(firstErr),
          secondError: errorMessage(secondErr),
        });
        return { ok: false, error: `Vérification de la suppression impossible : ${errorMessage(secondErr)}` };
      }
    }

    logger.info("REPUBLISH_OLD_DELETE_VERIFICATION_RESULT", { oldVintedItemId, stillActive });
    if (stillActive) {
      return { ok: false, error: "L'ancienne annonce semble toujours active après le clic de confirmation (vérification indépendante)." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Vérification de la suppression impossible : ${errorMessage(err)}` };
  } finally {
    chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function performDeleteOldVintedListing(
  oldVintedItemId: string,
  onAwaitingConfirmation?: () => void
): Promise<DeleteOldListingResult> {
  const url = `https://www.vinted.fr/items/${oldVintedItemId}`;
  logger.info("REPUBLISH_OLD_DELETE_TAB_OPENING", { oldVintedItemId, url });

  let tab: chrome.tabs.Tab;
  try {
    // Mission "ONGLET ACTIF POUR LA MODALE REACT" (2026-08-26) : active:true.
    // Ceci REVIENT sur la decision "MODE BACKGROUND" du 2026-08-19, sur preuve
    // live : le declencheur [data-testid="item-delete-button"] etait bien
    // trouve ET clique (DELETE_TRIGGER_STATE, before_click + before_retry_click)
    // mais la modale de confirmation n'apparaissait JAMAIS dans le DOM
    // (DELETE_DOM_SNAPSHOT stage:"modal_not_found"). Un onglet d'arriere-plan
    // subit le throttling de Chromium : sans cycle de rendu actif, la modale
    // React de Vinted ne se monte pas. C'est aussi ce meme non-rendu qui
    // mettait toutes les geometries a 0x0 (voir isLayoutUnavailable,
    // deleteFlowSelectors.ts -- ce repli reste en place, il couvre encore le
    // court instant avant que l'onglet ne soit reellement rendu).
    //
    // CONSEQUENCE ASSUMEE : cet onglet prend le focus pendant la republication.
    // C'est le prix du rendu complet ; il est ferme des que l'issue est connue
    // (voir settle()). L'onglet de VERIFICATION independante
    // (verifyReallyDeleted) reste lui en active:false -- il ne fait que lire
    // du ld+json, aucune modale ni interaction n'y est requise.
    tab = await chrome.tabs.create({ url, active: true });
  } catch (err) {
    return { ok: false, error: `Impossible d'ouvrir l'ancienne annonce à supprimer : ${errorMessage(err)}` };
  }
  if (tab.id === undefined) {
    return { ok: false, error: "Onglet Vinted invalide pour la suppression" };
  }
  const tabId = tab.id;
  logger.info("REPUBLISH_OLD_DELETE_TAB_CREATED", { tabId, url, oldVintedItemId, purpose: TAB_PURPOSE });

  // INSTRUMENTATION TEMPORAIRE PHASE DELETE (2026-08-25) : etat REEL de
  // l'onglet une fois charge -- l'URL effective peut differer de l'URL
  // demandee (redirection Vinted, page 404/supprimee, mur de connexion). Sans
  // cela, un echec d'ACK plus bas ne permet pas de distinguer "content script
  // absent" de "on n'est pas sur la page attendue".
  void chrome.tabs.get(tabId).then((state) => {
    logger.warn("REPUBLISH_DELETE_TAB_STATE", {
      tabId,
      oldItemId: oldVintedItemId,
      expectedUrl: url,
      actualUrl: state.url ?? null,
      status: state.status ?? null,
      // true = on n'est PAS sur la page attendue -> le content script
      // d'annonce ne sera pas injecte, l'ACK echouera forcement.
      urlMismatch: !!state.url && !state.url.startsWith(url),
      discarded: state.discarded ?? null,
    });
  }).catch(() => {});

  return new Promise<DeleteOldListingResult>((resolve) => {
    let settled = false;
    // BUG REEL trouve par test (mission "CORRIGER LE FAUX TERMINE",
    // 2026-08-17) : `settled` seul ne protege QUE l'appel final a settle() --
    // un DELETE_RESULT{ok:true} recu deux fois (retry/rejeu du canal message)
    // AVANT que la premiere verifyReallyDeleted() n'ait resolu declenchait
    // une SECONDE verification independante (un 2e onglet cache en trop),
    // puisque rien ne gardait le lancement de cet effet de bord lui-meme.
    // Garde synchrone, posee AVANT le moindre await -- exactement le meme
    // principe que successFinalizationStarted (publishListing.ts).
    let verificationStarted = false;

    // BUG REEL confirme en test live (mission "AUTOMATISER ENTIEREMENT LA
    // SUPPRESSION DE A", 2026-08-17) : settle() fermait INCONDITIONNELLEMENT
    // cet onglet des le premier echec/timeout -- y compris le timeout de
    // chargement initial (TAB_LOAD_TIMEOUT_MS, waitForTabComplete) qui peut
    // se declencher meme APRES que le content script ait deja clique
    // "Supprimer" et affiche la modale de confirmation (le statut de
    // navigation Chrome "complete", que ce timeout attend, n'est pas
    // correle a la disponibilite reelle de la page pour le content script,
    // voir vinted-item.ts::init qui tourne des document_idle). Consequence
    // observee en direct : la modale "Confirmer et supprimer" disparaissait
    // sous les yeux de l'utilisateur AVANT qu'il ait pu cliquer, remplacee
    // par cleanup_required.
    //
    // Correctif : ne fermer cet onglet QUE lorsque le cycle est reellement
    // termine d'une maniere qui ne laisse plus rien a l'utilisateur --
    // annonce deja absente (rien a montrer) OU clic humain reel deja
    // confirme (verificationStarted, quel que soit le resultat de la
    // verification independante qui suit). Dans TOUS les autres cas
    // (echec/timeout avant tout clic reel, que la modale ait ete visible ou
    // non) l'onglet reste ouvert -- au pire un onglet en trop a fermer
    // manuellement, jamais une fermeture qui coupe l'utilisateur en plein
    // geste.
    let outcomeAllowsTabClose = false;

    // BUG REEL confirme en test live (mission "AUDITER LA RACE
    // CLEANUP_REQUIRED", 2026-08-17) : capture live complete -- DELETE_RESULT
    // {ok:true} recu (verificationStarted=true, verifyReallyDeleted() lancee),
    // PUIS sendDeleteCommand().catch() (chaine INDEPENDANTE de waitForTabComplete
    // plus bas) a quand meme appele settle({ok:false,"Chargement de la page..."})
    // avant que la verification independante n'ait fini -- verrouillant
    // cleanup_required alors que REPUBLISH_OLD_DELETE_VERIFICATION_RESULT
    // (stillActive:false, preuve REELLE) n'arrivait que PLUS TARD, deja sans
    // effet (settled etait deja vrai). Cause : l'ACK de chrome.tabs.sendMessage()
    // (dont sendDeleteCommand()/withRetry dependent) peut rapporter un echec
    // de PORT (ferme, remplace...) MEME QUAND le content script a reellement
    // recu et traite le message -- exactement la meme classe de faux negatif
    // deja documentee et corrigee ailleurs dans ce projet pour ce meme
    // mecanisme (voir "PORT MESSAGE FERMÉ", handlePublishListing.ts). Tout
    // message REELLEMENT recu de CE content script (DELETE_PROGRESS ou
    // DELETE_RESULT, peu importe lequel arrive en premier) est une preuve
    // DIRECTE, strictement plus fiable que ce canal d'ACK, que la commande a
    // bien ete livree -- un echec ulterieur de ce canal est alors perime et
    // ne doit plus jamais pouvoir imposer un cleanup_required errone.
    let contentScriptConfirmedAlive = false;

    // Mission "CORRIGER LA REPETITION DELETE_LISTING" (2026-08-17), CAUSE
    // RACINE #2 PROUVEE en test live : `contentScriptConfirmedAlive`
    // ci-dessus etait REUTILISEE comme garde anti-retry pour
    // sendDeleteCommand() -- mais elle est mise a `true` par TOUT rapport du
    // content script, y compris DELETE_LISTENER_BOOT (envoye au chargement
    // du module, AVANT que DELETE_LISTING n'ait jamais ete envoye la
    // premiere fois) et DELETE_DIAGNOSTIC_SNAPSHOT (purement diagnostique).
    // Consequence observee en direct : DELETE_LISTENER_BOOT arrivait avant
    // le premier essai de sendDeleteCommand(), qui voyait alors
    // isAlreadyConfirmed()===true des sa toute premiere tentative et
    // n'envoyait JAMAIS DELETE_LISTING (REPUBLISH_OLD_DELETE_SEND_SKIPPED_ALREADY_CONFIRMED
    // en tout premier log, aucun DELETE_LISTENER_REGISTERED... en realite si,
    // mais aucun REPUBLISH_OLD_DELETE_PROGRESS/COMMAND_ACKED jamais).
    // `deleteCommandAccepted` est un signal STRICTEMENT plus etroit :
    // "contentScriptConfirmedAlive" prouve que le content script EXISTE,
    // jamais qu'il a accepte CETTE commande DELETE_LISTING precise --
    // seul un ACK explicite (DeleteCommandResponse.accepted:true, voir
    // onAcked plus bas) ou un DELETE_PROGRESS/DELETE_RESULT REEL (qui ne
    // peut arriver qu'APRES que handleDeleteListing() ait reellement
    // demarre) le prouve. `contentScriptConfirmedAlive` reste inchangee
    // pour son usage d'origine (guard du .catch() de waitForTabComplete
    // plus bas) -- seul le PARAMETRE passe a sendDeleteCommand() change.
    let deleteCommandAccepted = false;

    // forceCloseTab : reserve au timeout de securite (mission "ONGLET ACTIF
    // POUR LA MODALE REACT", 2026-08-26). Depuis que cet onglet prend le focus,
    // en laisser un ouvert indefiniment apres un delai depasse serait intrusif
    // alors qu'il n'y a plus rien a y faire. Le resultat reste rapporte
    // honnetement en echec dans tous les cas.
    function settle(result: DeleteOldListingResult, forceCloseTab = false): void {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcomeAllowsTabClose || forceCloseTab) {
        chrome.tabs.remove(tabId).catch(() => {});
      } else {
        logger.warn("REPUBLISH_OLD_DELETE_TAB_KEPT_OPEN_NO_CLICK_CONFIRMED", { oldVintedItemId, tabId, error: result.error });
        // Mission "MODE BACKGROUND -- REPUBLICATION" (2026-08-19) : filet de
        // secours -- reutilise EXACTEMENT le signal existant
        // (outcomeAllowsTabClose:false = intervention humaine potentiellement
        // necessaire, aucun clic confirme), aucun nouveau signal introduit.
        // Cet onglet tourne desormais en arriere-plan (active:false a la
        // creation, voir plus bas) -- le ramener au premier plan ICI
        // seulement, jamais sur un succes normal (ce else n'est atteint que
        // si outcomeAllowsTabClose est reste false). Best-effort.
        chrome.tabs.update(tabId, { active: true }).catch((err) => {
          logger.error("REPUBLISH_OLD_DELETE_FALLBACK_ACTIVATE_TAB_FAILED", { oldVintedItemId, tabId, error: errorMessage(err) });
        });
      }
      resolve(result);
    }

    function cleanup(): void {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(globalTimeout);
    }

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;
      // Voir commentaire d'en-tete de contentScriptConfirmedAlive -- n'importe
      // quel rapport reel de CE content script prouve la livraison de la
      // commande, quoi que rapporte ensuite le canal d'ACK independant.
      contentScriptConfirmedAlive = true;
      if (message.type === "DELETE_PROGRESS") {
        // Preuve REELLE que handleDeleteListing() a demarre pour CETTE
        // commande -- ne peut arriver qu'apres acceptation authentique.
        deleteCommandAccepted = true;
        const step: DeleteStep = message.step;
        logger.info("REPUBLISH_OLD_DELETE_PROGRESS", { oldVintedItemId, step, documentInstanceId: message.documentInstanceId });
        // Point ou ResellOS doit afficher un etat explicite -- relaye AVANT
        // toute preuve de suppression, pour informer que la suppression de
        // l'ancienne annonce est en cours (desormais automatique, voir
        // commentaire d'en-tete ; l'onglet reste ouvert et visible au cas ou
        // une intervention manuelle serait malgre tout necessaire).
        if (step === "auto_confirm_click_attempted") onAwaitingConfirmation?.();
      } else if (message.type === "DELETE_RESULT") {
        // Meme preuve, memes raisons.
        deleteCommandAccepted = true;
        const outcome: DeleteListingOutcome = message.outcome;
        if (!outcome.ok) {
          logger.warn("REPUBLISH_OLD_DELETE_CLICK_FAILED", {
            oldVintedItemId,
            reason: outcome.reason,
            errorMessage: outcome.errorMessage,
            documentInstanceId: message.documentInstanceId,
          });
          settle({ ok: false, error: outcome.errorMessage });
          return false;
        }
        if (outcome.alreadyGone) {
          logger.info("REPUBLISH_OLD_DELETE_ALREADY_GONE", { oldVintedItemId });
          // Rien a montrer a l'utilisateur (l'annonce n'a jamais eu de
          // modale a confirmer) -- fermeture de l'onglet legitime ici.
          outcomeAllowsTabClose = true;
          settle({ ok: true });
          return false;
        }
        // Clic de confirmation detecte -- PAS encore une preuve (voir
        // commentaire d'en-tete) : verification independante avant
        // d'accepter le succès. Idempotence : un DELETE_RESULT dupliqué
        // (rejoué) ne doit jamais déclencher une seconde vérification.
        if (verificationStarted) {
          logger.info("REPUBLISH_OLD_DELETE_RESULT_DUPLICATE_IGNORED", { oldVintedItemId });
          return false;
        }
        verificationStarted = true;
        // Le clic humain reel EST arrive a ce stade -- l'onglet a rempli
        // son role, il peut etre ferme quel que soit le resultat de la
        // verification independante qui suit (ok:true ou ok:false).
        outcomeAllowsTabClose = true;
        logger.info("REPUBLISH_OLD_DELETE_CLICK_DETECTED_VERIFYING", { oldVintedItemId });
        void verifyReallyDeleted(oldVintedItemId).then(settle);
      }
      return false;
    }

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId || settled) return;
      if (verificationStarted) {
        // Une verification INDEPENDANTE (second onglet distinct, voir
        // verifyReallyDeleted) est deja en cours -- son resultat reste seul
        // autoritaire ; la fermeture de CET onglet (deja permise a ce stade,
        // voir outcomeAllowsTabClose) ne doit jamais imposer un echec qui
        // preempterait un resultat qui va de toute facon arriver.
        logger.info("REPUBLISH_OLD_DELETE_TAB_REMOVED_DURING_VERIFICATION_IGNORED", { oldVintedItemId, tabId });
        return;
      }
      settle({ ok: false, error: "Onglet fermé avant la fin de la suppression" });
    }

    const globalTimeout = setTimeout(() => {
      logger.warn("REPUBLISH_OLD_DELETE_TAB_CLOSED_ON_TIMEOUT", { oldVintedItemId, tabId, timeoutMs: DELETE_GLOBAL_TIMEOUT_MS });
      settle({ ok: false, error: "Délai dépassé pour la suppression de l'ancienne annonce" }, true);
    }, DELETE_GLOBAL_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);

    waitForTabComplete(tabId, TAB_LOAD_TIMEOUT_MS)
      .then(() =>
        sendDeleteCommand(
          tabId,
          oldVintedItemId,
          // isAlreadyConfirmed : deleteCommandAccepted (jamais
          // contentScriptConfirmedAlive, voir son commentaire d'en-tete) --
          // seul signal qui prouve que CETTE commande DELETE_LISTING a
          // reellement ete acceptee, jamais juste que le content script
          // existe (DELETE_LISTENER_BOOT ne suffit pas).
          () => deleteCommandAccepted,
          (documentInstanceId) => {
            // L'ACK explicite EST une preuve de reception, au meme titre
            // qu'un DELETE_PROGRESS/DELETE_RESULT authentique. La definir
            // ICI, avant meme le premier DELETE_PROGRESS, ferme la course
            // le plus tot possible et empeche tout renvoi ulterieur de
            // DELETE_LISTING par ce meme withRetry. contentScriptConfirmedAlive
            // reste egalement mise a jour ici -- un ACK est aussi une preuve
            // valide pour son propre usage (guard du .catch() ci-dessous).
            contentScriptConfirmedAlive = true;
            deleteCommandAccepted = true;
            logger.info("REPUBLISH_OLD_DELETE_COMMAND_ACKED", { oldVintedItemId, tabId, documentInstanceId });
          }
        )
      )
      .catch((err) => {
        if (contentScriptConfirmedAlive) {
          // Voir commentaire d'en-tete de contentScriptConfirmedAlive : cet
          // echec porte UNIQUEMENT sur le canal d'ACK de sendDeleteCommand()
          // (chrome.tabs.sendMessage) -- deja contredit par une preuve directe
          // que le content script a bel et bien recu/traite la commande.
          // Jamais laisser un signal de transport perime imposer un
          // cleanup_required alors que le vrai flow (DELETE_PROGRESS/
          // DELETE_RESULT, potentiellement deja verifyReallyDeleted() en
          // cours) suit son cours et reste seul autoritaire.
          logger.info("REPUBLISH_OLD_DELETE_TAB_LOAD_ERROR_IGNORED_CONTENT_SCRIPT_ALIVE", { oldVintedItemId, error: errorMessage(err) });
          return;
        }
        logger.warn("REPUBLISH_OLD_DELETE_TAB_LOAD_FAILED", errorDetails(err));
        settle({ ok: false, error: `Chargement de la page de l'ancienne annonce impossible : ${errorMessage(err)}` });
      });
  });
}

// Un seul cycle de suppression a la fois PAR ANCIEN ITEM ID (idempotence,
// demande explicite : "aucun double clic / double delete si événements ou
// navigation sont rejoués") -- un second appel concurrent pour le MEME id
// reutilise la promesse deja en vol plutot que d'ouvrir un second onglet.
// NOTE : si un second appel concurrent survient avec un `onAwaitingConfirmation`
// DIFFERENT (ne devrait pas arriver en pratique -- performRepublishReplaceTransaction
// n'est jamais rejouee pour la meme finalisation, voir successFinalizationStarted
// dans publishListing.ts), seul le callback du PREMIER appelant est invoque.
const inFlightDeletions = new Map<string, Promise<DeleteOldListingResult>>();

export async function attemptDeleteOldVintedListing(
  oldVintedItemId: string,
  onAwaitingConfirmation?: () => void
): Promise<DeleteOldListingResult> {
  const existing = inFlightDeletions.get(oldVintedItemId);
  if (existing) {
    logger.info("REPUBLISH_OLD_DELETE_ALREADY_IN_FLIGHT", { oldVintedItemId });
    return existing;
  }
  const promise = performDeleteOldVintedListing(oldVintedItemId, onAwaitingConfirmation).finally(() => {
    inFlightDeletions.delete(oldVintedItemId);
  });
  inFlightDeletions.set(oldVintedItemId, promise);
  return promise;
}
