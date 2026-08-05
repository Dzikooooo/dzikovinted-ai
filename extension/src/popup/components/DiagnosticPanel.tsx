import { useState } from "react";
import type { LogEntry } from "../../background/logger";

interface DiagnosticPanelProps {
  logs: LogEntry[];
}

// Journal technique complet (etapes de pipeline, JSON de payloads deja
// tronques -- voir logger.ts, aucun token/mot de passe n'y transite) --
// contenu strictement identique a l'ancien bloc "Journal" de Popup.tsx,
// seule sa visibilite change : replie par defaut derriere <details> (natif,
// focusable et actionnable au clavier sans JS supplementaire), jamais
// affiche sur l'ecran principal.
//
// Le bouton "Copier" est rendu APRES <summary>, jamais a l'interieur : deux
// controles interactifs imbriques (bouton dans un <summary> deja cliquable)
// seraient invalides en HTML et ambigus au clavier.
export function DiagnosticPanel({ logs }: DiagnosticPanelProps) {
  const [copied, setCopied] = useState(false);

  if (logs.length === 0) return null;

  const visibleLogs = logs.slice(0, 12);

  const handleCopy = async () => {
    const text = visibleLogs
      .map((entry) => `[${entry.level}] ${entry.message}${entry.detail ? ` — ${entry.detail}` : ""}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Presse-papiers indisponible (permission refusee) -- fonctionnalite
      // secondaire, best-effort, aucune erreur affichee pour autant.
    }
  };

  return (
    <details className="diagnostic">
      <summary className="diagnostic-summary focus-ring">Diagnostic</summary>
      <div className="diagnostic-body">
        <button type="button" className="diagnostic-copy focus-ring" onClick={() => void handleCopy()}>
          {copied ? "Copié" : "Copier le journal"}
        </button>
        <div className="diagnostic-log">
          {visibleLogs.map((entry, i) => (
            <div key={i} className={`diagnostic-entry level-${entry.level}`}>
              <div>{entry.message}</div>
              {entry.detail && <div className="diagnostic-detail">{entry.detail}</div>}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
