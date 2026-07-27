import { useAuth } from '../contexts/AuthContext';

// Commodite d'affichage uniquement -- ne JAMAIS traiter comme une garde
// de securite. La seule frontiere reelle est la policy RLS is_admin()
// (supabase/migrations/20260727100000_add_community_content.sql) : une
// ecriture admin echoue cote serveur quel que soit ce que ce hook
// retourne cote client. Ce hook sert seulement a ne pas afficher un
// controle ("Publier", "Repondre"...) qui echouerait de toute facon,
// et a centraliser le pattern `profile?.role === 'admin'` duplique
// jusqu'ici a 3 endroits (StockPage.tsx, DashboardHome.tsx,
// GeneratorPage.tsx -- retrofit prevu en Lot 7 de la Communaute, pas
// dans ce commit pour garder le diff petit).
export function useIsAdmin(): boolean {
  const { profile } = useAuth();
  return profile?.role === 'admin';
}
