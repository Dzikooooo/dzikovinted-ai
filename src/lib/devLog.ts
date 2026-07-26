// Journal de debug [ResellOS][...] : utile pendant le developpement, mais
// ne doit jamais rester visible dans la console d'un utilisateur reel en
// production (Design Freeze, Lot 0, 2026-07-27 -- "version client"). Ces
// wrappers remplacent console.log/warn/error a l'identique (mêmes
// arguments), no-op hors de import.meta.env.DEV.
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) console.warn(...args);
}

export function devError(...args: unknown[]): void {
  if (import.meta.env.DEV) console.error(...args);
}
