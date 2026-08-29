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

// Refonte Bento Grid (2026-08-29) : l'ancien systeme d'onglets + listes de
// puces (5-6 par module) devient une phrase unique ultra-directe par carte.
// "tagline" doit rester factuelle (playbook, Copywriting section F : le
// benefice s'ajoute a l'info, ne la remplace jamais) -- Communication garde
// sa distinction honnete "aujourd'hui vs bientot" a l'interieur de SA seule
// ligne plutot que de la perdre (retour beta 2026-08-28 : ne plus sous-
// vendre ce qui marche deja ni survendre ce qui ne marche pas).
const FEATURES = [
  // Copilote reste en tete (repositionnement 2026-08-29, analyse
  // concurrentielle) et devient la carte hero de la grille -- meme nom/
  // icone que le bloc reel du dashboard (DashboardHome.tsx).
  {
    icon: Lightbulb,
    title: 'Copilote',
    tagline: "Détecte le stock qui dort et les opportunités du marché, avant que tu n'y penses.",
    visual: 'insights' as const,
  },
  {
    icon: DiscordIcon,
    title: 'Communauté Discord',
    tagline: "Alertes en direct, entraide entre revendeurs, accès à l'équipe ResellOS.",
    visual: 'discord' as const,
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
];

// Retour d'un pro du design web (2026-08-29, plusieurs tours) : captures
// reelles pour 'insights'/'communication'/'stock' (playbook, Human feel #1 :
// jamais de maquette vide) -- 'generator'/'discord'/'accounting' restent des
// mockups stylises, memes raisons que toujours (voir le tri fait avant
// integration : generateur vide, comptabilite a 0 €, communaute a 4 membres
// -- aucune n'aurait servi l'objectif). Hauteur de media fixe (h-56/h-72/
// h-80 selon le gabarit de carte), jamais une hauteur en % : une carte de
// grille bento etirable (CSS Grid align-items: stretch) rend une chaine de
// hauteurs en % fragile pour un <img>/<video> (element remplace) -- les
// mockups sans media (generator/discord/accounting), eux, peuvent se
// permettre h-full + justify-center sans risque, pour centrer leur contenu
// si la carte s'etire un peu plus haut que sa voisine. min-h-[11rem] sur
// ces 3 mockups (retour 2026-08-29, point 1) : sans plancher, un contenu
// court + une carte etiree pouvait donner un cadre disproportionne "tout en
// longueur" -- desormais regroupes ENTRE EUX (voir Features()) pour ne plus
// s'etirer contre une capture d'ecran bien plus haute qu'eux.
export function FeatureVisual({ kind }: { kind: (typeof FEATURES)[number]['visual'] }) {
  if (kind === 'insights') {
    return <CopiloteVisual />;
  }
  if (kind === 'generator') {
    return (
      <BrowserFrame className="h-full">
        <div className="bg-gray-50 p-6 space-y-4 h-full min-h-[11rem] flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
              <Camera className="w-5 h-5" style={{ color: BRAND_VIOLET }} />
            </div>
            <div className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full w-[70%] rounded-full" style={{ backgroundColor: BRAND_VIOLET }} />
            </div>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <p className="font-semibold text-sm text-gray-900">Polo Ralph Lauren homme bleu marine taille L</p>
            <p className="text-xs text-gray-500 mt-1">Ralph Lauren · Polos · Taille L · Très bon état</p>
            <p className="font-black mt-3" style={{ color: BRAND_VIOLET }}>35 €</p>
          </div>
        </div>
      </BrowserFrame>
    );
  }
  if (kind === 'discord') {
    return (
      <BrowserFrame className="h-full">
        <div className="bg-gray-50 p-6 text-center h-full min-h-[11rem] flex flex-col justify-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-white border border-gray-200">
            <DiscordIcon className="w-6 h-6" style={{ color: BRAND_VIOLET }} />
          </div>
          <p className="font-semibold text-sm mb-1.5 text-gray-900">Discord ResellOS</p>
          <p className="text-xs text-gray-500 mb-5">
            Échange en direct avec les autres revendeurs et l'équipe ResellOS.
          </p>
          {DISCORD_INVITE_URL ? (
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 text-xs font-bold px-4 py-2.5 rounded-lg border transition-colors"
              style={{ color: BRAND_VIOLET, backgroundColor: `${BRAND_VIOLET}1A`, borderColor: `${BRAND_VIOLET}33` }}
            >
              Rejoindre Discord <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <p className="text-[11px] text-gray-500">Lien Discord pas encore configuré.</p>
          )}
        </div>
      </BrowserFrame>
    );
  }
  if (kind === 'communication') {
    return (
      <BrowserFrame>
        <img
          src={screenshotCommunication}
          alt="Relance favoris : messages préparés avec offres -5 %/-10 %, prêts à copier sur Vinted"
          className="w-full h-56 object-cover object-top block"
        />
      </BrowserFrame>
    );
  }
  if (kind === 'stock') {
    return (
      <BrowserFrame>
        <img
          src={screenshotStock}
          alt="Mes annonces : statuts réels, valeur du stock et chiffre d'affaires à jour"
          className="w-full h-56 object-cover object-top block"
        />
      </BrowserFrame>
    );
  }
  return (
    <BrowserFrame className="h-full">
      <div className="bg-gray-50 p-6 grid grid-cols-2 gap-3 h-full min-h-[11rem] content-center">
        {[
          ['1 240 €', "Chiffre d'affaires"],
          ['+326 €', 'Bénéfice net'],
          ['18 %', 'ROI moyen'],
          ['796 €', 'Valeur du stock'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl bg-white border border-gray-200 p-4">
            <p className="text-lg font-black" style={{ color: BRAND_VIOLET }}>{value}</p>
            <p className="text-gray-500 text-[11px] mt-1">{label}</p>
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
      <BrowserFrame>
        <img
          src={screenshotInsights}
          alt="Scan d'opportunités du Copilote : 211 détectées, +58 € de profit moyen, +116 % de ROI moyen"
          className="w-full h-72 lg:h-80 object-cover object-top block"
        />
      </BrowserFrame>
    );
  }

  return (
    <BrowserFrame>
      <video
        className="w-full h-72 lg:h-80 object-cover object-top block"
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

// Carte bento -- un composant unique pour les 6 modules, decline en deux
// gabarits (hero large / secondaire) plutot que du markup duplique par
// carte (playbook, Design principles #9 : composant reutilisable). "group"
// porte le survol jusqu'au BrowserFrame imbrique (voir son propre
// commentaire group-hover) : la carte entiere reagit, pas seulement le
// pixel du cadre. min-h-[6.5rem] sur le bloc icone+titre+ligne (retour
// 2026-08-29, point 2) : sans plancher commun, une tagline sur 1 ligne vs 2
// lignes decalait le point de depart du cadre visuel d'une carte a l'autre
// dans la meme rangee -- desormais toutes les cartes secondaires demarrent
// leur visuel a la meme hauteur, quelle que soit la longueur de leur texte.
function BentoCard({ feature, large = false, className = '' }: { feature: (typeof FEATURES)[number]; large?: boolean; className?: string }) {
  const Icon = feature.icon;

  return (
    <div
      className={`group h-full flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-6 transition-colors duration-300 hover:border-gray-300 ${large ? 'lg:flex-row lg:items-center lg:gap-10' : ''} ${className}`}
    >
      <div className={large ? 'lg:w-[38%] lg:flex-shrink-0' : 'min-h-[6.5rem]'}>
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-50 border border-gray-200 flex-shrink-0">
            <Icon className="w-4.5 h-4.5" style={{ color: BRAND_VIOLET }} />
          </div>
          <h3 className={large ? 'text-2xl sm:text-3xl font-black text-gray-900' : 'text-lg font-black text-gray-900'}>
            {feature.title}
          </h3>
        </div>
        <p className={large ? 'text-base text-gray-600 leading-snug' : 'text-sm text-gray-600 leading-snug'}>
          {feature.tagline}
        </p>
      </div>
      <div className={large ? 'lg:flex-1' : 'flex-1'}>
        <FeatureVisual kind={feature.visual} />
      </div>
    </div>
  );
}

export function Features() {
  const [hero, discord, generator, stock, communication, accounting] = FEATURES;

  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl sm:text-5xl font-black mb-4 text-gray-900">Tout ce dont vous avez besoin pour revendre.</h2>
          <p className="text-gray-600 text-lg max-w-xl mx-auto">
            De la création d'annonce jusqu'à la comptabilité, tout est réuni dans une seule plateforme.
          </p>
        </div>

        {/* Grille bento asymetrique (retour design 2026-08-29) : remplace
            l'ancien systeme d'onglets. Copilote en carte hero pleine largeur
            (argument de vente principal) -- pas de glow decoratif (playbook,
            anti-pattern #1), asymetrie portee par le NOMBRE de colonnes par
            rangee plutot que par un effet visuel ajoute.
            Regroupement par poids visuel (correctif 2026-08-29, point 1) :
            les 2 captures d'ecran reelles (memes proportions) partagent une
            rangee ; les 3 mockups sans capture (memes proportions, plus
            compactes) partagent l'autre. Melanger les deux etirait les
            petites cartes (CSS Grid align-items: stretch) contre une
            capture bien plus haute -- un cadre macOS "tout en longueur",
            jamais une fenetre d'application compacte. */}
        <div className="flex flex-col gap-6">
          <BentoCard feature={hero} large />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <BentoCard feature={stock} />
            <BentoCard feature={communication} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <BentoCard feature={generator} />
            <BentoCard feature={accounting} />
            <BentoCard feature={discord} />
          </div>
        </div>
      </div>
    </section>
  );
}
