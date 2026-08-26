// Mission "UI DE PROGRAMMATION DES REPUBLICATIONS" (2026-08-20, round 1) :
// structure de donnees + validation PUREMENT LOCALES a l'origine (pas de
// colonne Supabase). Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) :
// `republish_schedules` existe desormais reellement en base (voir la
// migration) -- ce type reste la forme consommee par l'UI (ListingCard,
// PublishConfirmationModal), mais sa SOURCE devient Supabase
// (src/services/republishSchedules.ts), plus un state local ephemere.
// `packageSize` optionnel (pas simplement ajoute en `not null`) : garde ce
// type retrocompatible avec les literaux deja existants dans les tests
// round 1 (`{mode:'scheduled', date, time}` sans ce champ) -- une ligne
// reellement lue depuis `republish_schedules` l'inclut toujours (colonne
// `not null` en base), un `initialSchedule` construit a la main peut choisir
// de l'omettre sans casser le typage.
export type RepublishSchedule =
  | { mode: 'now' }
  | { mode: 'scheduled'; date: string; time: string; packageSize?: string };

export const MONTH_NAMES_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function todayLocalDateString(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nowLocalTimeString(now: Date): string {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// Comparaison lexicographique valide : "YYYY-MM-DD" et "HH:mm" sont a
// largeur fixe et zero-paddes, donc l'ordre des chaines suit exactement
// l'ordre chronologique -- pas besoin de reparser en Date pour comparer.
export function isDateInPast(date: string, now: Date = new Date()): boolean {
  return date < todayLocalDateString(now);
}

export function isTimeInPastToday(date: string, time: string, now: Date = new Date()): boolean {
  if (date !== todayLocalDateString(now)) return false;
  return time < nowLocalTimeString(now);
}

export function isScheduleValid(date: string | null, time: string | null, now: Date = new Date()): boolean {
  if (!date || !time) return false;
  if (isDateInPast(date, now)) return false;
  if (isTimeInPastToday(date, time, now)) return false;
  return true;
}

export function formatScheduleLabel(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTH_NAMES_FR[m - 1]} ${y} à ${time}`;
}

// Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : `republish_schedules.scheduled_for`
// est un `timestamptz` -- la date/heure choisie dans l'UI est TOUJOURS en
// heure locale de l'utilisateur (le DatePicker/TimePicker n'ont aucune
// notion de fuseau). Construit une vraie `Date` locale (les 6 arguments du
// constructeur `Date` sont interpretes dans le fuseau LOCAL du moteur JS,
// jamais UTC) puis `.toISOString()` fait la conversion reelle vers UTC --
// jamais de concatenation naive ("${date}T${time}:00Z"), qui supposerait a
// tort que l'heure saisie EST deja de l'UTC (faux des que l'utilisateur
// n'est pas lui-meme en UTC+0).
export function localDateTimeToISO(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

// Symetrique -- relit une chaine ISO (UTC, telle que renvoyee par Postgres)
// et la reconvertit en date/heure LOCALE pour prereplir le DatePicker/
// TimePicker. `new Date(iso)` cree l'instant reel ; `getFullYear()`/
// `getHours()`/... (jamais leurs equivalents `getUTC*`) lisent cet instant
// dans le fuseau local du navigateur -- symetrique exact de
// localDateTimeToISO ci-dessus (round-trip garanti, voir les tests).
export function isoToLocalDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${y}-${mo}-${day}`, time: `${h}:${mi}` };
}
