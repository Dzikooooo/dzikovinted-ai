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
    a: "Oui, une extension navigateur gratuite qui se connecte à ton compte Vinted pour synchroniser tes annonces et, quand tu le décides, modifier une annonce à ta place. La publication automatique est temporairement désactivée le temps d'un correctif, elle revient bientôt.",
  },
  {
    q: 'Resell OS publie-t-il des annonces automatiquement, sans mon accord ?',
    a: "Jamais. Chaque publication ou modification sur Vinted est une action que tu déclenches et confirmes toi-même. Resell OS ne pilote pas ton compte Vinted en arrière-plan.",
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
          <h2 className="text-4xl sm:text-5xl font-black mb-4">Questions fréquentes</h2>
          <p className="text-gray-400 text-lg">Tout ce qu'il faut savoir avant de commencer.</p>
        </div>
        <div className="space-y-3">
          {FAQS.map(({ q, a }, i) => (
            <div key={q} className="bg-surface border border-white/5 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
              >
                <span className="font-semibold text-base">{q}</span>
                <ChevronDown className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <p className="px-6 pb-5 text-gray-400 text-sm leading-relaxed">{a}</p>
              )}
            </div>
          ))}
        </div>

        {/* Pas de blanc apres la derniere question -- un vrai CTA plutot
            qu'un espace vide (audit personnel utilisateur, 2026-08-04). */}
        <button
          onClick={() => setContactOpen(true)}
          className="flex items-center justify-center gap-3 w-full mt-6 bg-surface border border-white/5 hover:border-neon-500/30 rounded-xl px-5 py-4 transition-all"
        >
          <Mail className="w-4 h-4 text-neon-500 flex-shrink-0" />
          <p className="text-sm text-gray-400">
            Ta question n'est pas dans la liste ?{' '}
            <span className="text-neon-500 font-medium">Pose-la-nous</span>
          </p>
        </button>
      </div>

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </section>
  );
}
