import { MessageSquare, Heart, Tag, Clock, Bot, CheckCircle2, ArrowRight, Send } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';

const WORKFLOW = [
  { icon: Heart, label: 'Un favori ou une offre arrive sur Vinted' },
  { icon: Bot, label: 'ResellOS prépare une réponse adaptée' },
  { icon: CheckCircle2, label: 'Tu relis et tu valides en un clic' },
  { icon: Send, label: 'Le message part sur Vinted, avec ton nom' },
];

const UPCOMING = [
  { icon: Heart, title: 'Message automatique aux favoris', desc: 'Préviens automatiquement les utilisateurs qui ont mis un article en favori quand tu baisses son prix.' },
  { icon: Tag, title: 'Réponse aux offres', desc: 'Accepte, refuse ou contre une offre directement depuis Resell OS, sans ouvrir Vinted.' },
  { icon: Clock, title: 'Programmation', desc: 'Planifie l\'envoi de messages à l\'avance plutôt que de les envoyer un par un manuellement.' },
];

// Refonte presentation (audit personnel utilisateur, 2026-08-02) : la
// fonctionnalite n'est toujours pas construite (voir bandeau honnete en bas
// de page, inchange sur le fond), mais la page doit maintenant "vendre" ce
// qui arrive plutot que se limiter a un EmptyState. Workflow + apercu de
// conversation sont des mockups purement visuels (donnees fictives,
// etiquetees comme telles) -- aucun bouton ici n'envoie quoi que ce soit.
export default function CommunicationPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="0 message envoyé aujourd'hui"
        description="Chaque réponse à un favori ou une offre Vinted, préparée pour toi — jamais envoyée sans ton accord."
      />

      <div className="bg-surface border border-white/5 rounded-2xl p-6 mb-6">
        <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-5">Comment ça fonctionnera</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4">
          {WORKFLOW.map(({ icon: Icon, label }, i) => (
            <div key={label} className="relative flex flex-col items-center text-center gap-3">
              <div className="w-11 h-11 bg-yellow-400/10 rounded-2xl flex items-center justify-center">
                <Icon className="w-5 h-5 text-yellow-400" />
              </div>
              <p className="text-xs text-gray-400 leading-snug">{label}</p>
              {i < WORKFLOW.length - 1 && (
                <ArrowRight className="hidden sm:block absolute top-4 -right-3 w-4 h-4 text-gray-700" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface border border-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-4">Aperçu — exemple fictif</p>
          <div className="space-y-3">
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-dark-400 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-2.5">
                <p className="text-sm text-gray-200">Bonjour, le pull est-il toujours disponible ?</p>
                <p className="text-[10px] text-gray-600 mt-1">Acheteur · 14:02</p>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-yellow-400/10 border border-yellow-400/20 rounded-2xl rounded-tr-sm px-4 py-2.5">
                <p className="text-sm text-gray-200">Oui, toujours dispo ! Je te fais -10% si tu prends aussi le jean 👖</p>
                <p className="text-[10px] text-yellow-400/70 mt-1">Suggestion ResellOS — à valider</p>
              </div>
            </div>
          </div>
          <button
            disabled
            className="w-full mt-4 flex items-center justify-center gap-2 bg-white/5 text-gray-500 text-xs font-semibold px-4 py-2.5 rounded-xl cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" /> Valider et envoyer
          </button>
        </div>

        <div className="bg-surface border border-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-4">Ce que ça changera</p>
          <div className="space-y-4">
            {UPCOMING.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-400/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-200">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-white/[0.03] border border-white/5 rounded-2xl px-5 py-4">
        <MessageSquare className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-gray-300 font-medium">Pas encore construit.</span> Comme pour la publication
          d'annonces, chaque message restera une action que tu déclenches et confirmes toi-même — jamais un envoi
          automatique silencieux sur ton compte Vinted.
        </p>
      </div>
    </div>
  );
}
