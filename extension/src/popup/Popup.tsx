import { useEffect, useState } from "react";
import { Puzzle, CheckCircle2, AlertTriangle } from "lucide-react";
import type { StatusResponse } from "../lib/messages";
import { logger, type LogEntry } from "../background/logger";
import { StatusCard } from "./components/StatusCard";
import { PopupButton } from "./components/PopupButton";
import { DiagnosticPanel } from "./components/DiagnosticPanel";
import { Spinner } from "./components/Spinner";
import { toClientErrorMessage } from "./lib/popupErrorMessages";
import logoGlyphTransparent from "./assets/logo-glyph-transparent.png";
import "./popup.css";

// Etats derives uniquement des champs REELS de StatusResponse (voir
// lib/messages.ts) -- aucun etat invente qui ne serait pas observable
// aujourd'hui (ex. pas de "synchronisation en cours" : GET_STATUS est un
// instantane a l'ouverture du popup, sans polling, donc rien ne prouverait
// honnetement un tel etat). lastError ne peut etre non-null QUE si paired
// est deja true (voir pairing.ts::getStatus -- le cas non-apparie renvoie
// toujours lastError: null), donc le controler en premier ne masque jamais
// le cas "jamais apparie".
function useStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const response = (await chrome.runtime.sendMessage({ type: "GET_STATUS" })) as StatusResponse;
    setStatus(response);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { status, loading, refresh };
}

export default function Popup() {
  const { status, loading, refresh } = useStatus();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    logger.getRecent().then((entries) => setLogs(entries.slice().reverse()));
  }, [status]);

  const handleUnpair = async () => {
    setWorking(true);
    await chrome.runtime.sendMessage({ type: "UNPAIR" });
    await refresh();
    setWorking(false);
  };

  return (
    <div className="popup">
      {/* Wordmark : le glyphe (le "R") + "esell" + "OS", meme construction
          que la sidebar du dashboard (voir DashboardLayout.tsx) -- jamais
          de "R" textuel en plus du glyphe. Variante "transparente" de
          l'asset (deja generee au rebrand du 2026-07-28, aucun nouvel
          asset) : concue pour se coller directement au mot, pas la
          variante "carree" (icone autonome, reservee aux favicons/icones
          d'action). */}
      <div className="popup-header">
        <img src={logoGlyphTransparent} alt="ResellOS" width={26} height={26} className="popup-logo" />
        <span className="popup-wordmark">
          <span className="brand-white">esell</span>
          <span className="brand-accent">OS</span>
        </span>
      </div>

      {loading && (
        <div className="card fade-in status-row">
          <Spinner size={16} />
          <p className="status-desc">Vérification du statut…</p>
        </div>
      )}

      {!loading && status && <StatusSection status={status} />}

      {!loading && status?.paired && (
        <PopupButton variant="danger" loading={working} onClick={() => void handleUnpair()}>
          Déconnecter l'extension
        </PopupButton>
      )}

      <DiagnosticPanel logs={logs} />
    </div>
  );
}

// Vocabulaire repris a l'identique de VintedAccountPage.tsx (app web) --
// "Extension connectée"/"Extension déconnectée" et les deux descriptions
// (connectee+vinted / non-appariee) sont les memes chaines exactes que la
// page Compte Vinted du dashboard, pour que popup et app parlent le meme
// langage. lastError traduit systematiquement via toClientErrorMessage()
// (jamais la chaine technique brute) -- voir lib/popupErrorMessages.ts.
function StatusSection({ status }: { status: StatusResponse }) {
  if (status.lastError) {
    return (
      <StatusCard
        icon={AlertTriangle}
        tone="warning"
        title="Synchronisation impossible"
        description={toClientErrorMessage(status.lastError)}
      />
    );
  }

  if (!status.paired) {
    return (
      <StatusCard
        icon={Puzzle}
        tone="neutral"
        title="Extension déconnectée"
        description="Connecte l'extension pour démarrer la synchronisation de ton compte Vinted."
      />
    );
  }

  if (!status.vintedConnected) {
    return (
      <StatusCard
        icon={CheckCircle2}
        tone="connected"
        title="Extension connectée"
        description="Aucun compte Vinted détecté pour l'instant. Ouvre ton profil Vinted dans un onglet pour lancer la synchronisation."
      />
    );
  }

  return (
    <StatusCard
      icon={CheckCircle2}
      tone="connected"
      title="Extension connectée"
      description="L'extension synchronise automatiquement tes annonces Vinted vers ResellOS."
      meta={status.lastSyncedAt ? `Dernière synchro : ${new Date(status.lastSyncedAt).toLocaleString("fr-FR")}` : undefined}
    />
  );
}
