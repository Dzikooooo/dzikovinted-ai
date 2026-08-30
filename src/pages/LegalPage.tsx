import type { AppPage } from '../lib/types';
import { Navbar } from './landing/Navbar';
import { Footer } from './landing/Footer';

interface LegalPageProps {
  kind: 'cgu' | 'confidentialite' | 'mentions-legales' | 'cookies';
  onNavigate: (page: AppPage) => void;
}

const PAGE_META: Record<LegalPageProps['kind'], { badge: string; title: string; description: string }> = {
  'mentions-legales': {
    badge: 'Mentions légales',
    title: 'Mentions légales',
    description: "Qui édite Resell OS, où le service est hébergé, et comment nous contacter.",
  },
  cgu: {
    badge: 'Version bêta — 30 août 2026',
    title: "Conditions générales d'utilisation",
    description: "Ce que tu acceptes en utilisant Resell OS, écrit simplement.",
  },
  confidentialite: {
    badge: 'Version bêta — 30 août 2026',
    title: 'Politique de confidentialité',
    description: 'Quelles données Resell OS traite, pourquoi, et comment tu gardes le contrôle.',
  },
  cookies: {
    badge: 'Version bêta — 30 août 2026',
    title: 'Politique des cookies',
    description: "Ce que Resell OS stocke dans ton navigateur — et ce qu'il ne fait pas.",
  },
};

// Pages legales reelles (2026-08-01, suite a l'audit beta-testeur : les liens
// "CGU"/"Confidentialite" du footer pointaient vers "#", un des signaux les
// plus forts d'un produit non fini). Contenu honnete et coherent avec l'etat
// reel du produit -- pas de promesse de facturation en ligne qui n'existe pas
// encore (voir SubscriptionPage.tsx), pas d'automatisation Vinted qui
// n'existe pas. Version beta explicitement assumee, pas une redaction
// juridique definitive.
const LEGAL_CONTENT: Record<LegalPageProps['kind'], () => JSX.Element> = {
  'mentions-legales': MentionsLegalesContent,
  cgu: CguContent,
  confidentialite: ConfidentialiteContent,
  cookies: CookiesContent,
};

export default function LegalPage({ kind, onNavigate }: LegalPageProps) {
  const meta = PAGE_META[kind];
  const Content = LEGAL_CONTENT[kind];
  return (
    <div className="min-h-screen bg-dark-400 text-gray-900 flex flex-col">
      <Navbar onNavigate={onNavigate} currentPage={kind} />
      <main className="flex-1 pt-32 pb-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10">
            <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-neon-500 bg-neon-500/10 border border-neon-500/20 px-2.5 py-1 rounded-md mb-4">
              {meta.badge}
            </span>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">{meta.title}</h1>
            <p className="text-lg text-zinc-400 leading-relaxed">{meta.description}</p>
          </div>

          <Content />

          <div className="mt-14 flex items-center gap-3 bg-surface border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-sm text-gray-500">
              Une question sur {kind === 'cgu' ? 'ces conditions' : kind === 'cookies' ? 'cette politique' : 'cette page'} ?{' '}
              <a href="mailto:resellosapp@gmail.com" className="text-neon-500 hover:underline">resellosapp@gmail.com</a>
            </p>
          </div>
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-black mb-3">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-3 text-[15px]">{children}</div>
    </section>
  );
}

function CguContent() {
  return (
    <div>
      <Section title="1. Objet">
        <p>
          Resell OS est un outil pour les revendeurs sur Vinted : génération d'annonces par IA, synchronisation du
          stock, détection d'opportunités sur le marché, comptabilité et une communauté. Le service est conçu
          spécifiquement pour Vinted — il ne couvre aucune autre marketplace.
        </p>
      </Section>

      <Section title="2. Qui édite Resell OS">
        <p>
          Resell OS est développé et exploité à titre individuel par Alexis Dzikowski, sans équipe. Contact :
          resellosapp@gmail.com.
        </p>
      </Section>

      <Section title="3. Ton compte">
        <p>
          Un compte se crée avec une adresse email et un mot de passe. Tu es responsable de la confidentialité de
          tes identifiants et de tout ce qui se passe depuis ton compte. Le service s'adresse à des personnes
          majeures ou disposant de l'accord d'un représentant légal.
        </p>
      </Section>

      <Section title="4. L'extension Chrome et ton compte Vinted">
        <p>
          Certaines fonctionnalités (synchronisation, publication, modification d'annonce) nécessitent l'extension
          Chrome Resell OS, connectée à ton compte Vinted. Règle non négociable : aucune action n'est jamais
          effectuée sur ton compte Vinted sans que tu la déclenches et la confirmes toi-même. Il n'y a aucun robot
          qui agit seul en arrière-plan.
        </p>
      </Section>

      <Section title="5. Plans et tarifs">
        <p>
          Le plan Free est gratuit et ne demande aucune carte bancaire. Les plans Pro et Team sont payants et
          facturés en ligne par abonnement (mensuel ou annuel), via notre prestataire de paiement Stripe — nous ne
          stockons jamais tes coordonnées bancaires, elles sont saisies et conservées directement chez Stripe. Tu
          peux annuler ton abonnement à tout moment depuis ton espace Facturation ; l'accès reste actif jusqu'à la
          fin de la période déjà payée.
        </p>
      </Section>

      <Section title="6. Utilisation autorisée">
        <p>
          Tu utilises Resell OS pour ton activité de revente personnelle ou celle de ton équipe (plan Team). Tu
          restes seul responsable du contenu de tes annonces et du respect des règles propres à Vinted. Toute
          tentative de contourner les limites du service (partage de compte hors plan Team, usage automatisé non
          prévu, etc.) peut entraîner une suspension.
        </p>
      </Section>

      <Section title="7. Estimations et données de marché">
        <p>
          Les prix suggérés par l'IA, les scores et les opportunités affichées sont soit des estimations, soit basés
          sur des données réellement observées sur Vinted — jamais un mélange non signalé des deux. Ce sont des
          aides à la décision, pas des garanties de vente ou de prix.
        </p>
      </Section>

      <Section title="8. Intelligence artificielle et plateformes tierces">
        <p>
          Le Générateur IA de Resell OS s'appuie sur un modèle d'intelligence artificielle tiers (Google Gemini)
          pour analyser tes photos et rédiger des propositions de titre, description et prix. Ce contenu généré est
          une proposition, pas une publication automatique : il te reste soumis pour relecture et validation avant
          toute mise en ligne sur Vinted, et tu en restes seul responsable une fois publié. Resell OS interagit
          également avec la plateforme Vinted (lecture et, à ta demande explicite, publication ou modification
          d'annonces) exclusivement via l'extension Chrome décrite à l'article 4 — jamais en ton nom sans action de
          ta part.
        </p>
      </Section>

      <Section title="9. Disponibilité du service">
        <p>
          Resell OS est en bêta privée : des fonctionnalités peuvent évoluer, être ajoutées ou retirées, et des
          interruptions ponctuelles peuvent survenir. Les changements notables sont publiés dans le Changelog de
          l'espace Communauté.
        </p>
      </Section>

      <Section title="10. Résiliation">
        <p>
          Tu peux arrêter d'utiliser Resell OS à tout moment. La suppression définitive de ton compte et de tes
          données se fait sur simple demande à resellosapp@gmail.com.
        </p>
      </Section>

      <Section title="11. Évolution de ces conditions">
        <p>
          Ces conditions peuvent évoluer pendant la bêta. Les changements importants seront annoncés dans le
          Changelog. La poursuite de l'utilisation du service vaut acceptation de la version en vigueur.
        </p>
      </Section>

      <Section title="12. Droit applicable">
        <p>Ces conditions sont soumises au droit français.</p>
      </Section>
    </div>
  );
}

function ConfidentialiteContent() {
  return (
    <div>
      <Section title="1. Qui traite tes données">
        <p>
          Alexis Dzikowski, éditeur de Resell OS, est responsable du traitement des données décrites ici. Contact :
          resellosapp@gmail.com.
        </p>
      </Section>

      <Section title="2. Données collectées">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Ton email et ton mot de passe (chiffré, jamais lisible en clair) au moment de la création du compte.</li>
          <li>Les informations de profil que tu renseignes (nom, préférences).</li>
          <li>
            Les données de tes annonces Vinted (titre, prix, statut, photos) une fois l'extension connectée et une
            synchronisation lancée.
          </li>
          <li>Les photos que tu envoies au Générateur IA, le temps de l'analyse.</li>
          <li>Des données d'usage techniques (crédits consommés, historique des actions déclenchées).</li>
        </ul>
      </Section>

      <Section title="3. Pourquoi ces données">
        <p>
          Uniquement pour faire fonctionner Resell OS : générer tes annonces, afficher ton stock réel, calculer ta
          comptabilité, détecter des opportunités et te permettre d'échanger dans l'espace Communauté. Aucune
          donnée n'est vendue ni partagée à des fins publicitaires.
        </p>
      </Section>

      <Section title="4. Qui héberge et traite ces données">
        <p>Resell OS s'appuie sur un nombre restreint de sous-traitants, chacun limité à un rôle précis :</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><span className="text-gray-900 font-medium">Supabase</span> — base de données, authentification et stockage des fichiers (photos, factures).</li>
          <li><span className="text-gray-900 font-medium">Google Gemini</span> — analyse des photos et génération des propositions d'annonces ; seules les photos que tu soumets volontairement lui sont envoyées, le temps de l'analyse.</li>
          <li><span className="text-gray-900 font-medium">Stripe</span> — traitement des paiements des plans Pro et Team ; tes coordonnées bancaires ne transitent jamais par nos serveurs.</li>
          <li><span className="text-gray-900 font-medium">Resend</span> — envoi des emails transactionnels (confirmation de compte, notifications importantes) ; seule ton adresse email et le contenu du message concerné lui sont transmis.</li>
          <li><span className="text-gray-900 font-medium">Discord</span> — si tu choisis de rejoindre notre serveur communautaire, ton pseudo Discord est visible dans ce cadre, hors de Resell OS.</li>
        </ul>
        <p>
          Ces prestataires peuvent traiter des données en dehors de l'Union européenne ; nous n'utilisons que le
          strict nécessaire à leur fonctionnement et aucun d'eux n'est autorisé à réutiliser tes données à ses
          propres fins.
        </p>
      </Section>

      <Section title="5. Durée de conservation">
        <p>
          Tes données sont conservées tant que ton compte existe. En cas de suppression de compte, tes données
          personnelles et celles de tes annonces sont supprimées de la base ; certaines données déjà anonymisées
          (statistiques de marché) peuvent être conservées.
        </p>
      </Section>

      <Section title="6. Tes droits">
        <p>
          Conformément au RGPD, tu peux demander l'accès, la rectification, l'export ou la suppression de tes
          données à tout moment en écrivant à resellosapp@gmail.com. Tu peux aussi introduire une réclamation
          auprès de la CNIL.
        </p>
      </Section>

      <Section title="7. Cookies et stockage local">
        <p>
          Resell OS utilise le stockage local de ton navigateur pour garder ta session connectée. Aucun cookie
          publicitaire ou de tracking tiers n'est utilisé.
        </p>
      </Section>

      <Section title="8. Sécurité">
        <p>
          Les accès à la base de données sont protégés par les règles de sécurité au niveau des lignes (RLS) :
          chaque utilisateur ne peut techniquement accéder qu'à ses propres données.
        </p>
      </Section>

      <Section title="9. Évolution de cette politique">
        <p>
          Cette politique peut évoluer pendant la bêta, notamment si de nouveaux traitements de données sont
          introduits. Les changements importants seront annoncés dans le Changelog.
        </p>
      </Section>
    </div>
  );
}

function MentionsLegalesContent() {
  return (
    <div>
      <Section title="1. Éditeur du site">
        <p>
          Le site resellosapp.com et l'application Resell OS sont édités à titre individuel par Alexis Dzikowski.
        </p>
        <p className="text-sm text-gray-500 italic">
          Statut juridique, numéro SIRET et adresse du siège : en cours de formalisation (activité en amorçage).
          Ces informations seront complétées ici dès l'immatriculation effective, comme l'exige la loi.
        </p>
        <p>Contact : resellosapp@gmail.com.</p>
      </Section>

      <Section title="2. Directeur de la publication">
        <p>Alexis Dzikowski, éditeur du site.</p>
      </Section>

      <Section title="3. Hébergement">
        <p>
          L'application web (frontend) est hébergée par Vercel Inc. La base de données, l'authentification et les
          fichiers utilisateurs sont hébergés par Supabase Inc. — voir la{' '}
          <span className="italic">Politique de confidentialité</span> pour le détail des sous-traitants et de
          leurs rôles respectifs.
        </p>
      </Section>

      <Section title="4. Propriété intellectuelle">
        <p>
          La marque Resell OS, son interface et son code sont la propriété d'Alexis Dzikowski. Les annonces, photos
          et données de stock que tu importes ou génères via le service restent ta propriété.
        </p>
      </Section>

      <Section title="5. Contact">
        <p>
          Pour toute question relative au site, à ces mentions ou à un signalement, écris à
          resellosapp@gmail.com.
        </p>
      </Section>
    </div>
  );
}

function CookiesContent() {
  return (
    <div>
      <Section title="1. Ce que Resell OS ne fait pas">
        <p>
          Resell OS n'utilise aucun cookie publicitaire, aucun traceur tiers de mesure d'audience (type Google
          Analytics) et aucun pixel de reciblage. Aucun bandeau de consentement cookies n'est donc affiché : il n'y
          a rien à consentir, faute de traceur non essentiel.
        </p>
      </Section>

      <Section title="2. Ce que Resell OS stocke dans ton navigateur">
        <p>
          Pour garder ta session connectée, Resell OS s'appuie sur le stockage local de ton navigateur
          (localStorage), géré par Supabase Auth, plutôt que sur des cookies classiques. Ce stockage est
          strictement technique et indispensable au fonctionnement du service : sans lui, tu devrais te reconnecter
          à chaque page. Il n'est lu par aucun tiers.
        </p>
      </Section>

      <Section title="3. Ressources tierces chargées par la page">
        <p>
          La seule ressource externe chargée par le site est une police de caractères servie par Google Fonts. Ce
          chargement ne dépose aucun cookie de suivi ; il sert uniquement à afficher la typographie du site.
        </p>
      </Section>

      <Section title="4. Comment effacer ces données">
        <p>
          Tu peux à tout moment vider le stockage local de Resell OS depuis les réglages de ton navigateur
          (données de site pour resellosapp.com), ce qui te déconnectera simplement de l'application.
        </p>
      </Section>
    </div>
  );
}
