// Mission "FIABILISER L'IMPORT PHOTOS AVANT DE CONTINUER LES TESTS
// PUBLICATION/SUPPRESSION" (2026-08-17). Bug live reproductible : 5/5 photos
// un jour, 1/5 le lendemain sur la MEME annonce source, alors que le reste du
// formulaire (titre, etc.) continuait a se remplir -- preuve que l'ancienne
// injectPhotosWithConfirmation() (vinted-publish.ts) traitait deja l'import
// photo comme "best effort, jamais bloquant" (comme les champs texte), sans
// jamais empecher la suite du flow (watchForPublishReadiness) de considerer
// le formulaire pret des que Vinted n'exige qu'AU MOINS une photo -- jamais
// exactement N.
//
// Logique de decision PURE extraite ici (aucun DOM/chrome, injectee via
// PhotoImportDeps) pour rester testable en isolation -- meme discipline que
// domWait.ts/matchOption.ts/photoReconstruction.ts. vinted-publish.ts reste
// seul responsable de fournir les callbacks reels (lecture DOM, injection,
// attente).
//
// DECISION D'ARCHITECTURE CENTRALE (pourquoi UNE SEULE injection, jamais de
// reinjection) : le widget photo de Vinted est un input multi-fichiers de
// type "ajouter des photos" -- rien ne prouve qu'une seconde assignation de
// input.files AJOUTE plutot que ne REMPLACE le lot deja présent côté React,
// mais l'hypothèse la plus probable pour un widget d'upload incrémental
// (l'utilisateur peut rouvrir le sélecteur plusieurs fois pour ajouter des
// photos) est qu'elle AJOUTE. Si c'est le cas et que les photos "manquantes"
// sont en réalité encore en cours de traitement asynchrone côté Vinted (pas
// perdues, juste lentes), réinjecter les mêmes fichiers créerait des
// doublons une fois ce traitement terminé -- exactement le risque signalé
// explicitement par l'utilisateur. Aucun signal fiable ne permet de
// distinguer "en cours de traitement" de "silencieusement rejeté" avant
// l'expiration du délai. La seule stratégie sans AUCUN risque de doublon est
// donc : injecter une fois, puis seulement RE-VÉRIFIER (jamais RE-INJECTER)
// sur une fenêtre d'attente cumulée plus longue -- "retries bornés avec
// attente raisonnable" (demande explicite) porte sur la VÉRIFICATION, pas sur
// la soumission des fichiers.
//
// "détermine quelles photos sont réellement présentes... ou nettoie/repars de
// manière déterministe" (demande explicite) : couvert par le refus de
// injecter si la grille n'est PAS vide avant même la première tentative
// (état inattendu sur /items/new, qui démarre toujours vierge) -- plutôt que
// de deviner un état de départ et risquer d'empiler une injection par-dessus
// des vignettes déjà présentes pour une raison inconnue.

export interface PhotoImportOutcome {
  status: "confirmed" | "failed";
  confirmedCount: number;
  expectedCount: number;
  reason?: string;
}

// Seul critère de succès autorisé (demande explicite) : egalite stricte.
// Une grille affichant PLUS de vignettes que prevu (contamination, doublon
// deja survenu) est tout aussi invalide qu'une grille en affichant MOINS.
export function evaluatePhotoImportOutcome(confirmedCount: number, expectedCount: number, reason?: string): PhotoImportOutcome {
  return { status: confirmedCount === expectedCount ? "confirmed" : "failed", confirmedCount, expectedCount, reason };
}

export interface PhotoImportDeps<TFile> {
  countDomThumbnails: () => number;
  injectFiles: (files: TFile[]) => Promise<void>;
  // Resout des que countDomThumbnails() atteint expectedCount, ou apres
  // timeoutMs -- ne rejette JAMAIS (un timeout n'est pas une erreur fatale
  // ici, seulement une tentative infructueuse ; l'appelant relit toujours
  // countDomThumbnails() juste apres pour connaitre l'etat REEL).
  waitForDomCountOrTimeout: (expectedCount: number, timeoutMs: number) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  onExpected: (detail: { expectedCount: number }) => void;
  onAttempt: (detail: { attempt: number; expectedCount: number }) => void;
  onDomCount: (detail: { attempt: number; expectedCount: number; confirmedCount: number }) => void;
  onRetry: (detail: { attempt: number; expectedCount: number; confirmedCount: number; nextAttempt: number }) => void;
  onConfirmed: (outcome: PhotoImportOutcome) => void;
  onFailed: (outcome: PhotoImportOutcome) => void;
}

export interface PhotoImportOptions {
  maxAttempts?: number; // nombre de RE-VERIFICATIONS (jamais de re-injections), >= 1
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_DELAY_MS = 1500;

// `expectedCount` est TOUJOURS le nombre reel de photos de l'annonce SOURCE
// (voir l'en-tete) -- distinct de `files.length`, qui peut deja etre
// inferieur si une etape en amont (fetch CDN, reconstruction magic-bytes) a
// deja perdu des photos. Ne jamais confondre les deux : c'est precisement ce
// qui permettait auparavant a un import partiel de se faire passer pour
// complet.
export async function importPhotosWithVerification<TFile>(
  files: TFile[],
  expectedCount: number,
  deps: PhotoImportDeps<TFile>,
  options: PhotoImportOptions = {}
): Promise<PhotoImportOutcome> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  deps.onExpected({ expectedCount });

  const baselineCount = deps.countDomThumbnails();
  if (baselineCount > 0) {
    const outcome = evaluatePhotoImportOutcome(baselineCount, expectedCount, "grid_not_empty_before_injection");
    deps.onFailed(outcome);
    return outcome;
  }

  if (files.length > 0) {
    // Une injection qui echoue AVANT meme d'avoir pu assigner le moindre
    // fichier (ex. input introuvable -- l'appelant reel journalise deja sa
    // propre raison precise avant de rejeter) ne doit jamais faire planter
    // toute la verification : elle se traduit simplement par "rien n'a ete
    // injecte", que la boucle de verification ci-dessous detecte et
    // sanctionne naturellement via le comptage DOM (jamais un succes
    // invente, jamais une exception non geree qui casserait tout le flow).
    try {
      await deps.injectFiles(files);
    } catch {
      // Raison deja journalisee par l'appelant (ex. PHOTO_INPUT_NOT_FOUND).
    }
  }

  // Pas de lecture DOM ici avant la boucle -- la premiere iteration ci-dessous
  // en fait toujours une (apres sa propre attente), jamais besoin d'une
  // lecture supplementaire immediatement ecrasee.
  let confirmedCount = baselineCount;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    deps.onAttempt({ attempt, expectedCount });
    await deps.waitForDomCountOrTimeout(expectedCount, attemptTimeoutMs);
    confirmedCount = deps.countDomThumbnails();
    deps.onDomCount({ attempt, expectedCount, confirmedCount });

    if (confirmedCount === expectedCount) break;
    if (attempt < maxAttempts) {
      deps.onRetry({ attempt, expectedCount, confirmedCount, nextAttempt: attempt + 1 });
      await deps.wait(retryDelayMs);
    }
  }

  const outcome = evaluatePhotoImportOutcome(confirmedCount, expectedCount);
  if (outcome.status === "confirmed") deps.onConfirmed(outcome);
  else deps.onFailed(outcome);
  return outcome;
}
