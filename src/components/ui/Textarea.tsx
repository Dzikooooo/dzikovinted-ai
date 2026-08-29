import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { FIELD_BASE_CLASS, FIELD_LABEL_CLASS } from './Input';

// Meme decision visuelle qu'Input.tsx (voir son en-tete pour la justification
// par grep) -- jamais un textarea ni un input observes cote a cote avec une
// icone dans le code existant, donc pas de prop `icon` ici contrairement a
// Input : ajouter cette option sans preuve d'usage reel irait a l'encontre
// de la discipline deja tenue sur Card.tsx (jamais une variante inventee).
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, id, className = '', ...rest },
  ref
) {
  const field = <textarea ref={ref} id={id} className={`${FIELD_BASE_CLASS} px-4 resize-none ${className}`} {...rest} />;

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
