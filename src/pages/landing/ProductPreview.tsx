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
// Historique complet du 2026-08-28 (meme session) : bento grid avec vraies
// donnees -> reconciliation en selection interactive (mysterieux par
// defaut, revele au survol/clic) -> CE ROUND, qui revient a une bento grid
// mais en integrant Communication au meme rang que les 4 modules reels.
//
// POINT DE VIGILANCE EXPLICITE (question posee, reponse actee) :
// Communication n'est PAS construite (voir Features.tsx, tout en
// "(bientot)") -- l'integrer visuellement "au meme niveau" (meme taille,
// meme traitement de carte) que Republication/Comptabilite/Generateur/
// Discord est une INTEGRATION DE MISE EN PAGE, jamais une affirmation
// qu'elle fonctionne. Sa carte reste donc honnete : badge "Bientot"
// visible, aucun faux statut/aucune fausse donnee de messagerie qui la
// ferait passer pour une capture reelle (playbook G.6 : "chaque visuel
// doit correspondre a une fonctionnalite qui existe vraiment aujourd'hui").
//
// Theme clair conserve (meme arbitrage que tous les rounds precedents sur
// cette landing).
const GENERATOR_EXAMPLE = { title: 'Polo Ralph Lauren homme bleu marine taille L', price: '35 €' };

export function ProductPreview() {
  return (
    <section className="pt-16 pb-16 sm:pb-24">
      <div className="max-w-6xl mx-auto px-4">
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

        {/* Hero pleine largeur (Republication -- fonctionnalite qui rend le
            plus de temps, playbook principe #3 : contraste relatif) +
            rangee de 4 tuiles STRICTEMENT identiques en taille/style en
            dessous (Comptabilite/Generateur/Discord/Communication) --
            variete de composition entre le hero (icone+texte+visuel cote a
            cote) et les tuiles (empilees), playbook principe #7. */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xl shadow-gray-900/[0.06] mb-4 sm:mb-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 bg-white border border-gray-200">
                <RefreshCw className="w-5 h-5" style={{ color: BRAND_VIOLET }} />
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">Zéro effort, tes articles tournent seuls.</h3>
              <p className="text-sm text-gray-600 max-w-sm">
                Republication programmée ou en un clic, statut Vinted toujours à jour, pendant que tu fais autre chose.
              </p>
            </div>
            <FeatureVisual kind="stock" />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Comptabilite -- version compacte (2 KPI plutot que les 4 de
              Features.tsx) : memes chiffres reels, simplement cadres pour
              une tuile etroite (playbook, section D : "cadrer/zoomer sur la
              partie qui raconte l'histoire" plutot que tout montrer a
              l'etroit). */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-white border border-gray-200">
              <ReceiptEuro className="w-4 h-4" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-sm font-black text-gray-900 mb-1">Tréso & marges en direct</h3>
            <p className="text-xs text-gray-500 mb-4">Chiffre d'affaires, bénéfice, URSSAF.</p>
            <div className="mt-auto space-y-2">
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
                <p className="font-black text-sm" style={{ color: BRAND_VIOLET }}>1 240 €</p>
                <p className="text-gray-500 text-[10px]">Chiffre d'affaires</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
                <p className="font-black text-sm" style={{ color: BRAND_VIOLET }}>+326 €</p>
                <p className="text-gray-500 text-[10px]">Bénéfice net</p>
              </div>
            </div>
          </div>

          {/* Generateur IA -- meme nom que Features.tsx/HeroComparison. */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-white border border-gray-200">
              <Shirt className="w-4 h-4" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-sm font-black text-gray-900 mb-1">Générateur IA</h3>
            <p className="text-xs text-gray-500 mb-4">Photo → fiche complète, prête à publier.</p>
            <div className="mt-auto rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-900 leading-snug">{GENERATOR_EXAMPLE.title}</p>
              <p className="font-black text-sm mt-1.5" style={{ color: BRAND_VIOLET }}>{GENERATOR_EXAMPLE.price}</p>
            </div>
          </div>

          {/* Discord -- aucun chiffre de membres invente (playbook G.7 :
              preuves reelles ou rien). */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-white border border-gray-200">
              <DiscordIcon className="w-4 h-4" style={{ color: BRAND_VIOLET }} />
            </div>
            <h3 className="text-sm font-black text-gray-900 mb-1">Le QG des Resellers</h3>
            <p className="text-xs text-gray-500 mt-auto">Échange en direct avec les autres revendeurs et l'équipe ResellOS.</p>
          </div>

          {/* Communication -- MEME taille/style de carte que les 3 tuiles
              ci-dessus (integration demandee), mais contenu honnete : badge
              "Bientot" toujours visible, aucun faux message/statut qui la
              ferait passer pour une fonctionnalite reelle (voir le
              commentaire d'en-tete de ce fichier). */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white border border-gray-200">
                <MessageSquare className="w-4 h-4" style={{ color: BRAND_VIOLET }} />
              </div>
              <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" />
                Bientôt
              </span>
            </div>
            <h3 className="text-sm font-black text-gray-900 mb-1">Communication</h3>
            <p className="text-xs text-gray-500 mt-auto">Réponses suggérées, messages automatiques aux favoris.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
