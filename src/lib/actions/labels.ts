import {
  UploadCloud,
  Pencil,
  Tag,
  Image,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  MessageCircle,
  CheckCircle2,
  Repeat,
  type LucideIcon,
} from 'lucide-react';
import type { ActionKind, ActionStep } from './types';

// Point d'enregistrement unique pour l'affichage de chaque type d'action
// dans le Centre des Actions. Toute nouvelle ActionKind (Phase 3.2+) n'a
// besoin que d'une entree ici pour apparaitre correctement — jamais de
// changement necessaire dans ActionsPage.tsx lui-meme. Un test de garde
// (labels.test.ts) echoue volontairement si une cle manque.
export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  publish_listing: 'Publier sur Vinted',
  edit_listing: "Modifier l'annonce",
  edit_price: 'Modifier le prix',
  edit_photos: 'Modifier les photos',
  republish_listing: 'Republier',
  pause_listing: 'Mettre en pause',
  reactivate_listing: 'Réactiver',
  delete_listing: "Supprimer l'annonce",
  reply_message: 'Répondre à un message',
  accept_offer: 'Accepter une offre',
  counter_offer: 'Contre-offre',
};

export const ACTION_KIND_ICONS: Record<ActionKind, LucideIcon> = {
  publish_listing: UploadCloud,
  edit_listing: Pencil,
  edit_price: Tag,
  edit_photos: Image,
  republish_listing: RefreshCw,
  pause_listing: Pause,
  reactivate_listing: Play,
  delete_listing: Trash2,
  reply_message: MessageCircle,
  accept_offer: CheckCircle2,
  counter_offer: Repeat,
};

// Messages honnêtes et génériques par étape — pas de fausse précision
// inventée (ex. pas de "compte alexisdzk validé" tant que le nom réel du
// compte n'est pas explicitement passé dans le message par l'appelant).
export const ACTION_STEP_LOG_MESSAGES: Record<ActionStep, string> = {
  awaiting_confirmation: "Validation utilisateur confirmée",
  preparing: 'Préparation en cours',
  connecting: 'Connexion à Vinted en cours',
  uploading_photos: 'Import des photos en cours',
  analyzing: 'Analyse en cours',
  filling_form: "Remplissage du formulaire en cours",
  publishing: 'Publication en cours',
  syncing: 'Synchronisation en cours',
};
