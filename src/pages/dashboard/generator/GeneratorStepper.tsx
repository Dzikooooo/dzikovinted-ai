import { Check } from 'lucide-react';

// Fil d'Ariane du Generateur (2026-08-26).
//
// Remplace les 3 cartes statiques "01 Upload / 02 Analyse IA / 03 Annonce
// prete" qui s'affichaient en PERMANENCE en haut de la page d'upload. Elles
// decrivaient un parcours au lieu de dire ou on en est -- utiles une fois, du
// bruit ensuite, et elles poussaient la vraie zone d'upload sous la ligne de
// flottaison.
//
// Ce composant fait l'inverse : il n'apparait QUE pendant un flux d'analyse en
// cours (voir GeneratorPage, il n'est pas rendu a l'etape 'upload'), et il
// indique l'etape reellement atteinte plutot qu'un mode d'emploi.

export type GeneratorPhase = 'photos' | 'analysis' | 'listing';

const STEPS: { key: GeneratorPhase; label: string }[] = [
  { key: 'photos', label: 'Photos' },
  { key: 'analysis', label: 'Analyse IA' },
  { key: 'listing', label: 'Annonce prête' },
];

// Aucune marge par defaut : les etapes n'ont pas toutes le meme conteneur
// (LoadingStep n'en a aucun, ResultStep est en max-w-4xl, EditStep en
// max-w-3xl). L'espacement est donc decide au point d'appel, sinon il
// s'ajoute au padding propre de l'etape et double l'ecart.
export function GeneratorStepper({ current, className = '' }: { current: GeneratorPhase; className?: string }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className={`flex items-center gap-2 sm:gap-3 ${className}`} aria-label="Progression de la génération">
      {STEPS.map(({ key, label }, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={key} className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span
              // aria-current : l'etape en cours ne doit pas etre signalee par
              // la seule couleur (voir CLAUDE.md, tokens & accessibilite).
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 text-xs font-semibold whitespace-nowrap ${
                active ? 'text-neon-500' : done ? 'text-gray-700' : 'text-gray-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                  done
                    ? 'bg-neon-500 text-white'
                    : active
                      ? 'bg-neon-500/15 text-neon-500 ring-2 ring-neon-500/30'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                {done ? <Check className="w-3 h-3" aria-hidden="true" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </span>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`h-px w-6 sm:w-10 flex-shrink-0 ${done ? 'bg-neon-500/40' : 'bg-gray-200'}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
