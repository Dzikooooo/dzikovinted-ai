import { useState } from 'react';
import { ChevronDown, Mail } from 'lucide-react';
import { ContactModal } from '../../components/ui/ContactModal';

const FAQS = [
  {
    q: 'Resell OS fonctionne-t-il avec d\'autres marketplaces que Vinted ?',
    a: "Non, et c'est volontaire. Resell OS est conçu spécifiquement pour Vinted — ses règles, ses catégories, ses prix — plutôt que de proposer une couche générique qui fonctionne partout à moitié.",
  },
  {
    q: "Ai-je besoin d'installer quelque chose en plus du site ?",
    // "elle revient bientôt" retire le 2026-08-29 : promettait un retour de
    // l'automatisation totale, l'exact inverse du positionnement "bouclier
    // anti-bannissement" acte ce round (voir la nouvelle question
    // dediee ci-dessous). Cette reponse reste centree sur SA vraie
    // question (faut-il installer quelque chose), sans redire tout le
    // raisonnement -- deja porte par la question suivante.
    a: "Oui, une extension navigateur gratuite qui se connecte à ton compte Vinted pour synchroniser tes annonces et, quand tu le décides, modifier une annonce à ta place. C'est toujours toi qui cliques sur Vinted, jamais l'extension à ta place.",
  },
  {
    q: 'Resell OS publie-t-il des annonces automatiquement, sans mon accord ?',
    a: "Jamais. Chaque publication ou modification sur Vinted est une action que tu déclenches et confirmes toi-même. Resell OS ne pilote pas ton compte Vinted en arrière-plan.",
  },
  {
    // Nouvelle question (2026-08-29, positionnement "bouclier
    // anti-bannissement") : assume explicitement le choix plutot que de le
    // laisser deviner par la question precedente. Placee juste apres elle --
    // les deux traitent de confiance/automatisation, meme regroupement
    // thematique que le reste de la FAQ.
    q: "Pourquoi Resell OS ne fait pas d'automatisation totale ?",
    a: "C'est un choix assumé, pas une limite technique qu'on cache. Comme toute marketplace, Vinted surveille les comptes qui publient ou republient à un rythme robotique, et peut les suspendre. ResellOS prépare tout à ta place — titre, description, prix, photos — mais te laisse toujours cliquer toi-même sur le bouton final. Plus lent qu'une automatisation totale, et c'est voulu : ton compte reste sous ton contrôle, jamais celui d'un robot.",
  },
  {
    q: "Que se passe-t-il si j'atteins la limite du plan Free ?",
    a: "Tu peux repasser au mode manuel ou passer au plan Pro pour des analyses illimitées. Aucune carte bancaire n'est demandée pour commencer sur le plan Free.",
  },
  {
    q: 'Puis-je annuler mon abonnement à tout moment ?',
    a: 'Oui, sans engagement ni frais cachés, directement depuis la page Abonnement de ton compte.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl sm:text-5xl font-black mb-4 text-gray-900">Questions fréquentes</h2>
          <p className="text-gray-600 text-lg">Tout ce qu'il faut savoir avant de commencer.</p>
        </div>
        {/* Motion (2026-08-25) : le contenu etait monte/demonte par un simple
            `{open === i && ...}` -- apparition et disparition INSTANTANEES,
            d'ou la sensation seche au clic. Le systeme .faq-panel (index.css)
            anime une hauteur "auto" via grid-template-rows 0fr/1fr, sans
            mesurer scrollHeight en JS et sans saut au premier rendu. Le
            contenu reste TOUJOURS monte : l'accessibilite ne depend plus de
            l'etat d'animation, et aria-expanded/aria-controls decrivent
            l'etat reel. */}
        <div className="space-y-3">
          {FAQS.map(({ q, a }, i) => {
            const isOpen = open === i;
            const panelId = `faq-panel-${i}`;
            const buttonId = `faq-button-${i}`;
            return (
              <div key={q} className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden">
                <button
                  id={buttonId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-semibold text-base text-gray-900">{q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    style={{ transitionDuration: 'var(--motion-ui)', transitionTimingFunction: 'var(--ease-out)' }}
                  />
                </button>
                <div id={panelId} aria-labelledby={buttonId} className={`faq-panel ${isOpen ? 'faq-panel-open' : ''}`}>
                  <div>
                    <p className="faq-panel-content px-6 pb-5 text-gray-600 text-sm leading-relaxed">{a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pas de blanc apres la derniere question -- un vrai CTA plutot
            qu'un espace vide (audit personnel utilisateur, 2026-08-04). */}
        <button
          onClick={() => setContactOpen(true)}
          className="flex items-center justify-center gap-3 w-full mt-6 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-5 py-4 transition-all"
        >
          <Mail className="w-4 h-4 flex-shrink-0 text-neon-500" />
          <p className="text-sm text-gray-600">
            Ta question n'est pas dans la liste ?{' '}
            <span className="font-medium text-neon-500">Pose-la-nous</span>
          </p>
        </button>
      </div>

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </section>
  );
}
