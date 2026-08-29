import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

// Composant fondation (Phase 1 "Design irreprochable", meme discipline que
// Card.tsx : isole, aucune page migree dans ce lot). Justifie par grep avant
// d'ecrire ce fichier -- pas une supposition : 22 occurrences de la MEME
// classe tapee a la main (border-gray-200 rounded-xl ... focus:ring-neon-500/20)
// sur 17 fichiers du dashboard, et aucun composant Input/TextField n'existe
// dans src/components/ui/ malgre cette repetition massive.
//
// Champ label au-dessus deja lui aussi copie identique partout
// (text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2)
// -- integre ici en prop optionnelle plutot que laisse a la charge de chaque
// appelant.
export const FIELD_LABEL_CLASS = 'text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2';

// Base commune reutilisee par Input ET Textarea (meme decision visuelle,
// deux elements HTML differents) -- une seule source pour ne jamais laisser
// les deux dériver l'une de l'autre.
export const FIELD_BASE_CLASS =
  'w-full bg-dark-400 border border-gray-200 rounded-xl py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all disabled:text-gray-500 disabled:cursor-not-allowed';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  // Icone de gauche (ex. User, Mail, Lock, Key deja utilisees telles quelles
  // dans SettingsPage) -- decale automatiquement le padding gauche, jamais a
  // calculer par l'appelant.
  icon?: ReactNode;
  // Element interactif a droite (ex. le bouton oeil/oeil-barre du mot de
  // passe) -- decale automatiquement le padding droit. Reste un ReactNode
  // libre : Input ne connait pas la logique du bouton, seulement sa place.
  trailingElement?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, icon, trailingElement, id, className = '', ...rest },
  ref
) {
  const field = (
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none">{icon}</span>}
      <input
        ref={ref}
        id={id}
        className={`${FIELD_BASE_CLASS} ${icon ? 'pl-10' : 'pl-4'} ${trailingElement ? 'pr-10' : 'pr-4'} ${className}`}
        {...rest}
      />
      {trailingElement && <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailingElement}</span>}
    </div>
  );

  if (!label) return field;

  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      {field}
    </div>
  );
});
