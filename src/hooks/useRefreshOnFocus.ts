import { useEffect, useRef } from 'react';

// P1-2 (Freeze Audit correctif) : cause racine commune du badge extension
// perime sur DashboardHome (via VintedAccountFilterContext) et Compte Vinted
// (via son propre getExtensionStatus()) -- les deux ne rafraichissaient leur
// etat qu'au montage initial, jamais quand l'utilisateur revient sur l'onglet
// apres avoir connecte/deconnecte/modifie l'extension ailleurs. Un seul hook
// reutilise aux deux endroits plutot que deux effets dupliques : ecoute
// uniquement `focus` (fenetre reprend le premier plan) et `visibilitychange`
// (onglet redevient visible, utile en multi-onglets) -- aucun polling,
// aucune boucle, juste un rappel event-driven sur les memes fonctions de
// chargement deja existantes.
export function useRefreshOnFocus(callback: () => void): void {
  // Ref plutot que callback directement en dependance : evite de detacher et
  // rattacher les listeners a chaque rendu (callback est souvent recree),
  // tout en appelant toujours la version la plus a jour.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handleFocus = () => callbackRef.current();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
