import type { ReactNode } from 'react';

// Cadre navigateur/macOS partage entre Hero (video demo) et Features
// (captures reelles + mockups des modules sans capture) -- meme chrome
// partout pour que chaque module ait exactement la meme taille/ombre/angle
// (retour design 2026-08-29), qu'il montre une vraie capture ou un mockup
// stylise. Pas de barre de favoris : seuls les 3 points de controle, pour
// rester sobre.
//
// group-hover (pas hover local) : le survol est porte par un ancetre
// className="group" (BentoCard, ou le wrapper video du Hero) -- survoler
// N'IMPORTE OU sur la carte (texte compris) zoome et eclaircit LE cadre,
// pas seulement les pixels de l'image (retour bento 2026-08-29 : "au survol
// d'une carte", pas seulement du cadre). Zoom leger + bordure mise en
// valeur seulement -- pas de flou de fond ni de rotation 3D ni de glow
// decoratif (playbook, anti-patterns #1 et #10 : motif decoratif duplique +
// animation sans lien avec un vrai changement d'etat).
export function BrowserFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-white/10 shadow-2xl overflow-hidden bg-gray-950 transition-transform duration-500 ease-out group-hover:scale-[1.02] group-hover:border-white/20 ${className}`}
    >
      <div className="flex items-center gap-1.5 px-4 py-3 flex-shrink-0">
        <span className="w-3 h-3 rounded-full bg-red-500/70" aria-hidden="true" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/70" aria-hidden="true" />
        <span className="w-3 h-3 rounded-full bg-green-500/70" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}
