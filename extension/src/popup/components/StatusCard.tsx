import type { LucideIcon } from "lucide-react";

export type StatusTone = "neutral" | "connected" | "warning";

interface StatusCardProps {
  icon: LucideIcon;
  tone: StatusTone;
  title: string;
  description?: string;
  meta?: string;
}

// Carte de statut principale du popup -- remplace l'ancien StatusRow binaire
// (ok/non-ok, voir git history) par un statut a 3 tons semantiques cohérents
// avec les icones deja utilisees cote app (Puzzle/CheckCircle2/AlertTriangle,
// voir VintedAccountPage.tsx). L'icone reste toujours purement decorative
// (aria-hidden) : le titre porte deja l'information, jamais d'icone seule
// sans texte adjacent.
export function StatusCard({ icon: Icon, tone, title, description, meta }: StatusCardProps) {
  return (
    <div className="card fade-in">
      <div className="status-row">
        <Icon size={20} className={`status-icon tone-${tone}`} aria-hidden="true" />
        <div>
          <p className="status-title">{title}</p>
          {description && <p className="status-desc">{description}</p>}
          {meta && <p className="status-meta">{meta}</p>}
        </div>
      </div>
    </div>
  );
}
