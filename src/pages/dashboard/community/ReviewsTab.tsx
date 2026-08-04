import { Star } from 'lucide-react';

// Placeholder honnete (decision utilisateur du 2026-07-29 : "Placeholders
// honnetes maintenant" plutot qu'un systeme d'avis complet non prevu dans
// ce chantier) -- aucun avis invente, annonce clairement que la
// fonctionnalite arrive.
export function ReviewsTab() {
  return (
    <div className="bg-surface border border-white/5 rounded-2xl p-8 text-center max-w-lg mx-auto">
      <div className="w-14 h-14 bg-yellow-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Star className="w-6 h-6 text-yellow-400" />
      </div>
      <h3 className="font-bold text-lg mb-2">Avis</h3>
      <p className="text-sm text-gray-500">
        Bientôt disponible — les revendeurs de la communauté pourront partager leur expérience avec Resell OS ici.
      </p>
    </div>
  );
}
