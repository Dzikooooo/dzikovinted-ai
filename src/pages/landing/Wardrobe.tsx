import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Hanger, Garment } from './WardrobeIllustration';

// Round M v4 -- LE MEUBLE (retour utilisateur : "ya pas de placard, ya pas
// d'etagere, ya pas de tiroir, ya rien de la vision"). Les versions
// precedentes decoraient UNE section ; ici le dressing est le CONTENANT
// de plusieurs sections de la landing (comparatif, fonctionnalites, FAQ,
// tarifs), chacune dans son propre compartiment separe par une vraie
// planche d'etagere.
//
// Scroll NATIF : les portes s'ouvrent une seule fois quand le meuble
// entre dans le viewport (IntersectionObserver), jamais une animation
// pilotee/scrubbee par la position du scroll -- regle tenue depuis le
// debut du chantier.
//
// Accessibilite : portes et vetements accroches sont purement decoratifs
// (aria-hidden + pointer-events:none). Le contenu reel des compartiments
// est dans le flux normal des le premier rendu -- jamais masque derriere
// une animation, jamais inaccessible au clavier ou a un lecteur d'ecran.

// Vetements accroches sur la face interieure des portes ouvertes.
function DoorGarments({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute top-16 flex flex-col gap-8 ${side === 'left' ? 'left-6' : 'right-6'}`}
    >
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col items-center opacity-90">
          <Hanger className="w-10 h-5 text-gray-500" />
          <Garment className="w-11 h-11 -mt-1" gradientId={`door-${side}-${i}`} />
        </div>
      ))}
    </div>
  );
}

export function Wardrobe({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOpen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="wardrobe-stage max-w-5xl mx-auto px-4 sm:px-6 my-16 sm:my-24">
      <div ref={ref} className={`wardrobe-frame ${open ? 'wardrobe-open' : ''}`}>
        {children}

        <div className="wardrobe-door wardrobe-door-left" aria-hidden="true">
          <DoorGarments side="left" />
        </div>
        <div className="wardrobe-door wardrobe-door-right" aria-hidden="true">
          <DoorGarments side="right" />
        </div>
      </div>
    </div>
  );
}

// Un compartiment. `label` est la petite plaque du compartiment (comme une
// etiquette de rangement), `board` ajoute la planche d'etagere en bas.
export function WardrobeShelf({
  label,
  children,
  board = true,
}: {
  label?: string;
  children: ReactNode;
  board?: boolean;
}) {
  return (
    <>
      <div className="relative px-2 sm:px-6 py-10 sm:py-14">
        {label && (
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-6 text-center">
            {label}
          </p>
        )}
        {children}
      </div>
      {board && <div className="wardrobe-shelf-board" aria-hidden="true" />}
    </>
  );
}

// Le tiroir : une facade avec sa poignee, et le contenu qui "sort" du
// meuble quand le tiroir entre dans le viewport.
export function WardrobeDrawer({ label, children }: { label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOpen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="wardrobe-drawer-front" aria-hidden="true">
        <div className="wardrobe-drawer-handle" />
      </div>

      <div ref={ref} className="relative px-2 sm:px-6 py-10 sm:py-14">
        {label && (
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-6 text-center">
            {label}
          </p>
        )}
        <div className={open ? 'wardrobe-drawer-open' : ''}>{children}</div>
      </div>

      <div className="wardrobe-shelf-board" aria-hidden="true" />
    </>
  );
}
