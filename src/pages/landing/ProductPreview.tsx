import { Shirt, RefreshCw, MessageSquare, ReceiptEuro, Clock } from 'lucide-react';
import { DiscordIcon } from '../../components/ui/DiscordIcon';
import { BRAND_VIOLET } from '../../lib/brandColors';
import { FeatureVisual } from './Features';

// Refonte complete (audit personnel utilisateur, 2026-08-01) : l'ancienne
// version reproduisait une capture d'ecran quasi complete du Dashboard --
// trop dense. Corrigee vers 5 icones "mysterieuses" (aucune donnee
// chiffree) pour donner envie de decouvrir le produit plutot que de tout
// montrer avant l'inscription.
//
// Refonte 2026-08-28 (retour "standard Linear/Vercel, elimine le rendu
// template IA") -- INVERSE DELIBEREMENT la decision du 2026-08-01 ci-dessus :
// remplace la ligne uniforme d'icones par une bento grid asymetrique avec
// de VRAIS micro-apercus produit (statuts d'annonces, KPI de comptabilite),
// exactement ce que "mysterieux, zero donnee" excluait. Signale a
// l'utilisateur avant execution -- ce round est explicite au point de
// nommer "tags de prix, graphiques de marge nette, files d'attente", donc
// execute tel quel plutot que redemande une confirmation deja implicite
// dans la precision de la demande.
//
// Deux points de cadrage RECONFIRMES (memes reponses que les 2 rounds
// precedents sur HeroComparison.tsx, meme session) :
// - Theme CLAIR conserve (l'utilisateur proposait lui-meme "bordures
//   ultra-fines" en alternative au sombre) -- un dark mode ici recreerait
//   le probleme "deux produits differents" corrige le 2026-08-24.
// - Aucune donnee inventee pour Communication : module non construit (voir
//   Features.tsx, "(bientot)" partout) -- reste visuellement en retrait,
//   jamais au meme rang que les 4 modules reels (regle deja actee, voir
//   docs/DRESSING_EXPERIENCE.md section 8, independante du gel du concept
//   lui-meme).
//
// Donnees des visuels : reprises TELLES QUELLES de Features.tsx (memes
// chiffres/noms d'annonces partout sur la landing, jamais deux jeux de
// donnees factices divergents pour la meme fonctionnalite -- voir
// FeatureVisual, desormais exporte).
const GENERATOR_EXAMPLE = { title: 'Polo Ralph Lauren homme bleu marine taille L', price: '35 €' };

export function ProductPreview() {
  return (
    <section className="pt-16 pb-16 sm:pb-24">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          {/* Meme traitement que l'eyebrow du Hero ("PLATEFORME TOUT-EN-UN
              POUR REVENDEURS") : gris neutre, pas un accent colore -- un
              eyebrow nomme une categorie, il ne reclame pas l'attention. */}
          <p className="text-sm font-semibold tracking-[0.2em] uppercase text-gray-500 mb-4">
            Aperçu de la plateforme
          </p>

          <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-none text-gray-900">
            Une seule plateforme.
            <br />
            Tout votre business.
          </h2>

          <p className="mt-6 text-gray-600 max-w-3xl mx-auto text-lg leading-8">
            Tout ce qu'il faut pour gérer ton activité Vinted, sans changer d'outil.
          </p>
        </div>

        {/* Bento asymetrique : le module hero (Republication) occupe 2x2 --
            c'est la fonctionnalite qui rend le plus de temps au revendeur,
            elle porte donc le plus de poids visuel (contraste relatif,
            playbook principe #3 -- jamais une taille choisie "pour faire
            joli"). Comptabilite en second (2x1, donnee la plus riche apres
            l'automatisation). Generateur/Discord en support (1x1 chacun).
            Communication en bande complete mais VISUELLEMENT PLUS DISCRETE
            (fond uni, pas de bordure surelevee, pas de shadow) -- jamais au
            meme rang que les 4 modules reels. */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-5">
          {/* A. Republication -- hero */}
          <div className="sm:col-span-2 sm:row-span-2 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xl shadow-gray-900/[0.06] flex flex-col">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 bg-white border border-gray-200 flex-shrink-0">
              <RefreshCw className="w-5 h-5" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">Zéro effort, tes articles tournent seuls.</h3>
            <p className="text-sm text-gray-600 mb-6 max-w-sm">
              Republication programmée ou en un clic, statut Vinted toujours à jour, pendant que tu fais autre chose.
            </p>
            <div className="mt-auto">
              <FeatureVisual kind="stock" />
            </div>
          </div>

          {/* B. Comptabilite */}
          <div className="sm:col-span-2 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white border border-gray-200 flex-shrink-0">
                <ReceiptEuro className="w-4 h-4" style={{ color: BRAND_VIOLET }} />
              </div>
              <h3 className="text-base sm:text-lg font-black text-gray-900">Tréso, marges & URSSAF en direct.</h3>
            </div>
            <FeatureVisual kind="accounting" />
          </div>

          {/* C. Generateur IA -- meme nom que Features.tsx/HeroComparison,
              coherence de marque deja etablie sur toute la landing. */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-white border border-gray-200 flex-shrink-0">
              <Shirt className="w-4 h-4" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-sm font-black text-gray-900 mb-1">Générateur IA</h3>
            <p className="text-xs text-gray-500 mb-4">Photo → fiche complète, prête à publier.</p>
            <div className="mt-auto rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-900 leading-snug">{GENERATOR_EXAMPLE.title}</p>
              <p className="font-black text-sm mt-1.5" style={{ color: BRAND_VIOLET }}>{GENERATOR_EXAMPLE.price}</p>
            </div>
          </div>

          {/* D. Discord -- aucun chiffre invente (pas de "N membres" sans
              donnee reelle a afficher, playbook G.7 : preuves reelles ou
              rien). */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-white border border-gray-200 flex-shrink-0">
              <DiscordIcon className="w-4 h-4" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-sm font-black text-gray-900 mb-1">Le QG des Resellers</h3>
            <p className="text-xs text-gray-500 mt-auto">Échange en direct avec les autres revendeurs et l'équipe ResellOS.</p>
          </div>

          {/* E. Communication -- non construit (voir Features.tsx, tout en
              "(bientot)"). Delibarement plus discret : fond gris uni,
              aucune ombre, aucune bordure violette -- jamais presente au
              meme rang qu'une fonctionnalite reelle. */}
          <div className="sm:col-span-4 rounded-2xl bg-gray-50 border border-gray-200 border-dashed p-5 flex items-center gap-3">
            <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-600">Communication</span>
            <span className="text-xs text-gray-500">— réponses suggérées, messages automatiques aux favoris</span>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-gray-500 flex-shrink-0">
              <Clock className="w-3.5 h-3.5" />
              Bientôt
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
