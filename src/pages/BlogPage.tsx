import { useEffect, useState, type FormEvent } from 'react';
import {
  User, Sparkles, Code2, Rss, Newspaper,
  Target, ShieldCheck, Layers, Mail, ArrowRight, Check, X,
  Puzzle, Bot, ImageIcon, LayoutDashboard, Globe, Phone, Send, CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import type { AppPage } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Navbar } from './landing/Navbar';
import { Footer } from './landing/Footer';
import { EmptyState } from '../components/ui/EmptyState';
import { ContactModal } from '../components/ui/ContactModal';
import { DiscordIcon } from '../components/ui/DiscordIcon';
import dzikoPhoto from '../assets/dziko-profile.png';

interface BlogPageProps {
  onNavigate: (page: AppPage) => void;
}

// Simplification (audit personnel utilisateur, 2026-08-01) : "Qui je suis"
// et "Mon parcours" fusionnes en une seule section narrative ; "Pourquoi
// j'ai cree Resell OS" absorbe l'ancienne section "Ma vision" -- tout ce
// qui concerne ResellOS/la creation/la vision/les objectifs regroupe au
// meme endroit plutot que disperse sur plusieurs sections.
type SectionId = 'qui-je-suis' | 'pourquoi' | 'coulisses' | 'mises-a-jour' | 'blog';

const SECTIONS: { id: SectionId; icon: LucideIcon; label: string }[] = [
  { id: 'qui-je-suis', icon: User, label: 'Qui je suis' },
  { id: 'pourquoi', icon: Sparkles, label: "Pourquoi j'ai créé Resell OS" },
  { id: 'coulisses', icon: Code2, label: 'Les coulisses du développement' },
  { id: 'mises-a-jour', icon: Newspaper, label: 'Les mises à jour du produit' },
  { id: 'blog', icon: Rss, label: 'Les articles de blog' },
];

const INTERESTS = ['Musique', 'Audiovisuel', 'Informatique', 'Skate', 'Littérature', 'Social', 'Art'];

const PRINCIPLES = [
  {
    icon: Target,
    title: 'Un seul marketplace, bien fait',
    description:
      "Resell OS ne cherche pas a couvrir tous les marketplaces a la fois. Il se concentre sur Vinted, pour construire des outils qui collent vraiment a ses regles, ses prix et ses usages -- plutot qu'une couche generique qui fait tout a moitie.",
  },
  {
    icon: ShieldCheck,
    title: 'Jamais de donnee inventee',
    description:
      "Chaque prix, chaque estimation, chaque recommandation affichee dans Resell OS est soit une donnee reelle observee sur le marche, soit clairement etiquetee comme une estimation. Le produit prefere dire \"je ne sais pas\" plutot que d'afficher un chiffre invente avec assurance.",
  },
  {
    icon: Layers,
    title: 'Automatisation prudente',
    description:
      "Modifier une annonce reste, aujourd'hui, une action que l'utilisateur declenche et confirme -- jamais un robot qui agit seul sur un compte Vinted. La publication automatique suivra le meme principe des sa reactivation (temporairement en pause le temps d'un correctif). C'est un choix deliberement plus lent, pour rester fiable et respecter les regles de la plateforme.",
  },
];

// Elargi (retour utilisateur 2026-08-04) : montrer vraiment tout ce que ca
// prend de faire tourner le produit -- pas seulement les briques
// techniques du coeur du produit, aussi la communaute et l'infra.
const COULISSES = [
  { icon: Code2, title: 'Développement solo', description: "Chaque écran, chaque ligne de code, chaque correction de bug -- une seule personne, sans équipe." },
  { icon: Puzzle, title: 'Extension Chrome', description: "Parle réellement à Vinted -- lit et écrit sur la vraie plateforme, pas une simulation." },
  { icon: Bot, title: 'IA de génération', description: "Analyse une photo et rédige titre, description, catégorie, taille et état." },
  { icon: DiscordIcon, title: 'Communauté Discord', description: "Un espace pour échanger en direct avec les premiers utilisateurs de ResellOS." },
  { icon: Globe, title: 'Domaine & hébergement', description: "Nom de domaine, hébergement, base de données -- tout tourne réellement en production." },
  { icon: ShieldCheck, title: 'Confirmation manuelle', description: "Rien ne se modifie sur ton compte Vinted sans que tu le valides toi-même -- la publication automatique suivra le même principe dès sa réactivation." },
];

// Emplacements reserves pour de vraies captures (audit personnel utilisateur,
// 2026-08-03) -- design pret des maintenant, jamais de fausse capture
// generee en attendant. Libelles precises (retour du 2026-08-04) : chaque
// emplacement dit precisement ce qu'il accueillera plus tard.
const COULISSES_PREVIEWS = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: Puzzle, label: 'Extension Chrome' },
  { icon: Bot, label: "Résultat généré par l'IA" },
  { icon: Code2, label: "Aperçu de l'environnement de développement" },
];

// Timeline retracant le parcours -- ages precis (retour utilisateur
// 2026-08-04, remplace la version generique) : mêmes faits que "Qui je
// suis" ci-dessous, juste une lecture rapide en complement du texte.
const TIMELINE = [
  { age: '10 ans', label: 'Découverte du beatbox' },
  { age: '15 ans', label: 'Premier essai de revente' },
  { age: '18-19 ans', label: 'Nouvelles tentatives et premiers projets' },
  { age: '20 ans', label: 'Reprise sérieuse de Vinted et création de ResellOS' },
  { age: "Aujourd'hui", label: 'Construction de la bêta' },
];

// 3 changements reels et recents du produit (traduits en langage utilisateur
// depuis l'historique de commits reel -- jamais un numero de version ou un
// changelog invente : ResellOS n'a pas de schema de versioning public,
// donc pas de "vX.X" affiche ici). Liste maintenue a la main -- voir
// UPDATES_SNAPSHOT_DATE ci-dessous, honnetement etiquetee comme un apercu
// fige plutot qu'un flux automatique (retour utilisateur 2026-08-04 :
// risque d'obsolescence sinon).
const RECENT_UPDATES = [
  'Logo ResellOS sur l\'écran du Générateur IA',
  'Message de scan plus clair en cas de simple timeout',
  'Vérification titre/description assouplie (Modifier une annonce)',
];
const UPDATES_SNAPSHOT_DATE = 'août 2026';

// Page "A propos" -- sidebar de titres cliquables (demande produit
// 2026-07-30) : chaque titre affiche SA page dediee a droite, jamais tout
// empile sur un seul long scroll. Contenu biographique fourni directement
// par l'utilisateur (CV + photo reels), aucun detail invente.
export default function BlogPage({ onNavigate }: BlogPageProps) {
  const { user } = useAuth();
  // Deep-link leger depuis le footer ("Version beta" -> onglet Mises a jour),
  // sans faire porter une section a AppPage/App.tsx pour un seul lien.
  // Lecture seule dans l'initializer (StrictMode l'appelle deux fois en dev
  // -- un removeItem() ici casserait la 2e lecture) ; le nettoyage se fait
  // a part, dans l'effet ci-dessous.
  const [active, setActive] = useState<SectionId>(
    () => (sessionStorage.getItem('resellos:blogSection') as SectionId | null) ?? 'qui-je-suis'
  );
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem('resellos:blogSection');
  }, []);

  // Candidature "rejoindre les coulisses" -- capture reelle (table
  // team_applications), traitement manuel par email, aucune reponse
  // automatique promise (demande produit 2026-08-04).
  const [teamForm, setTeamForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [teamSubmitted, setTeamSubmitted] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Deep-link vers l'onglet Changelog de l'espace Communaute -- meme
  // technique que resellos:blogSection (sessionStorage lu une seule fois au
  // montage de DashboardLayout, cf. la meme note StrictMode). Corrige un bug
  // reel (retour utilisateur 2026-08-04) : ce bouton renvoyait au Dashboard
  // generique au lieu de l'espace Communaute demande.
  const goToCommunityChangelog = () => {
    if (!user) {
      onNavigate('auth');
      return;
    }
    sessionStorage.setItem('resellos:dashboardPage', 'community');
    onNavigate('dashboard');
  };

  const handleTeamApplicationSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTeamSubmitting(true);
    setTeamError(null);
    const { error } = await supabase.from('team_applications').insert({
      first_name: teamForm.firstName.trim(),
      last_name: teamForm.lastName.trim(),
      email: teamForm.email.trim(),
      phone: teamForm.phone.trim() || null,
    });
    setTeamSubmitting(false);
    if (error) {
      setTeamError("Impossible d'envoyer ta candidature pour le moment. Réessaie plus tard.");
      return;
    }
    setTeamSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-dark-400 text-gray-900 flex flex-col">
      <Navbar onNavigate={onNavigate} currentPage="blog" />
      <main className="flex-1 pt-32 pb-28 px-4 sm:px-6">
        <div className="max-w-[1360px] mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">À propos</h1>
            <p className="text-lg text-zinc-400 leading-relaxed">
              Dziko — la personne derrière Resell OS.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
            {/* Sidebar de navigation -- desktop: colonne verticale fixe.
                Mobile: rangee horizontale scrollable de pills. Le fondu a
                droite (mobile uniquement) signale qu'il y a d'autres
                sections a faire defiler -- sans lui, "Les articles de
                blog" etc. restaient invisibles sans aucun indice. */}
            <div className="relative lg:contents">
              <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:w-72 flex-shrink-0">
                {SECTIONS.map(({ id, icon: Icon, label }) => {
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActive(id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left whitespace-nowrap lg:whitespace-normal flex-shrink-0 transition-all duration-200 ${
                      isActive
                        ? 'bg-neon-500/10 text-neon-500 font-semibold shadow-[0_0_16px_rgba(124,92,255,0.08)]'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0 text-neon-500" />
                    {label}
                  </button>
                );
              })}
              </nav>
              <div className="lg:hidden pointer-events-none absolute top-0 right-0 bottom-2 w-10 bg-gradient-to-l from-white to-transparent" />
            </div>

            {/* Contenu de la section active uniquement */}
            <div className="flex-1 min-w-0">
              {active === 'qui-je-suis' && (
                <div>
                  <div className="flex items-center gap-4 mb-10">
                    <img
                      src={dzikoPhoto}
                      alt="Dziko"
                      className="w-20 h-20 aspect-square object-cover rounded-2xl border border-gray-200 flex-shrink-0"
                    />
                    <h2 className="text-2xl font-black">Qui je suis</h2>
                  </div>

                  {/* Mini-resume -- premiere chose lue, avant l'histoire
                      complete (retour utilisateur 2026-08-04). */}
                  <p className="max-w-3xl text-lg text-gray-800 font-medium leading-relaxed mb-8">
                    Artiste, revendeur et fondateur de ResellOS. Je construis aujourd'hui les outils que j'aurais
                    aimé avoir lorsque j'ai commencé.
                  </p>

                  <div className="max-w-3xl space-y-6 text-gray-700 leading-8">
                    <p>Hey ! Moi, c'est Dziko.</p>
                    <p>J'ai 20 ans et je viens du nord de la France.</p>
                  </div>

                  {/* Timeline -- lecture rapide du parcours en complement du
                      texte, aucun fait qui ne soit deja dans le texte
                      ci-dessous. Ages precis (retour utilisateur 2026-08-04)
                      plutot que des etapes generiques. */}
                  <ol className="my-10 max-w-3xl">
                    {TIMELINE.map(({ age, label }, i) => {
                      const isLast = i === TIMELINE.length - 1;
                      return (
                        <li key={label} className="relative pl-7 pb-6 last:pb-0">
                          {!isLast && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-100" />}
                          <span
                            className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 ${
                              isLast ? 'bg-neon-500 border-neon-500' : 'bg-dark-400 border-gray-200'
                            }`}
                          />
                          <span className={`text-[10px] font-mono uppercase tracking-wider ${isLast ? 'text-neon-500' : 'text-gray-500'}`}>
                            {age}
                          </span>
                          <span className={`block text-sm ${isLast ? 'text-neon-500 font-semibold' : 'text-gray-500'}`}>{label}</span>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="max-w-3xl space-y-6 text-gray-700 leading-8">
                    <p>
                      Mon parcours n'a jamais été simple. J'ai grandi dans une situation familiale compliquée, mais
                      j'ai toujours eu cette envie de créer et de construire quelque chose qui ait du sens.
                    </p>
                    <p>
                      À 10 ans, j'ai découvert le beatbox. Plus tard, j'ai obtenu un baccalauréat général avec les
                      spécialités Musique et Humanités, Littérature &amp; Philosophie, avant d'intégrer une école
                      d'art. Malheureusement, une fracture du pied m'a obligé à arrêter cette aventure, et je me
                      suis retrouvé avec près de 12 000 € de dettes.
                    </p>
                    <p>
                      Pour avancer, j'ai enchaîné plusieurs métiers : intérimaire en logistique, prospecteur,
                      démarcheur en porte-à-porte... Rien de glamour, mais ces expériences m'ont appris la
                      rigueur, le contact humain et la persévérance. Malgré tout, j'ai toujours senti que ce
                      n'était pas ma voie.
                    </p>
                    <p>
                      J'ai découvert l'achat-revente sur Vinted à 15 ans. J'ai essayé une première fois, puis une
                      deuxième, puis une troisième... sans jamais vraiment persévérer. À 20 ans, j'ai décidé de
                      reprendre ce projet sérieusement et de m'y investir à 100 %.
                    </p>
                    <p>
                      En parallèle, j'ai aussi dû me reconstruire personnellement. J'ai réussi à sortir
                      d'addictions qui ont occupé plusieurs années de ma vie. Je faisais plusieurs nuits blanches
                      par semaine parce qu'au fond de moi, je savais que je n'étais pas à ma place.
                    </p>
                    <p className="font-semibold text-gray-900">Aujourd'hui, je me relève.</p>
                  </div>

                  <div className="max-w-3xl my-10 h-px bg-gray-100" />

                  <div className="max-w-3xl space-y-6 text-gray-700 leading-8">
                    <p>
                      J'ai toujours rêvé de devenir un homme libre, capable de créer, de construire, de partager
                      et surtout de transmettre ce qu'on ne m'a jamais transmis, alors que c'est exactement ce
                      dont j'aurais eu besoin.
                    </p>
                    <p>C'est cette vision qui me pousse chaque jour.</p>
                  </div>

                  <blockquote className="max-w-3xl my-8 border-l-2 border-neon-500/40 pl-5 py-1">
                    <p className="text-xl sm:text-2xl font-black text-gray-900 leading-snug">
                      Le business est mon ascenseur.
                      <br />
                      La musique est ma destination.
                    </p>
                    <p className="text-sm text-gray-500 mt-3">Cette phrase résume tout ce que je construis.</p>
                  </blockquote>

                  <div className="max-w-3xl space-y-6 text-gray-700 leading-8">
                    <p>C'est aussi pour cette raison que j'ai créé ResellOS.</p>
                    <p>
                      Pendant plus de cinq mois, j'ai conçu une solution que j'aurais aimé avoir lorsque je
                      revendais sur Vinted. J'ai compris les difficultés, les tâches répétitives et tout ce qui
                      faisait perdre du temps aux revendeurs. Alors, au lieu de simplement les accepter, j'ai
                      décidé de construire un outil pour les résoudre.
                    </p>
                    <p>Aujourd'hui, ResellOS est cette solution.</p>
                    <p>
                      Mon objectif est simple : aider les revendeurs Vinted à gagner du temps, mieux s'organiser
                      et développer leur activité. Et, demain, pourquoi ne pas accompagner également les
                      revendeurs sur d'autres plateformes ?
                    </p>
                    <p>
                      Enfin, j'espère surtout prouver une chose : peu importe d'où l'on part, il est toujours
                      possible d'aller beaucoup plus loin que ce que l'on imaginait.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-10 max-w-3xl">
                    {INTERESTS.map((interest) => (
                      <span key={interest} className="text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {active === 'pourquoi' && (
                <div>
                  <h2 className="text-2xl font-black mb-4">Pourquoi j'ai créé Resell OS</h2>
                  <p className="max-w-3xl text-gray-700 leading-8 mb-12">
                    Concrètement, j'ai créé Resell OS parce que les photos me prenaient trop de temps, la
                    gestion des SKU était pénible, et suivre ma comptabilité à la lettre — mes marges, mes
                    bénéfices — demandait un travail que je ne faisais jamais correctement. Pareil pour la
                    republication et la gestion de plusieurs comptes Vinted. Alors j'ai construit Resell OS
                    d'abord pour moi, pour gérer mon activité de façon plus professionnelle et plus
                    optimisée. Et si je peux le partager avec d'autres revendeurs, c'est encore mieux — ça
                    permet aussi d'éviter de se faire avoir par les beaux parleurs qui vendent du rêve sur
                    les réseaux sociaux.
                  </p>
                  <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 mb-14">
                    <div className="bg-surface border border-red-500/10 rounded-2xl p-7">
                      <p className="text-xs font-mono uppercase tracking-wider text-red-700 font-bold mb-5">Avant</p>
                      <ul className="space-y-3.5">
                        {['Un tableur pour le stock', 'Des notes pour la comptabilité', "Vinted ouvert dans dix onglets", 'Aucune vue d\'ensemble'].map((t) => (
                          <li key={t} className="flex items-start gap-2.5 text-sm text-gray-500">
                            <X className="w-4 h-4 text-red-700/70 flex-shrink-0 mt-0.5" /> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-dark-400 border border-gray-200 items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="bg-surface border border-green-500/20 rounded-2xl p-7">
                      <p className="text-xs font-mono uppercase tracking-wider text-green-400 font-bold mb-5">Avec Resell OS</p>
                      <ul className="space-y-3.5">
                        {['Annonces générées par IA', 'Stock et comptabilité au même endroit', 'Opportunités détectées automatiquement', 'Un seul système, pensé pour Vinted'].map((t) => (
                          <li key={t} className="flex items-start gap-2.5 text-sm text-gray-700">
                            <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="text-xs font-mono uppercase tracking-wider text-neon-500 font-bold mb-5">Mes principes</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
                    {PRINCIPLES.map(({ icon: Icon, title, description }) => (
                      <div key={title} className="bg-surface border border-gray-200 rounded-2xl p-7 min-h-[220px]">
                        <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center mb-4">
                          <Icon className="w-5 h-5 text-neon-500" />
                        </div>
                        <h3 className="font-bold text-sm mb-2.5">{title}</h3>
                        <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {active === 'coulisses' && (
                <div>
                  <h2 className="text-2xl font-black mb-4">Les coulisses du développement</h2>
                  <p className="max-w-3xl text-gray-700 leading-8 mb-12">
                    Resell OS est construit sans équipe -- juste moi, tout seul. Voici ce que ça prend
                    vraiment pour faire tourner le produit au quotidien, du code jusqu'à la communauté :
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6 mb-12">
                    {COULISSES.map(({ icon: Icon, title, description }) => (
                      <div key={title} className="bg-surface border border-gray-200 rounded-2xl p-7 min-h-[200px]">
                        <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center mb-4">
                          <Icon className="w-5 h-5 text-neon-500" />
                        </div>
                        <h3 className="font-bold text-sm mb-2.5">{title}</h3>
                        <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
                      </div>
                    ))}
                  </div>

                  {/* Emplacement reserve pour de vraies captures, pas encore
                      integrees (demande produit 2026-08-03). */}
                  <p className="text-xs font-mono uppercase tracking-wider text-gray-500 font-bold mb-5">Aperçus à venir</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {COULISSES_PREVIEWS.map(({ icon: Icon, label }) => (
                      <div
                        key={label}
                        className="aspect-[4/3] rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2.5 text-center px-3"
                      >
                        <Icon className="w-5 h-5 text-gray-500" />
                        <ImageIcon className="w-3.5 h-3.5 text-gray-700" />
                        <p className="text-[11px] text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Candidature "rejoindre les coulisses" -- capture reelle,
                      traitement manuel par email (demande produit
                      2026-08-04). */}
                  <div className="max-w-2xl mt-14 bg-surface border border-gray-200 rounded-2xl p-7 sm:p-8">
                    <p className="text-xs font-mono uppercase tracking-wider text-neon-500 font-bold mb-2">Rejoindre les coulisses</p>
                    <h3 className="text-xl font-black mb-2">Envie de rejoindre l'équipe ?</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      Resell OS reste construit seul aujourd'hui, mais ça pourrait changer. Si l'aventure
                      t'intéresse, laisse tes coordonnées -- je recontacte chaque candidature moi-même,
                      pas de réponse automatique.
                    </p>

                    {teamSubmitted ? (
                      <div className="flex items-center gap-3 text-sm text-neon-500 bg-neon-500/10 border border-neon-500/20 rounded-xl px-4 py-3.5">
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                        Candidature envoyée -- je reviens vers toi par email.
                      </div>
                    ) : (
                      <form onSubmit={handleTeamApplicationSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                          <input
                            required
                            type="text"
                            value={teamForm.firstName}
                            onChange={(e) => setTeamForm((f) => ({ ...f, firstName: e.target.value }))}
                            placeholder="Prénom"
                            className="w-full bg-dark-400 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                          />
                        </div>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                          <input
                            required
                            type="text"
                            value={teamForm.lastName}
                            onChange={(e) => setTeamForm((f) => ({ ...f, lastName: e.target.value }))}
                            placeholder="Nom"
                            className="w-full bg-dark-400 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                          />
                        </div>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                          <input
                            required
                            type="email"
                            value={teamForm.email}
                            onChange={(e) => setTeamForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="Email"
                            className="w-full bg-dark-400 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                          />
                        </div>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                          <input
                            type="tel"
                            value={teamForm.phone}
                            onChange={(e) => setTeamForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder="Téléphone (optionnel)"
                            className="w-full bg-dark-400 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                          />
                        </div>

                        {teamError && <p className="sm:col-span-2 text-sm text-red-700">{teamError}</p>}

                        <button
                          type="submit"
                          disabled={teamSubmitting}
                          className="sm:col-span-2 flex items-center justify-center gap-2 bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          {teamSubmitting ? 'Envoi...' : 'Envoyer ma candidature'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {active === 'mises-a-jour' && (
                <div>
                  <h2 className="text-2xl font-black mb-4">Les mises à jour du produit</h2>
                  <p className="max-w-3xl text-gray-700 leading-8 mb-10">
                    Le détail de chaque changement (nouveautés, améliorations, corrections) est publié dans
                    l'onglet Changelog de l'espace Communauté. Un aperçu des derniers changements :
                  </p>

                  <div className="max-w-xl bg-surface border border-gray-200 rounded-2xl p-7 mb-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <p className="text-xs font-mono uppercase tracking-wider text-neon-500 font-bold">Dernières mises à jour</p>
                      <span className="text-[10px] font-mono text-gray-500" title="Sélection mise à jour manuellement, pas un flux automatique">
                        Aperçu figé — {UPDATES_SNAPSHOT_DATE}
                      </span>
                    </div>
                    <ul className="space-y-3.5 mb-6">
                      {RECENT_UPDATES.map((u) => (
                        <li key={u} className="flex items-start gap-2.5 text-sm text-gray-700">
                          <Check className="w-4 h-4 text-neon-500 flex-shrink-0 mt-0.5" /> {u}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={goToCommunityChangelog}
                      className="flex items-center gap-1.5 text-sm font-semibold text-neon-500 hover:underline"
                    >
                      Voir toutes les mises à jour <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={goToCommunityChangelog}
                    className="w-full sm:w-auto flex items-center justify-between gap-6 bg-surface border border-gray-200 hover:border-neon-500/30 rounded-2xl px-6 py-5 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Newspaper className="w-5 h-5 text-neon-500" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm">Changelog — Espace Communauté</p>
                        <p className="text-xs text-gray-500">
                          {user ? 'Ouvrir mon espace Communauté' : "Connecte-toi pour voir l'historique complet"}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-neon-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </button>
                </div>
              )}

              {active === 'blog' && (
                <div>
                  <h2 className="text-2xl font-black mb-4">Les articles de blog</h2>
                  <EmptyState
                    icon={Newspaper}
                    title="Bientôt disponible"
                    description="Inscris-toi à la newsletter pour être prévenu dès le premier article."
                    action={{ label: 'Recevoir la newsletter', onClick: () => onNavigate('newsletter') }}
                    className="!p-6"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setContactOpen(true)}
            className="flex items-center gap-3 bg-surface border border-gray-200 hover:border-neon-500/30 rounded-xl px-5 py-4 mt-12 max-w-2xl mx-auto lg:mx-0 lg:ml-[19rem] w-full text-left transition-all"
          >
            <Mail className="w-4 h-4 text-neon-500 flex-shrink-0" />
            <p className="text-sm text-gray-500">
              Une question, une remarque ?{' '}
              <span className="text-neon-500 font-medium">Envoyer un message</span>
            </p>
          </button>
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </div>
  );
}
