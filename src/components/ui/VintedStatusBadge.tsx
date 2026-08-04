import { Badge, type BadgeTone } from './Badge';

// 'online' n'affiche pas de badge (etat par defaut, pas besoin d'insister
// visuellement) - les autres statuts sont mis en evidence pour que l'ecart
// avec Vinted saute aux yeux immediatement. Voir EXTENSION.md pour la
// taxonomie complete et son origine (booleens de l'API wardrobe Vinted).
const STATUS_STYLES: Record<string, { label: string; tone: BadgeTone }> = {
  reserved: { label: 'Réservé', tone: 'attention' },
  sold_pending: { label: 'Vente en cours', tone: 'warning' },
  sold_completed: { label: 'Vendu', tone: 'positive' },
  draft: { label: 'Brouillon', tone: 'neutral' },
  hidden: { label: 'Masqué', tone: 'neutral' },
  deleted: { label: 'Supprimé', tone: 'negative' },
  unknown: { label: 'Statut à vérifier', tone: 'negative' },
};

export default function VintedStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status];
  if (!style) return null;
  return <Badge label={style.label} tone={style.tone} />;
}
