import { useState } from "react";
import { Camera, Shirt, RefreshCw, ReceiptEuro, MessageSquare, ExternalLink, Lightbulb } from "lucide-react";
import { DiscordIcon } from '../../components/ui/DiscordIcon';

import { BRAND_VIOLET } from "../../lib/brandColors";
import { BrowserFrame } from "./BrowserFrame";
import screenshotStock from "../../assets/screenshot-stock.png";
import screenshotCommunication from "../../assets/screenshot-communication.png";
import screenshotInsights from "../../assets/screenshot-insights.png";

// Meme discipline que DiscordTab.tsx (Communaute) : pas de lien invente,
// message honnete si la variable d'env n'est pas configuree.
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;

// "tagline" reste factuelle (playbook, Copywriting section F : le benefice
// s'ajoute a l'info, ne la remplace jamais) -- Communication garde sa
// distinction honnete "aujourd'hui vs bientot" a l'interieur de SA seule
// ligne (retour beta 2026-08-28 : ne plus sous-vendre ce qui marche deja ni
// survendre ce qui ne marche pas).
const FEATURES = [
  // Copilote reste en tete (repositionnement 2026-08-29, analyse
  // concurrentielle) -- meme nom/icone que le bloc reel du dashboard
  // (DashboardHome.tsx).
  {
    icon: Lightbulb,
    title: 'Copilote',
    tagline: "Détecte le stock qui dort et les opportunités du marché, avant que tu n'y penses.",
    visual: 'insights' as const,
  },
  {
    icon: Shirt,
    title: 'Générateur IA',
    tagline: 'Photo → fiche complète, prête à publier en quelques secondes.',
    visual: 'generator' as const,
  },
  {
    icon: RefreshCw,
    title: "Republication",
    tagline: 'Statuts réels, republication en un clic ou programmée — jamais un robot à ta place.',
    visual: 'stock' as const,
  },
  {
    icon: MessageSquare,
    title: 'Communication',
    tagline: 'Relance favoris en un clic ; réponses automatiques aux messages, bientôt.',
    visual: 'communication' as const,
  },
  {
    icon: ReceiptEuro,
    title: 'Comptabilité',
    tagline: 'Chiffre d\'affaires, marge et TVA estimés, calculés en temps réel.',
    visual: 'accounting' as const,
  },
  {
    icon: DiscordIcon,
    title: 'Communauté Discord',
    tagline: "Alertes en direct, entraide entre revendeurs, accès à l'équipe ResellOS.",
    visual: 'discord' as const,
  },
];

// Retour "audit VintyResell" (2026-08-29) : le bento (6 cartes simultanees
// de ~300px) faisait lire la section comme des vignettes, jamais comme un
// produit -- diagnostic : aucun module n'avait jamais la pleine largeur
// d'ecran, contrairement au concurrent qui ne montre qu'UN module a la
// fois, en grand. Retour a un panneau unique (onglets, useState(0) dans
// Features()) mais a une echelle et dans une mise en scene tres
// differentes de l'ancienne version tabs : cadre beaucoup plus grand
// (h-full sur un parent de 340-480px selon le viewport, pose ICI au niveau
// du parent -- voir Features()) et fond de SECTION sombre (voir Features())
// pour que le cadre macOS (deja sombre) cesse de flotter isole sur blanc.
// Pas de glow ni de degrade sur ce fond (playbook, anti-pattern #1) --
// juste un gris tres sombre uni, sobre.
// Captures reelles pour 'insights'/'communication'/'stock' (playbook, Human
// feel #1 : jamais de maquette vide) -- 'generator'/'discord'/'accounting'
// restent des mockups stylises (voir le tri fait avant integration :
// generateur vide, comptabilite a 0 €, communaute a 4 membres -- aucune
// n'aurait servi l'objectif). Sidebar de l'app recadree dans les fichiers
// source (2026-08-29) : les 3 captures reelles n'incluent plus la sidebar
// laterale de ResellOS.
export function FeatureVisual({ kind }: { kind: (typeof FEATURES)[number]['visual'] }) {
  if (kind === 'insights') {
    return <CopiloteVisual />;
  }
  if (kind === 'generator') {
    return (
      <BrowserFrame className="h-full">
        <div className="bg-gray-50 p-8 sm:p-12 space-y-6 h-full flex flex-col justify-center">
          <div className="flex items-center gap-4 max-w-md mx-auto w-full">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
              <Camera className="w-7 h-7" style={{ color: BRAND_VIOLET }} />
            </div>
            <div className="h-2.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full w-[70%] rounded-full" style={{ backgroundColor: BRAND_VIOLET }} />
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-200 p-6 max-w-md mx-auto w-full">
            <p className="font-semibold text-lg text-gray-900">Polo Ralph Lauren homme bleu marine taille L</p>
            <p className="text-sm text-gray-500 mt-1.5">Ralph Lauren · Polos · Taille L · Très bon état</p>
            <p className="font-black text-2xl mt-4" style={{ color: BRAND_VIOLET }}>35 €</p>
          </div>
        </div>
      </BrowserFrame>
    );
  }
  if (kind === 'discord') {
    return (
      <BrowserFrame className="h-full">
        <div className="bg-gray-50 p-8 text-center h-full flex flex-col justify-center items-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-white border border-gray-200">
            <DiscordIcon className="w-8 h-8" style={{ color: BRAND_VIOLET }} />
          </div>
          <p className="font-semibold text-xl mb-2 text-gray-900">Discord ResellOS</p>
          <p className="text-sm text-gray-500 mb-6 max-w-xs">
            Échange en direct avec les autres revendeurs et l'équipe ResellOS.
          </p>
          {DISCORD_INVITE_URL ? (
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 text-sm font-bold px-5 py-3 rounded-lg border transition-colors"
              style={{ color: BRAND_VIOLET, backgroundColor: `${BRAND_VIOLET}1A`, borderColor: `${BRAND_VIOLET}33` }}
            >
              Rejoindre Discord <ExternalLink className="w-4 h-4" />
            </a>
          ) : (
            <p className="text-xs text-gray-500">Lien Discord pas encore configuré.</p>
          )}
        </div>
      </BrowserFrame>
    );
  }
  if (kind === 'communication') {
    return (
      <BrowserFrame className="h-full">
        <img
          src={screenshotCommunication}
          alt="Relance favoris : messages préparés avec offres -5 %/-10 %, prêts à copier sur Vinted"
          className="w-full h-full object-cover object-top block"
        />
      </BrowserFrame>
    );
  }
  if (kind === 'stock') {
    return (
      <BrowserFrame className="h-full">
        <img
          src={screenshotStock}
          alt="Mes annonces : statuts réels, valeur du stock et chiffre d'affaires à jour"
          className="w-full h-full object-cover object-top block"
        />
      </BrowserFrame>
    );
  }
  return (
    <BrowserFrame className="h-full">
      <div className="bg-gray-50 p-8 sm:p-12 grid grid-cols-2 gap-4 h-full content-center max-w-lg mx-auto">
        {[
          ['1 240 €', "Chiffre d'affaires"],
          ['+326 €', 'Bénéfice net'],
          ['18 %', 'ROI moyen'],
          ['796 €', 'Valeur du stock'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl bg-white border border-gray-200 p-5">
            <p className="text-2xl font-black" style={{ color: BRAND_VIOLET }}>{value}</p>
            <p className="text-gray-500 text-sm mt-1.5">{label}</p>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

// Copilote : conteneur video prevu (micro-interaction de survol du scan
// d'opportunites, /videos/copilote-hover.mp4) -- pas encore tourne. Repli
// automatique sur la vraie capture existante via onError, MEME contrat que
// Hero.tsx -- jamais un bouton "Lecture video" affiche sans video reelle
// derriere (ce serait un clic mort pour un vrai visiteur).
function CopiloteVisual() {
  const [hasVideo, setHasVideo] = useState(true);

  if (!hasVideo) {
    return (
      <BrowserFrame className="h-full">
        <img
          src={screenshotInsights}
          alt="Scan d'opportunités du Copilote : 211 détectées, +58 € de profit moyen, +116 % de ROI moyen"
          className="w-full h-full object-cover object-top block"
        />
      </BrowserFrame>
    );
  }

  return (
    <BrowserFrame className="h-full">
      <video
        className="w-full h-full object-cover object-top block"
        autoPlay
        muted
        loop
        playsInline
        onError={() => setHasVideo(false)}
      >
        <source src="/videos/copilote-hover.mp4" type="video/mp4" />
      </video>
    </BrowserFrame>
  );
}

export function Features() {
  // Panneau unique (retour audit VintyResell, 2026-08-29) : un module a la
  // fois, jamais 6 en meme temps -- c'est le changement d'onglet qui EST le
  // changement d'etat justifiant l'animation d'entree (rise-in), pas une
  // rotation automatique (deja tranche le 2026-08-26, raison inchangee).
  const [active, setActive] = useState(0);
  const feature = FEATURES[active];
  const Icon = feature.icon;

  return (
    // Fond de section sombre (retour audit VintyResell, point P0-2) : les
    // captures reelles sont blanches, la page l'etait aussi -- le cadre
    // macOS (deja sombre) etait la SEULE zone de contraste de toute la
    // section, un rectangle isole plutot qu'une mise en scene. gray-950 uni,
    // sans glow ni degrade (playbook, anti-pattern #1) -- juste un fond qui
    // laisse le cadre et son contenu se detacher naturellement.
    <section id="features" className="py-20 sm:py-28 bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-black mb-4 text-white">Tout ce dont vous avez besoin pour revendre.</h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            De la création d'annonce jusqu'à la comptabilité, tout est réuni dans une seule plateforme.
          </p>
        </div>

        {/* Selecteur d'onglet -- variante sombre du meme composant deja
            utilise avant le bento. L'icone inactive reste grise : colorer
            les six en violet donnerait six accents de meme poids, donc
            aucune indication d'etat (meme regle qu'avant). */}
        <div role="tablist" aria-label="Modules ResellOS" className="flex flex-wrap justify-center gap-2 mb-10">
          {FEATURES.map(({ title, icon: TabIcon }, i) => {
            const isActive = i === active;
            return (
              <button
                key={title}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border"
                style={
                  isActive
                    ? { color: '#fff', backgroundColor: `${BRAND_VIOLET}33`, borderColor: `${BRAND_VIOLET}66` }
                    : { color: '#9CA3AF', borderColor: 'transparent' }
                }
              >
                <TabIcon className="w-5 h-5" style={{ color: isActive ? BRAND_VIOLET : '#6B7280' }} />
                {title}
              </button>
            );
          })}
        </div>

        {/* Panneau -- cadre agrandi (340px -> 480px selon le viewport,
            contre 224-320px sur l'ancien bento) : c'est le levier d'echelle
            identifie dans l'audit, pas juste un habillage. "group" porte le
            survol jusqu'au BrowserFrame imbrique (zoom + bordure eclaircie,
            voir son propre commentaire). */}
        <div key={active} className="group rise-in">
          <div className="h-[340px] sm:h-[420px] lg:h-[480px]">
            <FeatureVisual kind={feature.visual} />
          </div>
          <div className="flex items-center gap-3 mt-8 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 flex-shrink-0">
              <Icon className="w-5 h-5" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-white">{feature.title}</h3>
          </div>
          <p className="text-gray-400 text-base sm:text-lg max-w-2xl leading-snug">{feature.tagline}</p>
        </div>
      </div>
    </section>
  );
}
