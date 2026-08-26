// Mission "ROUND 5 -- RESULTAT D'UNE REPUBLICATION PROGRAMMEE" (2026-08-23) :
// memorise les resultats (succeeded/failed) que l'utilisateur a deja vus,
// pour qu'un resultat reste visible sur la carte jusqu'a ce qu'il l'ait
// explicitement acquitte -- et pas seulement le temps d'un rechargement.
//
// CHOIX ASSUME : localStorage, PAS une colonne en base.
// La table republish_schedules n'a pas de colonne `acknowledged_at` et le
// perimetre de ce round exclut toute migration. Consequence honnete a
// connaitre : l'acquittement est LOCAL AU NAVIGATEUR -- ouvrir ResellOS sur
// un autre appareil reaffichera un resultat deja acquitte ailleurs. C'est le
// bon sens du compromis (mieux vaut montrer deux fois que jamais), mais si
// la synchronisation multi-appareils devient necessaire, la vraie solution
// est une colonne `acknowledged_at` + un UPDATE (la policy RLS update
// existante suffit deja, aucune RPC ne serait necessaire).
//
// Meme discipline que src/lib/storage.ts : jamais d'acces direct a
// localStorage disperse dans l'UI, et toujours protege par try/catch (mode
// navigation privee Safari, quota depasse, storage desactive -- localStorage
// peut lever, et ceci ne doit JAMAIS casser l'affichage des annonces).

const STORAGE_KEY = 'resellos:republishAcknowledged';
// Garde-fou de taille : au-dela, on ne garde que les plus recents. Sans
// cela la liste grandirait indefiniment a chaque republication programmee.
const MAX_ENTRIES = 200;

function readRaw(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

export function getAcknowledgedScheduleIds(): Set<string> {
  return new Set(readRaw());
}

export function acknowledgeSchedule(id: string): void {
  try {
    const current = readRaw().filter((existing) => existing !== id);
    // Le plus recent en fin de liste -- c'est le debut qu'on tronque.
    const next = [...current, id].slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Echec silencieux volontaire : ne pas acquitter est un desagrement
    // (le resultat se reaffichera), casser la page ne l'est pas.
  }
}
