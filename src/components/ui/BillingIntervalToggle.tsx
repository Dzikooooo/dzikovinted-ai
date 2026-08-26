import type { BillingInterval } from '../../lib/billingInterval';

interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
}

// Commutateur mensuel/annuel partage entre la grille publique (landing
// Pricing) et la page Abonnement -- un seul controle pour eviter que les
// deux grilles divergent, comme cela s'etait deja produit avant le Lot 5.
//
// Un TOGGLE et non une troisieme carte : le lecteur compare des plans, pas
// des modes de paiement. Une carte "Pro annuel" a cote de "Pro" et "Team"
// casse la lecture en colonnes, et annulerait le gain du retrait de la carte
// Free.
//
// `radiogroup` plutot que deux boutons independants : il s'agit d'un choix
// unique entre deux options mutuellement exclusives, et c'est ce que le
// lecteur d'ecran doit annoncer.
export function BillingIntervalToggle({ value, onChange, className = '' }: BillingIntervalToggleProps) {
  const options: { interval: BillingInterval; label: string }[] = [
    { interval: 'month', label: 'Mensuel' },
    { interval: 'year', label: 'Annuel' },
  ];

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div role="radiogroup" aria-label="Périodicité de facturation" className="inline-flex bg-gray-100 rounded-xl p-1">
        {options.map((option) => {
          const active = value === option.interval;
          return (
            <button
              key={option.interval}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.interval)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50 ${
                active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Le badge reste visible dans les DEUX etats : c'est l'argument qui
          justifie de basculer, le cacher en mensuel reviendrait a ne le
          montrer qu'a ceux qui ont deja choisi. */}
      {/* green-800 et non green-700 : sur son propre fond a 10 %, le
          green-700 tombe a 4.38:1 -- sous le seuil AA de 4.5:1 pour ce texte
          de 12px gras (les 3:1 du "grand texte" commencent a 18.66px gras).
          green-800 y mesure 6.23:1. */}
      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-700/10 text-green-800">
        2 mois offerts
      </span>
    </div>
  );
}
