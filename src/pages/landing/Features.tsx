import { useState } from "react";
import { Camera, Shirt, RefreshCw, ReceiptEuro, MessageSquare, ExternalLink, Check, Lightbulb } from "lucide-react";
import { DiscordIcon } from '../../components/ui/DiscordIcon';

import { BRAND_VIOLET } from "../../lib/brandColors";
import screenshotStock from "../../assets/screenshot-stock.png";
import screenshotCommunication from "../../assets/screenshot-communication.png";
import screenshotInsights from "../../assets/screenshot-insights.png";

// Meme discipline que DiscordTab.tsx (Communaute) : pas de lien invente,
// message honnete si la variable d'env n'est pas configuree.
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;

// "benefits" : chaque module affiche plusieurs avantages concrets d'un coup
// plutot qu'un seul paragraphe -- tous tires de fonctionnalites reelles,
// "Communication" reste etiquetee "bientot" pour les points pas encore
// construits.
const FEATURES = [
  // Repositionnement (2026-08-29, suite a l'analyse concurrentielle) :
  // place en premier ("tete de gondole") -- actif par defaut au chargement
  // (voir useState(0) plus bas), c'est desormais le premier module que
  // tout visiteur voit. La generation IA par photo est devenue un standard
  // du marche (plusieurs concurrents la proposent deja) ; ce moteur de
  // recommandation/detection d'opportunites reste, a notre connaissance,
  // absent des outils Vinted concurrents observes -- c'est lui qui porte
  // l'argument de vente principal desormais, pas le Generateur. Meme nom
  // ("Copilote") et meme icone (Lightbulb) que le bloc reel du dashboard
  // (DashboardHome.tsx) -- coherence des noms/icones sur toute la landing,
  // deja une regle etablie dans ce fichier.
  {
    icon: Lightbulb,
    title: 'Copilote',
    benefits: [
      'Détecte ton stock qui dort, avant que ça ne devienne un problème',
      'Recommandations concrètes : quoi republier, quoi ajuster',
      'Score de performance sur chaque annonce',
      'Scan des opportunités : ce qui se vend, à quel prix, sur le marché',
      'Comparaison entre tes comptes Vinted',
      'Fiable même avec un stock de plusieurs centaines d\'articles',
    ],
    visual: 'insights' as const,
  },
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
    icon: Shirt,
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
    icon: RefreshCw,
    title: "Republication",
    benefits: [
      'Synchronisation automatique depuis Vinted',
      'Statut réel : en ligne, vendue, désactivée',
      'Modification directement depuis ResellOS',
      'Republication en un clic, ou programmée à l\'heure de ton choix',
      'Sélection multiple et actions groupées',
      'Historique complet par annonce',
    ],
    visual: 'stock' as const,
  },
  {
    icon: MessageSquare,
    title: 'Communication',
    // Retour beta (2026-08-28) : ce module etait etiquete "(bientot)" en
    // bloc alors qu'une partie est reellement construite -- modeles de
    // message + relance favoris assistee (prix suggere en un clic, voir
    // CommunicationPage.tsx/FavouritesFollowUp.tsx). Seule l'automatisation
    // complete (envoi/reponse SANS action de l'utilisateur) reste roadmap --
    // desormais la seule chose etiquetee "(bientot)" ici, pour ne plus
    // sous-vendre ce qui marche deja ni survendre ce qui ne marche pas.
    benefits: [
      'Modèles de message personnalisables',
      'Relance favoris en un clic, prix suggéré inclus',
      'Message préparé avec les vraies infos de l\'annonce',
      'Réponse suggérée aux messages (bientôt)',
      'Réponse aux offres (bientôt)',
      'Envoi automatique programmé (bientôt)',
      'Toujours confirmé par toi, jamais automatique',
    ],
    visual: 'communication' as const,
  },
  {
    icon: ReceiptEuro,
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

// Retour d'un pro du design web (2026-08-29) : "ça se voit direct que
// c'est un projet IA, 0 visuel réel". Les cas 'insights'/'communication'/
// 'stock' ci-dessous sont desormais de VRAIES captures du produit reel
// (playbook, Human feel #1 : jamais de maquette vide) -- 'generator'/
// 'discord'/'accounting' (defaut) restent des mockups stylises en
// attendant de meilleures captures (voir le tri fait avant d'integrer :
// une capture "generateur" vide, une "comptabilite" a 0 € partout et une
// "communaute" a 4 membres en ligne ont ete ecartees, pas cachees --
// aucune n'aurait servi l'objectif). object-cover + object-position :
// cadrage approximatif en CSS en l'absence d'un vrai recadrage du fichier
// -- amelioration possible plus tard, pas un blocage aujourd'hui.
export function FeatureVisual({ kind }: { kind: (typeof FEATURES)[number]['visual'] }) {
  if (kind === 'insights') {
    return (
      <img
        src={screenshotInsights}
        alt="Scan d'opportunités du Copilote : 211 détectées, +58 € de profit moyen, +116 % de ROI moyen"
        className="rounded-2xl border border-gray-200 w-full h-72 object-cover object-top"
      />
    );
  }
  if (kind === 'generator') {
    return (
      <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 space-y-4">
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
    );
  }
  if (kind === 'discord') {
    return (
      <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 text-center">
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
            className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-lg border transition-colors"
            style={{ color: BRAND_VIOLET, backgroundColor: `${BRAND_VIOLET}1A`, borderColor: `${BRAND_VIOLET}33` }}
          >
            Rejoindre la communauté Discord <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <p className="text-[11px] text-gray-500">Lien Discord pas encore configuré.</p>
        )}
      </div>
    );
  }
  if (kind === 'communication') {
    return (
      <img
        src={screenshotCommunication}
        alt="Relance favoris : messages préparés avec offres -5 %/-10 %, prêts à copier sur Vinted"
        className="rounded-2xl border border-gray-200 w-full h-72 object-cover object-top"
      />
    );
  }
  if (kind === 'stock') {
    return (
      <img
        src={screenshotStock}
        alt="Mes annonces : statuts réels, valeur du stock et chiffre d'affaires à jour"
        className="rounded-2xl border border-gray-200 w-full h-72 object-cover object-top"
      />
    );
  }
  return (
    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 grid grid-cols-2 gap-3">
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
  );
}

export function Features() {
  // Rotation automatique RETIREE (2026-08-26). Chaque module affiche jusqu'a
  // 6 benefices plus un visuel : 5,5 s ne suffisaient pas a les lire, et le
  // contenu changeait sous les yeux au moment ou l'on commencait. Le playbook
  // est explicite la-dessus -- une animation doit correspondre a un vrai
  // changement d'etat, jamais tourner toute seule. Le changement d'onglet EST
  // ce changement d'etat : il vient desormais uniquement du clic.
  const [active, setActive] = useState(0);

  const feature = FEATURES[active];
  const Icon = feature.icon;
  const imageOnLeft = active % 2 === 1;

  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl sm:text-5xl font-black mb-4 text-gray-900">Tout ce dont vous avez besoin pour revendre.</h2>
          <p className="text-gray-600 text-lg max-w-xl mx-auto">
            De la création d'annonce jusqu'à la comptabilité, tout est réuni dans une seule plateforme.
          </p>
        </div>

        {/* Selecteur d'onglet -- SEUL pilote de la section depuis le retrait
            de la rotation automatique. Semantique d'onglets explicite
            (role/aria-selected) : sans elle, un lecteur d'ecran n'annonce que
            cinq boutons sans dire lequel est actif.
            L'icone inactive reste grise : colorer les cinq en violet donnait
            cinq accents de meme poids, donc aucune indication d'etat. */}
        <div role="tablist" aria-label="Modules ResellOS" className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-2 mb-14">
          {FEATURES.map(({ title, icon: TabIcon }, i) => {
            const isActive = i === active;
            return (
              <button
                key={title}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border"
                style={
                  isActive
                    ? { color: BRAND_VIOLET, backgroundColor: `${BRAND_VIOLET}1A`, borderColor: `${BRAND_VIOLET}4D` }
                    : { color: '#6B7280', borderColor: 'transparent' }
                }
              >
                <TabIcon className="w-5 h-5" style={{ color: isActive ? BRAND_VIOLET : '#9CA3AF' }} />
                {title}
              </button>
            );
          })}
        </div>

        <div key={active} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center rise-in">
          <div className={imageOnLeft ? 'lg:order-2' : ''}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 bg-white border border-gray-200">
              <Icon className="w-7 h-7" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-2xl sm:text-3xl font-black mb-5 text-gray-900">{feature.title}</h3>
            {/* Cartes carrees plutot qu'une liste de texte fin (audit
                personnel utilisateur, 2026-08-04 : "on a pas le temps de
                lire") -- meme contenu, format plus grand et plus rapide a
                scanner, en 2 colonnes des sm. */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {feature.benefits.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-snug"
                >
                  <Check className="w-5 h-5 flex-shrink-0" style={{ color: BRAND_VIOLET }} />
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
