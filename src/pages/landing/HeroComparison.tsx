import { X, Check } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';
import { DiscordIcon } from '../../components/ui/DiscordIcon';

const VINTED_BLUE = '#007782';

// Round M -- bloc Avant/Avec ResellOS sous le Hero (retour utilisateur
// 2026-08-23). "Message automatique aux favoris" reste marque "(bientot)",
// coherent avec Features.tsx (module Communication) -- jamais presenter
// une fonctionnalite non construite comme deja disponible.
//
// Pas de logo Vinted (asset qu'on n'a pas, risque de marque deja signale
// plusieurs fois ce chantier) -- le mot "Vinted" en bleu #007782 fait le
// meme travail sans reproduire leur marque. Logo ResellOS et icone
// Discord : les deux nous appartiennent/sont deja utilises ailleurs dans
// le produit, aucun risque equivalent.
const PAIN_POINTS = [
  'Republier ses annonces à la main',
  'Répondre à tous les messages un par un',
  "Calculer son budget sans visibilité sur le bénéfice, le chiffre d'affaires et l'investissement",
  "Gérer l'URSSAF sans outil dédié",
];

const BENEFITS = [
  'Republication programmée ou automatique, au choix',
  'Message automatique aux favoris (bientôt)',
  'SKU généré automatiquement',
  "Vraie vue sur ta comptabilité : dépenses, bénéfice, chiffre d'affaires",
  "Cotisation URSSAF et prix du matériel (emballage, imprimante...) suivis",
  'Communauté Discord',
];

export function HeroComparison() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-left items-start">
      {/* Les deux cartes ne portent DELIBEREMENT pas le meme poids visuel :
          "Avant" reste plate (aucune ombre, fond gris, bordure discrete),
          "Apres" est surelevee. Leur donner la meme ombre serait exactement
          l'uniformite sans hierarchie que le playbook interdit -- ici la
          hierarchie EST le message de la section. */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7 sm:p-10">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Avant</span>
          <span className="text-sm font-semibold" style={{ color: VINTED_BLUE }}>Vinted</span>
        </div>
        <ul className="space-y-4">
          {PAIN_POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-gray-600">
              <X className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="rounded-2xl border bg-white p-7 sm:p-10 shadow-xl shadow-gray-900/[0.06]"
        style={{ borderColor: `${VINTED_BLUE}40` }}
      >
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Après</span>
          <span className="text-sm font-semibold" style={{ color: VINTED_BLUE }}>Vinted</span>
          <span className="text-gray-300">+</span>
          <Logo variant="transparent" size={18} />
          <span className="text-sm font-semibold text-gray-900">ResellOS</span>
          <span className="text-gray-300">+</span>
          <DiscordIcon className="w-4 h-4 text-gray-400" />
        </div>
        <ul className="space-y-4">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-gray-700">
              <Check className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: VINTED_BLUE }} />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
