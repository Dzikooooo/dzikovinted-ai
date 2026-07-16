// Handler d'execution pour l'action "edit_listing" (Partie 4, sprint
// extension V1) -- miroir de handlePublishListing.ts (publish_listing),
// seule difference reelle : l'onglet s'ouvre sur la page d'edition de
// L'ARTICLE CIBLE (payload.vintedItemId) plutot que sur le formulaire de
// creation generique, et le content script attendu est vinted-edit.ts
// (commande EDIT_LISTING).
//
// CAUSE RACINE #1 demontree le 2026-07-15 (pipeline ResellOS -> Vinted
// n'atteignait jamais Vinted, symptome observe : "la page Vinted s'ouvre
// brievement puis disparait") : l'ancienne version envoyait la commande
// EDIT_LISTING via un retry aveugle a duree fixe. Corrige par un signal
// explicite (EDIT_TAB_READY, envoye par vinted-edit.ts des qu'il a
// enregistre son listener) -- voir commit precedent.
//
// CAUSE RACINE #2 demontree le meme jour, test suivant : EDIT_TAB_READY
// est desormais bien recu, mais l'envoi de EDIT_LISTING qui suit
// immediatement echoue avec "Could not establish connection. Receiving
// end does not exist." Preuve que le content script qui a envoye
// EDIT_TAB_READY n'existe deja plus au moment de la reponse -- coherent
// avec une navigation/redirection reelle de la page ENTRE l'envoi du
// signal et la reponse (le premier document qui s'injecte declarativement
// a document_idle n'est pas forcement le document final si Vinted
// redirige apres coup). Corrige par deux mecanismes complementaires :
// 1) l'echec d'un envoi n'est plus fatal -- le handler continue d'ecouter
//    un NOUVEL EDIT_TAB_READY (une eventuelle reinjection sur le document
//    final) plutot que d'abandonner immediatement ;
// 2) des que l'onglet atteint chrome.tabs.onUpdated status:"complete"
//    (navigation reellement terminee), le content script est reinjecte
//    EXPLICITEMENT via chrome.scripting.executeScript (fichiers lus
//    depuis le manifest genere, jamais code en dur) -- garantit une
//    instance vivante dans le document final, independamment de ce que
//    l'injection declarative a pu faire sur d'eventuels documents
//    intermediaires.
//
// CAUSE RACINE #3 demontree le 2026-07-16, test suivant (98 -> 97 euros) :
// "Vinted est toujours a 99 euros. ResellOS est revenu a 99 euros. aucun
// message d'erreur visible." Le predicat de "confirmation"
// (/\/items\/\d+/.test(location.pathname), cote vinted-edit.ts) n'etait
// pas ancre et matchait DEJA l'URL de depart /items/{id}/edit avant meme
// que le clic sur Enregistrer ait pu produire un effet -- un succes
// (PUBLISH_RESULT status:"success") etait donc rapporte quasi
// instantanement et inconditionnellement. Consequence en cascade : la
// ligne action_log/listing passait sync_success, ce qui la retirait de la
// protection "ne jamais ecraser silencieusement" (reservee a
// sync_pending/sync_failed cote recordListings/recordSingleItemImport) --
// la synchronisation passive suivante a donc legitimement re-importe la
// vraie valeur Vinted (99), ecrasant le 97 jamais reellement enregistre.
// Corrige en deux temps : (1) le predicat exclut desormais /edit ; (2) le
// pipeline edit_listing ne se termine plus jamais sur un simple clic --
// une PHASE DE VERIFICATION distincte est ajoutee ci-dessous : des que
// vinted-edit.ts rapporte EDIT_SAVE_SUBMITTED (clic + navigation hors
// /edit, PAS une preuve), ce handler renavigue EXPLICITEMENT l'onglet vers
// la MEME page d'edition (chrome.tabs.update), reutilise le mecanisme
// EDIT_TAB_READY deja fiable pour une seconde injection, puis envoie
// VERIFY_EDIT_FIELDS pour que le content script relise les valeurs REELLES
// des champs texte modifies (titre/description/prix) directement dans le
// DOM. Seul EDIT_VERIFICATION_RESULT determine desormais success/error --
// "preuve acceptable" #3 explicitement demandee par l'utilisateur
// ("rechargement de la page d'edition et lecture du champ prix egal a la
// valeur demandee"). Les champs d'attributs (categorie/marque/taille/
// etat/couleur/matiere) n'ont pas de mecanisme de relecture fiable
// equivalent -- limite documentee : si SEULS des attributs ont change
// (aucun champ verifiable dans changedFields), le succes est encore
// declare sur EDIT_SAVE_SUBMITTED, sans la garantie renforcee.

import { logger } from "../logger";
import { isContentReport } from "../../lib/messages";
import type {
  ContentCommand,
  EditListingPayload,
  PublishStep,
  RunActionOutcome,
  RunActionRequest,
  VerifyEditFieldsPayload,
} from "../../lib/messages";
import { errorMessage } from "../../lib/errorMessage";

type VerifiableField = "title" | "description" | "price";
function isVerifiableField(field: string): field is VerifiableField {
  return field === "title" || field === "description" || field === "price";
}

// GARDE TEMPORAIRE (demande explicite 2026-07-15, phase de validation du
// pipeline edit_listing) -- meme protection que src/lib/actions/checks.ts::
// checkEditSandboxOnly cote app, dupliquee ici en defense en profondeur
// puisque c'est CE code qui execute reellement l'ecriture sur Vinted.
// Aucune annonce reelle (polos, jeans...) ne doit pouvoir etre touchee
// pendant les tests repetes du pipeline. A RETIRER PROPREMENT (cette
// constante + le bloc de verification dans handleEditListing) une fois le
// pipeline valide de bout en bout -- ne doit jamais rester en production.
const SANDBOX_TEST_VINTED_ITEM_ID = "9400476768";

const GLOBAL_TIMEOUT_MS = 90000;
// Delai raisonnable pour qu'une vraie navigation de page + chargement d'un
// chunk JS dynamique se termine -- distinct et bien plus court que le
// timeout global (qui couvre en plus tout le remplissage/soumission).
const TAB_READY_TIMEOUT_MS = 20000;

function sendCommandToTab(tabId: number, command: ContentCommand): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, command, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

// Fichiers du content script d'edition tels qu'enregistres dans le
// manifest genere par CRXJS -- lus dynamiquement (jamais de chemin/hash
// code en dur, qui changerait a chaque build) pour permettre une
// reinjection explicite en secours de l'injection declarative.
function findEditContentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest();
  const entry = manifest.content_scripts?.find((cs) => cs.js?.some((f) => f.includes("vinted-edit")));
  return entry?.js ?? [];
}

export async function handleEditListing(
  request: RunActionRequest,
  onProgress: (step: PublishStep) => void
): Promise<RunActionOutcome> {
  const historyId = request.historyId;
  const pipelineStart = performance.now();
  function pipeline(name: string, detail?: unknown): void {
    const elapsedMs = Math.round(performance.now() - pipelineStart);
    logger.info(`[PIPELINE][${historyId}] ${name} (+${elapsedMs}ms)`, detail ?? {});
  }

  // historyId injecte dans le payload uniquement pour que le content
  // script (vinted-edit.ts) puisse taguer ses propres logs avec le meme
  // identifiant -- jamais utilise pour la logique metier.
  const payload: EditListingPayload = { ...(request.payload as unknown as EditListingPayload), historyId };

  // GARDE TEMPORAIRE -- voir commentaire en tete de fichier. Refuse avant
  // meme d'ouvrir un onglet.
  if (payload.vintedItemId !== SANDBOX_TEST_VINTED_ITEM_ID) {
    logger.error(`[${historyId}] handleEditListing: refuse (protection sandbox temporaire)`, {
      vintedItemId: payload.vintedItemId,
      sandboxAutorise: SANDBOX_TEST_VINTED_ITEM_ID,
    });
    return {
      status: "error",
      errorMessage:
        'Protection temporaire active : seule l\'annonce sandbox de test ("Planche en bois") peut être modifiée pendant la phase de validation du pipeline.',
    };
  }

  pipeline("tab_created (creation de la tache d'edition)", { vintedItemId: payload.vintedItemId, price: payload.price });
  logger.info(`[${historyId}] handleEditListing: demarrage`, {
    vintedItemId: payload.vintedItemId,
    price: payload.price,
  });

  onProgress("preparing");

  const editUrl = `https://www.vinted.fr/items/${payload.vintedItemId}/edit`;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: editUrl, active: true });
    pipeline("tab_created", { editUrl, tabId: tab.id });
    logger.debug(`[${historyId}] handleEditListing: onglet ouvert`, { editUrl, tabId: tab.id });
  } catch (err) {
    logger.error(`[${historyId}] handleEditListing: chrome.tabs.create a echoue`, errorMessage(err));
    return { status: "error", errorMessage: `Impossible d'ouvrir un onglet Vinted : ${errorMessage(err)}` };
  }
  if (tab.id === undefined) {
    logger.error(`[${historyId}] handleEditListing: onglet cree sans id`);
    return { status: "error", errorMessage: "Onglet Vinted invalide" };
  }
  const tabId: number = tab.id;

  // Seuls title/description/price ont un mecanisme de relecture DOM fiable
  // (memes selecteurs, comparaison directe) -- voir commentaire cause
  // racine #3 en tete de fichier.
  const verifiableFields = payload.changedFields.filter(isVerifiableField);

  return new Promise<RunActionOutcome>((resolve) => {
    let settled = false;
    let tabClosedByHandler = false;
    let sendInFlight = false;
    let explicitlyInjectedAfterComplete = false;
    let phase: "editing" | "verifying" = "editing";
    // URL reelle post-sauvegarde (page de l'article, pas /edit) rapportee
    // par EDIT_SAVE_SUBMITTED -- conservee pour le resultPayload final
    // plutot que reutiliser editUrl, qui ne redevient valide qu'apres la
    // renavigation de la phase de verification.
    let confirmedVintedUrl = editUrl;

    function buildExpected(): VerifyEditFieldsPayload["expected"] {
      const expected: VerifyEditFieldsPayload["expected"] = {};
      // String(payload.price) : doit correspondre exactement a la valeur
      // ecrite dans le DOM par vinted-edit.ts (setNativeValue(priceInput,
      // payload.price.toString())) pour que la comparaison soit valide.
      if (verifiableFields.includes("price")) expected.price = String(payload.price);
      if (verifiableFields.includes("title")) expected.title = payload.title;
      if (verifiableFields.includes("description")) expected.description = payload.description;
      return expected;
    }

    function currentCommand(): ContentCommand {
      return phase === "editing"
        ? { type: "EDIT_LISTING", payload }
        : { type: "VERIFY_EDIT_FIELDS", payload: { historyId, expected: buildExpected() } };
    }

    function attemptSend(reason: string): void {
      if (sendInFlight) return;
      sendInFlight = true;
      const command = currentCommand();
      pipeline(`${command.type}_sent`, { reason, tabId, phase });
      logger.debug(`[${historyId}] handleEditListing: envoi de ${command.type} (${reason})`);
      sendCommandToTab(tabId, command)
        .then(() => {
          pipeline(`${command.type}_received (ACK du content script)`);
          logger.debug(`[${historyId}] handleEditListing: commande ${command.type} envoyee et acquittee`);
        })
        .catch((err) => {
          // NON FATAL (cause racine #2) : le content script qui a envoye
          // EDIT_TAB_READY n'existe deja plus (navigation entre-temps).
          // On ne cloture PAS le pipeline ici -- on continue d'ecouter un
          // nouvel EDIT_TAB_READY (reinjection explicite ci-dessous ou
          // reinjection declarative sur le document final) jusqu'au
          // timeout tabReadyTimeout.
          pipeline("ECHEC envoi (non fatal, en attente d'un nouveau signal pret)", { message: errorMessage(err) });
          logger.warn(`[${historyId}] handleEditListing: envoi de ${command.type} a echoue, en attente d'un nouveau signal`, errorMessage(err));
          sendInFlight = false;
        });
    }

    // Declenchee des reception de EDIT_SAVE_SUBMITTED (clic + navigation
    // hors /edit -- PAS une preuve). Si aucun champ verifiable n'a change
    // (attributs seuls), aucune relecture fiable n'existe : succes declare
    // directement, limite documentee explicitement (voir commentaire cause
    // racine #3). Sinon : renavigue vers la MEME page d'edition et
    // reutilise EDIT_TAB_READY pour une seconde injection dediee a la
    // verification.
    function beginVerificationPhase(vintedUrl: string): void {
      if (verifiableFields.length === 0) {
        pipeline("verification_ignoree (aucun champ texte verifiable dans changedFields)", { changedFields: payload.changedFields });
        logger.info(`[${historyId}] handleEditListing: aucun champ verifiable, succes declare sans relecture reelle`, {
          changedFields: payload.changedFields,
        });
        settle({ status: "success", resultPayload: { vintedItemId: payload.vintedItemId, vintedUrl } });
        return;
      }

      phase = "verifying";
      sendInFlight = false;
      explicitlyInjectedAfterComplete = false;
      clearTimeout(tabReadyTimeout);
      tabReadyTimeout = setTimeout(onTabReadyTimeout, TAB_READY_TIMEOUT_MS);

      pipeline("verification_phase_started", { verifiableFields, editUrl });
      logger.info(`[${historyId}] handleEditListing: demarrage de la phase de verification (renavigation)`, { verifiableFields });

      chrome.tabs.update(tabId, { url: editUrl }).catch((err) => {
        pipeline("ECHEC : renavigation vers la page d'edition pour verification");
        logger.error(`[${historyId}] handleEditListing: chrome.tabs.update (verification) a echoue`, errorMessage(err));
        settle({ status: "error", errorMessage: `Impossible de relire la page Vinted pour confirmer la modification : ${errorMessage(err)}` });
      });
    }

    function describeMismatch(details: Record<string, { expected: string; actual: string | null }>): string {
      return Object.entries(details)
        .filter(([, d]) => d.actual !== d.expected)
        .map(([field, d]) => `${field} attendu "${d.expected}", trouve "${d.actual ?? "(champ introuvable)"}"`)
        .join(" ; ");
    }

    function onMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
      if (sender.tab?.id !== tabId || !isContentReport(message)) return false;

      if (message.type === "EDIT_TAB_READY") {
        pipeline("edit_ready_received", { phase });
        clearTimeout(tabReadyTimeout);
        attemptSend("EDIT_TAB_READY recu");
        return false;
      }

      if (message.type === "PUBLISH_PROGRESS") {
        pipeline(`Progression : ${message.step}`);
        logger.debug(`[${historyId}] handleEditListing: progression`, { step: message.step });
        onProgress(message.step);
      } else if (message.type === "PUBLISH_RESULT") {
        // Uniquement atteint sur un ECHEC reel desormais (timeout DOM,
        // session expiree...) -- le chemin de succes n'envoie plus
        // PUBLISH_RESULT, voir EDIT_SAVE_SUBMITTED ci-dessous.
        pipeline("Retour vers ResellOS (resultat recu du content script)", message.outcome);
        logger.info(`[${historyId}] handleEditListing: resultat recu du content script`, message.outcome);
        settle(message.outcome);
      } else if (message.type === "EDIT_SAVE_SUBMITTED") {
        pipeline("edit_save_submitted (clic + navigation detectes, pas encore une preuve)", message);
        logger.info(`[${historyId}] handleEditListing: EDIT_SAVE_SUBMITTED recu, demarrage de la verification`, message);
        confirmedVintedUrl = message.vintedUrl;
        beginVerificationPhase(message.vintedUrl);
      } else if (message.type === "EDIT_VERIFICATION_RESULT") {
        pipeline("verification_result_received", message);
        logger.info(`[${historyId}] handleEditListing: resultat de verification recu`, message);
        if (message.matches) {
          settle({ status: "success", resultPayload: { vintedItemId: payload.vintedItemId, vintedUrl: confirmedVintedUrl } });
        } else {
          settle({
            status: "error",
            errorMessage: `Vinted n'a pas confirmé la modification. ${describeMismatch(message.details)}`,
          });
        }
      }
      return false;
    }

    // Cause racine #2, mecanisme 2/2 : des que la navigation est
    // REELLEMENT terminee (pas juste document_idle sur un document
    // intermediaire eventuel), reinjecte explicitement le content script
    // pour garantir une instance vivante dans le document final. Reutilise
    // pour les DEUX phases (edition et verification) -- explicitlyInjectedAfterComplete
    // est reinitialise au debut de la phase de verification.
    function onTabUpdated(updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void {
      if (updatedTabId !== tabId || changeInfo.status !== "complete" || explicitlyInjectedAfterComplete) return;
      explicitlyInjectedAfterComplete = true;
      pipeline("tab_complete", { phase });
      logger.debug(`[${historyId}] handleEditListing: onglet status=complete, reinjection explicite`, { phase });

      const files = findEditContentScriptFiles();
      if (files.length === 0) {
        logger.error(`[${historyId}] handleEditListing: aucun fichier de content script d'edition trouve dans le manifest`);
        return;
      }
      chrome.scripting
        .executeScript({ target: { tabId }, files })
        .then(() => {
          pipeline("content_script_injected", { files });
          logger.debug(`[${historyId}] handleEditListing: reinjection explicite reussie`, { files });
        })
        .catch((err) => {
          // Non fatal : l'injection declarative a peut-etre deja suffi
          // (EDIT_TAB_READY peut arriver independamment de cette
          // reinjection) -- seul le timeout global tabReadyTimeout decide
          // d'un echec final.
          pipeline("ECHEC reinjection explicite (non fatal)", { message: errorMessage(err) });
          logger.warn(`[${historyId}] handleEditListing: reinjection explicite a echoue`, errorMessage(err));
        });
    }

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId || tabClosedByHandler) return;
      pipeline("ECHEC : onglet ferme avant la fin (fermeture externe, pas par le handler)");
      logger.warn(`[${historyId}] handleEditListing: onglet ferme avant la fin`);
      settle({ status: "error", errorMessage: "Modification interrompue (onglet fermé)" });
    }

    function cleanup(): void {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      clearTimeout(globalTimeout);
      clearTimeout(tabReadyTimeout);
    }

    function settle(outcome: RunActionOutcome): void {
      if (settled) return;
      settled = true;
      cleanup();
      tabClosedByHandler = true;
      chrome.tabs.remove(tabId).catch(() => {});
      pipeline("Pipeline termine", { status: outcome.status });
      logger.info(`[${historyId}] handleEditListing: termine`, { status: outcome.status });
      resolve(outcome);
    }

    const globalTimeout = setTimeout(() => {
      logger.error(`[${historyId}] handleEditListing: delai depasse (${GLOBAL_TIMEOUT_MS}ms)`);
      settle({ status: "error", errorMessage: "Délai dépassé : la modification n'a pas abouti" });
    }, GLOBAL_TIMEOUT_MS);

    // Si aucun EDIT_TAB_READY exploitable (envoi reussi) n'est jamais
    // recu, l'echec est honnete et precis plutot qu'un simple "delai
    // depasse" generique -- distingue explicitement cette etape des
    // autres. Reassigne (let, pas const) au debut de la phase de
    // verification pour donner un nouveau delai a la seconde attente.
    function onTabReadyTimeout(): void {
      pipeline(`ECHEC : aucune commande acquittee sous ${TAB_READY_TIMEOUT_MS}ms (phase ${phase})`);
      logger.error(`[${historyId}] handleEditListing: aucune commande acquittee sous ${TAB_READY_TIMEOUT_MS}ms`, { phase });
      settle({
        status: "error",
        errorMessage:
          phase === "editing"
            ? "La page d'édition Vinted n'a pas confirmé être prête à temps (le script d'automatisation n'a jamais pu recevoir la commande). Réessaie -- si le problème persiste, la page Vinted a peut-être changé de structure."
            : "Impossible de relire la page Vinted après sauvegarde pour confirmer la modification (délai dépassé). Vinted n'a pas confirmé la modification.",
      });
    }
    let tabReadyTimeout = setTimeout(onTabReadyTimeout, TAB_READY_TIMEOUT_MS);

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  });
}
