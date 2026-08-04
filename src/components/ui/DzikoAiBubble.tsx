import { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, User } from 'lucide-react';
import { askDzikoAssistant, type AssistantChatMessage } from '../../lib/dzikoAssistant';

// Assistant reel (2026-07-31) : branche sur l'edge function dziko-assistant
// (Gemini + donnees reelles du compte connecte, RLS-scopees). Remplace
// l'ancien placeholder "Bientot disponible". Historique garde uniquement en
// memoire (pas de persistance en base pour cette premiere version) -- perdu
// a la fermeture de l'onglet, comme n'importe quel chat volatile.
export function DzikoAiBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages: AssistantChatMessage[] = [...messages, { role: 'user', text }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setSending(true);

    try {
      const reply = await askDzikoAssistant(nextMessages);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant indisponible pour le moment.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="absolute bottom-16 right-0 w-80 sm:w-96 h-[36rem] max-h-[80vh] bg-surface border border-white/10 rounded-2xl shadow-[0_25px_70px_-10px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-neon-500/10 rounded-xl flex items-center justify-center">
                <Bot className="w-4 h-4 text-neon-500" />
              </div>
              <p className="font-bold text-sm">Dziko IA</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer" className="text-gray-500 hover:text-gray-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 h-80">
            {messages.length === 0 && (
              <p className="text-xs text-gray-500 leading-relaxed">
                Salut, je suis Dziko IA. Pose-moi une question sur ton compte -- ton stock, tes ventes, tes crédits ou une fonctionnalité de Resell OS.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-white/5' : 'bg-neon-500/10'}`}>
                  {m.role === 'user' ? <User className="w-3 h-3 text-gray-400" /> : <Bot className="w-3 h-3 text-neon-500" />}
                </div>
                <p className={`text-xs leading-relaxed rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap ${m.role === 'user' ? 'bg-neon-600 text-white' : 'bg-dark-400 text-gray-200'}`}>
                  {m.text}
                </p>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-neon-500/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3 text-neon-500" />
                </div>
                <p className="text-xs text-gray-500 rounded-xl px-3 py-2 bg-dark-400">Dziko IA réfléchit...</p>
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          <div className="flex items-center gap-2 px-3 py-3 border-t border-white/5 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              placeholder="Pose ta question..."
              disabled={sending}
              className="flex-1 bg-dark-400 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              aria-label="Envoyer"
              className="w-8 h-8 flex-shrink-0 rounded-xl bg-neon-600 text-white flex items-center justify-center hover:bg-neon-700 transition-colors disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Dziko IA"
        className="w-12 h-12 rounded-full bg-neon-600 text-white flex items-center justify-center shadow-[0_10px_30px_rgba(124,92,255,0.35)] hover:bg-neon-700 hover:scale-105 transition-all"
      >
        <Bot className="w-5 h-5" />
      </button>
    </div>
  );
}
