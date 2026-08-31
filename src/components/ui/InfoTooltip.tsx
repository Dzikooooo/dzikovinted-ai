import { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
  className?: string;
}

// Picto d'info generique (demande produit 2026-08-31) : premier composant de
// ce type dans le repo (aucun Tooltip/Popover existant avant lui, verifie
// par grep). Volontairement minimal -- un seul comportement (survol/focus ->
// encadre stable), pas de placement configurable ni de contenu riche tant
// qu'aucun appelant n'en a besoin (pas de sur-ingenierie pour un usage
// hypothetique). `open` reste vrai tant que la souris reste sur l'icone OU
// sur l'encadre lui-meme (onMouseEnter sur les deux), pour ne jamais fermer
// l'infobulle si le curseur glisse dessus (ex. pour en selectionner le
// texte) -- exactement le "reste affiche tant que le curseur ne bouge pas"
// demande. Clavier : focus/blur reproduisent le meme etat, aria-describedby
// relie l'icone a l'encadre pour les lecteurs d'ecran.
export function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      {/* Un <span> focusable, pas un <button> : ce picto ne "declenche" rien
          (aucun onClick, juste une info au survol/focus) et doit rester
          imbricable sans invalider le HTML -- OneScoreBar (qui porte ce
          picto) est lui-meme deja utilise A L'INTERIEUR d'un <button> dans
          OpportunityCard.tsx (la carte entiere est cliquable). Un <button>
          ici cassait cette imbrication (validateDOMNesting, test
          OpportunityCard "n'imbrique aucune commande dans une autre") --
          jamais un cas theorique, un vrai regressif attrape par ce test. */}
      <span
        tabIndex={0}
        aria-label="Plus d'informations"
        aria-describedby={open ? 'info-tooltip-panel' : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-500 rounded-full cursor-help"
      >
        <Info className="w-3.5 h-3.5" />
      </span>
      {open && (
        <span
          id="info-tooltip-panel"
          role="tooltip"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[16rem] rounded-xl border border-gray-200 bg-surface px-3 py-2 text-xs leading-relaxed text-gray-700 shadow-[0_10px_30px_-8px_rgba(17,24,39,0.25)]"
        >
          {text}
        </span>
      )}
    </span>
  );
}
