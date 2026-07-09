// 'online' n'affiche pas de badge (etat par defaut, pas besoin d'insister
// visuellement) - les autres statuts sont mis en evidence pour que l'ecart
// avec Vinted saute aux yeux immediatement. Voir EXTENSION.md pour la
// taxonomie complete et son origine (booleens de l'API wardrobe Vinted).
const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  reserved: { label: 'Réservé', bg: 'bg-blue-400/10', text: 'text-blue-400' },
  sold_pending: { label: 'Vente en cours', bg: 'bg-amber-400/10', text: 'text-amber-400' },
  sold_completed: { label: 'Vendu', bg: 'bg-neon-500/10', text: 'text-neon-500' },
  draft: { label: 'Brouillon', bg: 'bg-white/10', text: 'text-gray-400' },
  hidden: { label: 'Masqué', bg: 'bg-white/10', text: 'text-gray-400' },
  deleted: { label: 'Supprimé', bg: 'bg-red-500/10', text: 'text-red-400' },
  unknown: { label: 'Statut à vérifier', bg: 'bg-red-500/10', text: 'text-red-400' },
};

export default function VintedStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status];
  if (!style) return null;
  return (
    <span className={`text-[10px] font-bold ${style.text} ${style.bg} px-1.5 py-0.5 rounded-md flex-shrink-0`}>
      {style.label}
    </span>
  );
}
