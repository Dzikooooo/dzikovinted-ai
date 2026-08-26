import type { LucideIcon } from 'lucide-react';

// 'brand' (defaut) = accent de marque -- reserve aux KPI vedette non
// financiers (ex. "Recherches actives", "Valeur du catalogue"). 'positive'
// = vert, benefice/revenu/ROI/marge. 'attention' = jaune, reserve aux
// nouveautes/notifications/badges/opportunites (regle explicite
// 2026-07-28 : "le violet doit rester la couleur signature ET d'action du
// site -- ne pas utiliser vert/rouge/jaune comme couleurs principales,
// uniquement comme indicateurs d'etat").
export type StatCardTone = 'brand' | 'positive' | 'attention' | 'negative' | 'neutral';

// CONTRASTES MESURES sur fond blanc (migration theme clair) -- les valeurs
// de `text` sont du TEXTE, elles doivent passer 4.5:1. Les teintes d'origine
// venaient du theme sombre et echouaient toutes : green-400 1.74:1,
// yellow-400 1.53:1. Remplacees par green-700 (5.02:1) et amber-700 (5.02:1).
// Les fonds d'icone (`iconBg`, en /10) restent en teinte claire : ce sont des
// aplats decoratifs, aucun texte ne repose dessus.
const TONE_STYLES: Record<StatCardTone, { text: string; iconBg: string; iconText: string; borderLg: string; shadowLg: string; borderSm: string; shadowSm: string }> = {
  brand: {
    text: 'text-neon-500',
    iconBg: 'bg-neon-500/10',
    iconText: 'text-neon-500',
    borderLg: 'border-neon-500/30',
    shadowLg: 'shadow-[0_0_25px_rgba(124,92,255,0.1)]',
    borderSm: 'border-neon-500/20',
    shadowSm: 'shadow-[0_0_20px_rgba(124,92,255,0.08)]',
  },
  positive: {
    text: 'text-green-700',
    iconBg: 'bg-green-500/10',
    iconText: 'text-green-700',
    borderLg: 'border-green-500/30',
    shadowLg: 'shadow-[0_0_25px_rgba(34,197,94,0.1)]',
    borderSm: 'border-green-500/20',
    shadowSm: 'shadow-[0_0_20px_rgba(34,197,94,0.08)]',
  },
  attention: {
    text: 'text-amber-700',
    iconBg: 'bg-yellow-400/10',
    iconText: 'text-amber-700',
    borderLg: 'border-yellow-400/30',
    shadowLg: 'shadow-[0_0_25px_rgba(250,204,21,0.1)]',
    borderSm: 'border-yellow-400/20',
    shadowSm: 'shadow-[0_0_20px_rgba(250,204,21,0.08)]',
  },
  neutral: {
    text: 'text-gray-900',
    iconBg: 'bg-gray-100',
    iconText: 'text-gray-700',
    borderLg: 'border-gray-200',
    shadowLg: '',
    borderSm: 'border-gray-200',
    shadowSm: '',
  },
  negative: {
    text: 'text-red-700',
    iconBg: 'bg-red-500/10',
    iconText: 'text-red-700',
    borderLg: 'border-red-500/30',
    shadowLg: 'shadow-[0_0_25px_rgba(239,68,68,0.1)]',
    borderSm: 'border-red-500/20',
    shadowSm: 'shadow-[0_0_20px_rgba(239,68,68,0.08)]',
  },
};

interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  tone?: StatCardTone;
  size?: 'sm' | 'lg';
  // Optionnel (Design Freeze, Lot 7) : StatsPage affichait ses 5 KPI en
  // JSX duplique avec icone, seul usage du composant qui en avait besoin --
  // ajoute ici plutot que de forcer StatsPage a s'en passer.
  icon?: LucideIcon;
}

export function StatCard({ label, value, highlight, tone = 'brand', size = 'sm', icon: Icon }: StatCardProps) {
  const t = TONE_STYLES[tone];

  if (size === 'lg') {
    return (
      <div
        className={`bg-surface-alt border rounded-2xl p-5 transition-all hover:border-gray-200 hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${highlight ? `${t.borderLg} ${t.shadowLg}` : 'border-gray-200'}`}
      >
        {Icon && (
          <div className={`w-9 h-9 ${t.iconBg} rounded-xl flex items-center justify-center mb-3`}>
            <Icon className={`w-4 h-4 ${t.iconText}`} />
          </div>
        )}
        <p className="text-xs font-medium text-gray-600">{label}</p>
        {/* highlight n'existait pas encore pour ce format lg -- toute valeur y
            etait dorée inconditionnellement (bug reel trouve pendant la passe
            de coherence : "Opportunités", un simple compteur, rendait aussi
            gold que "Profit moyen"). Desormais le meme comportement
            conditionnel que le format sm ci-dessous. */}
        <h3 className={`${highlight ? t.text : 'text-gray-900'} text-3xl font-black mt-2`}>{value}</h3>
      </div>
    );
  }

  return (
    <div
      className={`bg-surface border rounded-2xl p-4 transition-all hover:border-gray-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] ${highlight ? `${t.borderSm} ${t.shadowSm}` : 'border-gray-200'}`}
    >
      {Icon && (
        <div className={`w-9 h-9 ${t.iconBg} rounded-xl flex items-center justify-center mb-3`}>
          <Icon className={`w-4 h-4 ${t.iconText}`} />
        </div>
      )}
      <p className="text-xs font-medium text-gray-600 mb-2">{label}</p>
      <p className={`text-xl font-black ${highlight ? t.text : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
