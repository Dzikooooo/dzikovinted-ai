import { useEffect, useState } from "react";
import type { StatusResponse } from "../lib/messages";
import { logger, type LogEntry } from "../background/logger";

// Popup volontairement en styles inline plutot qu'avec Tailwind : pas besoin
// d'un second pipeline Tailwind pour un ecran aussi simple. Couleurs reprises
// en dur depuis tailwind.config.js (neon-500 #FFC400, dark-400 #0a0a0a) pour
// rester coherent visuellement avec l'app principale sans dupliquer l'outillage.

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

  useEffect(() => {
    logger.getRecent().then((entries) => setLogs(entries.slice().reverse()));
  }, [status]);

  const handleUnpair = async () => {
    await chrome.runtime.sendMessage({ type: "UNPAIR" });
    await refresh();
  };

  return (
    <div style={{ width: 320, padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#0a0a0a", color: "#e5e5e5" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "#FFC400", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#000", fontSize: 13 }}>
          R
        </div>
        <strong>ResellOS</strong>
      </div>

      {loading && <p style={{ fontSize: 13, color: "#888" }}>Chargement...</p>}

      {!loading && status && (
        <>
          <StatusRow label="App ResellOS" ok={status.paired} okText="Appairé" koText="Non appairé" />
          <StatusRow label="Compte Vinted" ok={status.vintedConnected} okText="Connecté" koText="Non détecté" />

          {status.lastSyncedAt && (
            <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
              Dernière synchro : {new Date(status.lastSyncedAt).toLocaleString("fr-FR")}
            </p>
          )}

          {status.lastError && <p style={{ fontSize: 11, color: "#f87171", marginTop: 8 }}>{status.lastError}</p>}

          {!status.paired && (
            <p style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
              Ouvre ResellOS et clique sur « Connecter l'extension » pour t'appairer.
            </p>
          )}

          {status.paired && (
            <button
              onClick={handleUnpair}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "8px 0",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "#f87171",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Se dissocier
            </button>
          )}
        </>
      )}

      {logs.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#666", marginBottom: 6 }}>
            Journal
          </p>
          <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {logs.slice(0, 12).map((entry, i) => (
              <div
                key={i}
                style={{ fontSize: 10, color: entry.level === "error" ? "#f87171" : entry.level === "warn" ? "#facc15" : "#888" }}
              >
                <div>{entry.message}</div>
                {entry.detail && (
                  <div style={{ color: "#555", fontSize: 9, marginLeft: 8, wordBreak: "break-all" }}>{entry.detail}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, ok, okText, koText }: { label: string; ok: boolean; okText: string; koText: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0" }}>
      <span style={{ color: "#aaa" }}>{label}</span>
      <span style={{ color: ok ? "#FFC400" : "#666", fontWeight: 600 }}>{ok ? okText : koText}</span>
    </div>
  );
}
