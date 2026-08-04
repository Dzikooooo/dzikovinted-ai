import { MessageCircle, ExternalLink } from 'lucide-react';

// Constante de config, meme discipline que VITE_RESELLOS_EXTENSION_ID
// (extensionBridge.ts) : pas de lien invente, message honnete si absent
// plutot qu'un lien casse ou un faux placeholder.
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;

// Tuile statique (Lot 1 de la Communaute) -- Discord reste la partie
// discussion en temps reel, ResellOS ne fait que pointer dessus ici. La
// synchronisation plus poussee (roles Premium, salons par abonnement,
// annonces croisees) est prevue au niveau du schema (voir
// discord_channel_id/discord_message_id sur community_content) mais pas
// construite dans ce chantier.
export function DiscordTab() {
  return (
    <div className="bg-surface border border-white/5 rounded-2xl p-8 text-center max-w-lg mx-auto">
      <div className="w-14 h-14 bg-neon-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <MessageCircle className="w-6 h-6 text-neon-500" />
      </div>
      <h3 className="font-bold text-lg mb-2">Discord ResellOS</h3>
      <p className="text-sm text-gray-500 mb-6">
        Échange en direct avec les autres revendeurs et l'équipe ResellOS. Les nouveautés, tutoriels et la roadmap
        restent centralisés ici — Discord, c'est la discussion en temps réel.
      </p>
      {DISCORD_INVITE_URL ? (
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-neon-600 text-white font-bold px-5 py-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all"
        >
          Rejoindre le Discord <ExternalLink className="w-4 h-4" />
        </a>
      ) : (
        <p className="text-xs text-gray-600">Lien Discord pas encore configuré.</p>
      )}
    </div>
  );
}
