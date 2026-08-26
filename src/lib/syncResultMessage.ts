import type { SyncVintedAccountResult } from './extensionBridge';

// Traduction du resultat STRUCTURE renvoye par l'extension en message
// utilisateur. Extrait de ListingsManagementSection.tsx le 2026-08-26, sans
// changer une ligne de sa logique : la page Compte Vinted a desormais son
// propre bouton "Synchroniser maintenant", et dupliquer ces regles aurait
// garanti qu'elles divergent (l'une annoncant un succes la ou l'autre
// annonce une synchro partielle).
//
// Regle centrale a ne jamais assouplir : un succes n'est JAMAIS infere.
// `complete: false` reste une synchro partielle, meme si des annonces ont ete
// ecrites -- on annonce alors ce qui a reellement ete lu, et le fait que rien
// n'a ete supprime par prudence.
export function describeSyncResult(result: SyncVintedAccountResult): {
  tone: 'success' | 'warning' | 'error';
  message: string;
} {
  if (!result.ok) {
    switch (result.reason) {
      case 'not_paired':
        return { tone: 'error', message: "Extension non appairée à ce compte ResellOS. Reconnecte-la dans Compte Vinted." };
      case 'tab_open_failed':
        return { tone: 'error', message: `Impossible d'ouvrir Vinted${result.error ? ` : ${result.error}` : '.'}` };
      case 'timeout':
        return { tone: 'error', message: 'Échec — aucune réponse de Vinted dans le délai imparti (session expirée ou profil injoignable).' };
      default:
        return { tone: 'error', message: result.error ? `Échec de la synchronisation : ${result.error}` : 'Échec de la synchronisation.' };
    }
  }
  const total = result.created + result.updated;
  if (!result.complete) {
    return {
      tone: 'warning',
      message: `Synchronisation partielle — ${result.pagesRead}/${result.pagesExpected} pages lues (${total} annonce(s) traitée(s), rien supprimé par prudence).`,
    };
  }
  const parts = [`${total} annonce(s) synchronisée(s)`];
  if (result.deletedMarked > 0) parts.push(`${result.deletedMarked} retirée(s)`);
  return { tone: 'success', message: parts.join(' · ') };
}
