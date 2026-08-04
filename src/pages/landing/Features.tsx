import { useEffect, useState } from 'react';
import { Camera, Sparkles, Eye, Receipt, CheckSquare, MessageSquare, ExternalLink, Check } from 'lucide-react';
import { DiscordIcon } from '../../components/ui/DiscordIcon';

const ROTATE_MS = 5500;

// Meme discipline que DiscordTab.tsx (Communaute) : pas de lien invente,
// message honnete si la variable d'env n'est pas configuree.
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;

// Memes 5 modules et le meme ordre que ProductPreview.tsx (audit personnel
// utilisateur, 2026-08-02) -- coherence des noms/icones sur toute la
// landing plutot qu'une liste differente par section. "benefits" (audit
// personnel utilisateur, 2026-08-02, retour #2) : chaque module affiche
// plusieurs avantages concrets d'un coup plutot qu'un seul paragraphe --
// tous tires de fonctionnalites reelles, "Communication" reste etiquetee
// "bientot" pour les points pas encore construits.
const FEATURES = [
  {
    icon: DiscordIcon,
    title: 'Communauté Discord',
    benefits: [
      'Alertes d\'opportunités en direct',
      'Nouveautés en avant-première',
      'Entraide entre revendeurs',
      'Canal dédié aux astuces',
      'Accès direct à l\'équipe ResellOS',
    ],
    visual: 'discord' as const,
  },
  {
    icon: Sparkles,
    title: 'Générateur IA',
    benefits: [
      'Titre optimisé pour Vinted',
      'Description rédigée automatiquement',
      'Catégorie, taille et état détectés',
      'Prix recommandé (IA ou marché réel)',
      'Jusqu\'à 10 photos par annonce',
      'Prêt à publier en quelques secondes',
    ],
    visual: 'generator' as const,
  },
  {
    icon: Eye,
    title: 'Mes annonces',
    benefits: [
      'Synchronisation automatique depuis Vinted',
      'Statut réel : en ligne, vendue, désactivée',
      'Modification directement depuis ResellOS',
      'Republication en un clic (bientôt)',
      'Sélection multiple et actions groupées',
      'Historique complet par annonce',
    ],
    visual: 'stock' as const,
  },
  {
    icon: MessageSquare,
    title: 'Communication',
    benefits: [
      'Réponse suggérée aux messages (bientôt)',
      'Message auto aux favoris (bientôt)',
      'Réponse aux offres (bientôt)',
      'Programmation des envois (bientôt)',
      'Toujours confirmé par toi, jamais automatique',
    ],
    visual: 'communication' as const,
  },
  {
    icon: Receipt,
    title: 'Comptabilité',
    benefits: [
      "Chiffre d'affaires en temps réel",
      'Marge et bénéfice net par vente',
      'ROI calculé automatiquement',
      'Suivi des dépenses par catégorie',
      'Estimation TVA et URSSAF',
      'Historique complet',
    ],
    visual: 'accounting' as const,
  },
];

function FeatureVisual({ kind }: { kind: (typeof FEATURES)[number]['visual'] }) {
  if (kind === 'generator') {
    return (
      <div className="rounded-2xl bg-surface-alt border border-white/10 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-neon-500/10 flex items-center justify-center">
            <Camera className="w-5 h-5 text-neon-500" />
          </div>
          <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full w-[70%] bg-neon-500/60 rounded-full" />
          </div>
        </div>
        <div className="rounded-xl bg-dark-400 border border-white/5 p-4">
          <p className="font-semibold text-sm">Polo Ralph Lauren homme bleu marine taille L</p>
          <p className="text-xs text-gray-500 mt-1">Ralph Lauren · Polos · Taille L · Très bon état</p>
          <p className="text-neon-500 font-black mt-3">35 €</p>
        </div>
      </div>
    );
  }
  if (kind === 'discord') {
    return (
      <div className="rounded-2xl bg-surface-alt border border-white/10 p-6 text-center">
        <div className="w-12 h-12 bg-neon-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <DiscordIcon className="w-6 h-6 text-neon-500" />
        </div>
        <p className="font-semibold text-sm mb-1.5">Discord ResellOS</p>
        <p className="text-xs text-gray-500 mb-5">
          Échange en direct avec les autres revendeurs et l'équipe ResellOS.
        </p>
        {DISCORD_INVITE_URL ? (
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold text-neon-500 bg-neon-500/10 border border-neon-500/20 px-4 py-2.5 rounded-lg hover:bg-neon-500/20 transition-colors"
          >
            Rejoindre la communauté Discord <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <p className="text-[11px] text-gray-600">Lien Discord pas encore configuré.</p>
        )}
      </div>
    );
  }
  if (kind === 'communication') {
    return (
      <div className="rounded-2xl bg-surface-alt border border-white/10 p-6 text-center">
        <div className="w-12 h-12 bg-neon-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-5 h-5 text-neon-500" />
        </div>
        <p className="font-semibold text-sm mb-1.5">Bientôt disponible</p>
        <p className="text-xs text-gray-500">
          Chaque message restera une action que tu déclenches et confirmes toi-même — jamais un envoi automatique
          silencieux sur ton compte Vinted.
        </p>
      </div>
    );
  }
  if (kind === 'stock') {
    return (
      <div className="rounded-2xl bg-surface-alt border border-white/10 p-6 space-y-3">
        {[
          ['Sweat Nike gris', 'En ligne', 'text-neon-500 bg-neon-500/10', true],
          ["Jean Levi's 501", 'Vendue', 'text-green-400 bg-green-400/10', false],
          ['Chemise Sandro', 'Désactivée', 'text-gray-400 bg-white/5', false],
        ].map(([name, status, cls, selected]) => (
          <div key={name as string} className="flex items-center gap-3 text-sm">
            {selected ? (
              <CheckSquare className="w-4 h-4 text-neon-500 flex-shrink-0" />
            ) : (
              <span className="w-4 h-4 rounded border border-white/15 flex-shrink-0" />
            )}
            <span className="text-gray-300 flex-1">{name}</span>
            <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-md ${cls as string}`}>{status}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-gray-500">1 annonce sélectionnée</span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-neon-500 bg-neon-500/10 border border-neon-500/20 px-2 py-1 rounded-md">Republier</span>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-surface-alt border border-white/10 p-6 grid grid-cols-2 gap-3">
      {[
        ['1 240 €', "Chiffre d'affaires", 'text-green-400'],
        ['+326 €', 'Bénéfice net', 'text-green-400'],
        ['18 %', 'ROI moyen', 'text-green-400'],
        ['796 €', 'Valeur du stock', 'text-neon-500'],
      ].map(([value, label, color]) => (
        <div key={label} className="rounded-xl bg-dark-400 border border-white/5 p-4">
          <p className={`text-lg font-black ${color}`}>{value}</p>
          <p className="text-gray-500 text-[11px] mt-1">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function Features() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % FEATURES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const feature = FEATURES[active];
  const Icon = feature.icon;
  const imageOnLeft = active % 2 === 1;

  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl sm:text-5xl font-black mb-4">Tout ce dont vous avez besoin pour revendre.</h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            De la création d'annonce jusqu'à la comptabilité, tout est réuni dans une seule plateforme.
          </p>
        </div>

        {/* Selecteur d'onglet -- pilote la rotation automatique, cliquable
            pour prendre la main sans attendre le cycle. */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-2 mb-14">
          {FEATURES.map(({ title, icon: TabIcon }, i) => (
            <button
              key={title}
              onClick={() => setActive(i)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                i === active ? 'bg-neon-500/10 text-neon-500 border border-neon-500/30' : 'text-gray-500 border border-transparent hover:text-gray-300'
              }`}
            >
              <TabIcon className="w-5 h-5 text-neon-500" />
              {title}
            </button>
          ))}
        </div>

        <div key={active} className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center ${imageOnLeft ? 'feature-slide-in-left' : 'feature-slide-in-right'}`}>
          <div className={imageOnLeft ? 'lg:order-2' : ''}>
            <div className="w-14 h-14 bg-neon-500/10 rounded-2xl flex items-center justify-center mb-5">
              <Icon className="w-7 h-7 text-neon-500" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-black mb-5">{feature.title}</h3>
            {/* Cartes carrees plutot qu'une liste de texte fin (audit
                personnel utilisateur, 2026-08-04 : "on a pas le temps de
                lire") -- meme contenu, format plus grand et plus rapide a
                scanner, en 2 colonnes des sm. */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {feature.benefits.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 bg-surface-alt border border-white/5 rounded-xl p-4 text-sm text-gray-200 leading-snug"
                >
                  <Check className="w-5 h-5 text-neon-500 flex-shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className={imageOnLeft ? 'lg:order-1' : ''}>
            <FeatureVisual kind={feature.visual} />
          </div>
        </div>
      </div>
    </section>
  );
}
