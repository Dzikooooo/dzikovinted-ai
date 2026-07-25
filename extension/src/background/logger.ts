// Logger leve avec ring buffer persiste dans chrome.storage.local, pour pouvoir
// diagnostiquer un souci d'appairage/sync depuis le popup sans avoir eu les
// devtools du service worker ouverts au bon moment.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  detail?: string;
  at: string;
}

const STORAGE_KEY = "resellos_log";
// Porte de 50 a 400 (2026-07-25, bug reel confirme en test edit_listing) :
// la seule phase de verification d'un run edit_listing (retries EDIT_TAB_READY,
// tab_updated, keepalives) genere a elle seule ~46 entrees -- largement de
// quoi evincer du tampon de 50 les entrees de la phase precedente (dont
// NETWORK_FETCH_SENT/RESPONSE, la donnee la plus recherchee) avant meme que
// l'utilisateur ait pu les recuperer. Chaque entree reste bornee (voir
// truncateForLog dans vinted-edit.ts, ~4000 caracteres max pour les corps de
// requete/reponse) -- 400 entrees restent tres largement sous le quota par
// defaut de chrome.storage.local (5 Mo, aucune permission "unlimitedStorage"
// declaree).
const MAX_ENTRIES = 400;

// chrome.storage.local n'offre aucune primitive de transaction : persist() fait un
// read-modify-write. Sans serialisation, plusieurs logger.info() declenches en rafale
// (ex. juste avant/apres un clic synthetique) lisent le meme tableau avant que l'un
// d'eux n'ait ecrit, et seul le dernier set() a se resoudre survit — les autres entrees
// disparaissent silencieusement. Une simple file d'attente sur une promesse partagee
// force chaque persist() a attendre son tour.
//
// INSUFFISANT SEUL (2026-07-25, bug reel confirme en test edit_listing) : writeQueue
// est une variable de MODULE -- chaque contexte JS (background, ET chaque content
// script, qui a sa PROPRE instance de ce module) a sa PROPRE file d'attente,
// totalement independante des autres. SAVE_BUTTON_FOUND/EVENT_REACHED_DOCUMENT
// (content script) perdus alors que REACT_INSPECT/SUBMIT_CONTROL_INSPECT (meme bloc
// synchrone) survivaient -- preuve d'une course ENTRE le writeQueue du content script
// et celui du background (qui ecrit ses propres logs, ex. WEBREQUEST_*, au meme
// instant), pas seulement au sein d'un seul contexte. Corrige en centralisant TOUTE
// ecriture dans le SEUL contexte background (voir isBackgroundContext ci-dessous) :
// un content script ne persiste plus jamais directement, il relaie son entree via
// chrome.runtime.sendMessage (RELAY_LOG_ENTRY, voir messages.ts) et c'est le
// background -- une seule instance de ce module, une seule writeQueue pour toute
// l'extension -- qui appelle persistRelayedEntry().
let writeQueue: Promise<void> = Promise.resolve();

function persist(entry: LogEntry): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as
      | LogEntry[]
      | undefined;
    const next = [...(stored ?? []), entry].slice(-MAX_ENTRIES);
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  });
  return writeQueue;
}

// Appelee uniquement par le routeur de messages du background (index.ts) sur
// reception d'un RELAY_LOG_ENTRY -- seul point d'entree pour persister une
// entree provenant d'un content script.
export function persistRelayedEntry(entry: LogEntry): Promise<void> {
  return persist(entry);
}

function detailToString(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

// Le service worker MV3 n'a pas de `window` (ServiceWorkerGlobalScope) -- un
// content script, lui, partage le `window` de la page ou il s'execute (isolated
// world, mais meme objet window/document). Distinction standard et fiable entre
// les deux contextes, utilisee ici pour decider qui a le droit d'ecrire
// directement dans chrome.storage.local.
const isBackgroundContext = typeof window === "undefined";

function write(level: LogLevel, message: string, detail?: unknown): void {
  const entry: LogEntry = { level, message, detail: detailToString(detail), at: new Date().toISOString() };
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn("[ResellOS]", message, detail ?? "");
  if (isBackgroundContext) {
    void persist(entry);
  } else {
    // Fire-and-forget, comme l'ancien void persist(entry) direct -- un content
    // script n'a jamais attendu la confirmation d'ecriture de son propre log.
    chrome.runtime.sendMessage({ type: "RELAY_LOG_ENTRY", entry }).catch(() => {});
  }
}

export const logger = {
  debug: (message: string, detail?: unknown) => write("debug", message, detail),
  info: (message: string, detail?: unknown) => write("info", message, detail),
  warn: (message: string, detail?: unknown) => write("warn", message, detail),
  error: (message: string, detail?: unknown) => write("error", message, detail),
  getRecent: async (): Promise<LogEntry[]> => {
    const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as
      | LogEntry[]
      | undefined;
    return stored ?? [];
  },
};
