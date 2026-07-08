import { Puzzle, MessageSquare, Tag, Eye, RotateCw, Bell } from 'lucide-react';

const UPCOMING = [
  { icon: MessageSquare, label: 'Messages et reponses rapides' },
  { icon: Tag, label: 'Offres et contre-offres recues' },
  { icon: RotateCw, label: 'Republication automatique des annonces' },
  { icon: Eye, label: 'Vues, favoris et visibilite en temps reel' },
  { icon: Bell, label: 'Alertes ventes, offres et annonces expirees' },
];

export default function VintedAccountPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Compte Vinted</h1>
        <p className="text-gray-400 text-sm">
          Pilote ton compte Vinted directement depuis ResellOS.
        </p>
      </div>

      <div className="bg-surface border border-white/5 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Puzzle className="w-5 h-5 text-gray-500" />
        </div>
        <h2 className="font-bold text-sm mb-1">Extension Chrome non connectee</h2>
        <p className="text-xs text-gray-500 max-w-sm mx-auto">
          Une fois installee, l'extension synchronise ton compte Vinted avec ResellOS. Plus besoin d'ouvrir Vinted au quotidien.
        </p>
      </div>

      <div className="mt-6">
        <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">
          Disponible avec la synchronisation
        </h2>
        <div className="space-y-2">
          {UPCOMING.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 bg-surface border border-white/5 rounded-xl px-4 py-3"
            >
              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <p className="text-sm text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
