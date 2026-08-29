import { Modal } from '../ui/Modal';
import { TicketThread } from './TicketThread';
import type { SupportTicket, TicketStatus } from '../../lib/types';

interface TicketDetailModalProps {
  ticket: SupportTicket;
  isAdmin: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: TicketStatus) => Promise<boolean>;
  // Suppression DEFINITIVE, distincte de la cloture (demande explicite --
  // tickets de test/obsoletes) -- reservee a l'admin cote base (policy
  // "delete_admin_support_tickets", `using (is_admin())`, aucune policy
  // proprietaire equivalente) : le bouton n'est donc rendu que si isAdmin,
  // jamais propose a un utilisateur pour qui l'appel echouerait de toute
  // facon cote RLS.
  onDelete: (id: string) => Promise<boolean>;
}

// Le contenu reel (bulles de message, statuts, suppression) vit dans
// TicketThread.tsx, partage avec AdminMessagesTab.tsx (Administration >
// Messages) -- cette modale n'ajoute plus que le <Modal> qui l'encadre
// (extrait le 2026-08-29, refonte Administration en 2 onglets).
export function TicketDetailModal({ ticket, isAdmin, onClose, onStatusChange, onDelete }: TicketDetailModalProps) {
  return (
    <Modal onClose={onClose} size="lg">
      <TicketThread ticket={ticket} isAdmin={isAdmin} onStatusChange={onStatusChange} onDelete={onDelete} onClose={onClose} />
    </Modal>
  );
}
