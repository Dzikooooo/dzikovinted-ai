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
const MAX_ENTRIES = 50;

// chrome.storage.local n'offre aucune primitive de transaction : persist() fait un
// read-modify-write. Sans serialisation, plusieurs logger.info() declenches en rafale
// (ex. juste avant/apres un clic synthetique) lisent le meme tableau avant que l'un
// d'eux n'ait ecrit, et seul le dernier set() a se resoudre survit — les autres entrees
// disparaissent silencieusement. Une simple file d'attente sur une promesse partagee
// force chaque persist() a attendre son tour.
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

function detailToString(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function write(level: LogLevel, message: string, detail?: unknown): void {
  const entry: LogEntry = { level, message, detail: detailToString(detail), at: new Date().toISOString() };
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn("[ResellOS]", message, detail ?? "");
  void persist(entry);
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
