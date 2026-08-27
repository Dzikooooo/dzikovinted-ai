import { useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { FEATURES, FeatureVisual } from './Features';

// Refonte complete (audit personnel utilisateur, 2026-08-01) : l'ancienne
// version reproduisait une capture d'ecran quasi complete du Dashboard --
// trop dense. Corrigee vers 5 icones "mysterieuses" (aucune donnee
// chiffree) pour donner envie de decouvrir le produit plutot que de tout
// montrer avant l'inscription.
//
// Round 2026-08-28 (bento grid + vraies donnees par defaut) puis ROUND
// SUIVANT le meme jour, qui corrige le round bento : l'utilisateur demande
// desormais de RECONCILIER les deux exigences plutot que de choisir --
// structure simple en ligne (comme le 2026-08-01) CONSERVEE, mais chaque
// module revele son vrai aperçu (FeatureVisual, memes donnees que
// Features.tsx) uniquement au survol/clic, jamais par defaut. "Mysterieux
// par defaut" et "montrer du concret" cessent de s'opposer des lors que la
// revelation est un VRAI changement d'etat (interaction reelle), exactement
// ce que le playbook demande (section E : "hover sur un element
// interactif" est explicitement cite comme meritant une animation).
//
// Theme clair conserve (meme arbitrage que les 2 rounds precedents sur
// cette landing) -- le "haut de gamme" vient de la fluidite de la
// transition et de la precision de l'interaction, pas d'un changement de
// theme.
export function ProductPreview() {
  // `hovered` (survol, temporaire) prend le pas sur `pinned` (clic,
  // persiste apres que la souris quitte) -- clic = "je veux le garder
  // affiche", survol = "aperçu rapide en passant". Aucun des deux actif =
  // etat mysterieux d'origine, jamais perdu par defaut.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? pinned;

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

        <div className="rounded-[36px] border border-gray-200 bg-gray-50 px-6 py-12 sm:px-16 sm:py-16">
          {/* Ligne de selection -- structure IDENTIQUE au 2026-08-01 (icone
              au-dessus, libelle en dessous, centre), simplement rendue
              interactive : etat actif = fond/bordure violette (meme
              convention que le tablist de Features.tsx), jamais une
              cinquieme couleur inventee. role="tablist" : semantique
              explicite pour qu'un lecteur d'ecran annonce lequel est
              selectionne, meme discipline que Features.tsx. */}
          <div role="tablist" aria-label="Modules ResellOS" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {FEATURES.map(({ icon: Icon, title }, i) => {
              const isActive = active === i;
              return (
                <button
                  key={title}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setPinned((p) => (p === i ? null : i))}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  className="flex flex-col items-center text-center gap-3 rounded-2xl border p-4 sm:p-5 transition-colors duration-200"
                  style={
                    isActive
                      ? { borderColor: 'rgba(124,92,255,0.3)', backgroundColor: 'rgba(124,92,255,0.08)' }
                      : { borderColor: 'transparent', backgroundColor: 'transparent' }
                  }
                >
                  <Icon className="w-7 h-7 transition-colors duration-200" style={{ color: isActive ? '#7C5CFF' : '#9CA3AF' }} />
                  <p className={`font-bold text-sm sm:text-base transition-colors duration-200 ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                    {title}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Zone de revelation -- hauteur FIXE (jamais de saut de layout
              entre un visuel compact et un visuel dense) : les 5 apercus et
              l'etat par defaut sont tous montes en superposition
              (absolute inset-0) et se crossfadent par opacite, plutot que
              d'etre montes/demontes -- transition fluide immediate au
              survol, jamais un flash de contenu qui se recalcule. */}
          <div className="relative mt-10 sm:mt-12 min-h-[280px] sm:min-h-[300px]">
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center text-center gap-3 transition-opacity duration-300 ${
                active === null ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <MousePointerClick className="w-6 h-6 text-gray-400" aria-hidden="true" />
              <p className="text-sm text-gray-500 max-w-xs">Survole ou touche un module pour découvrir l'interface réelle.</p>
            </div>

            {FEATURES.map(({ title, visual }, i) => (
              <div
                key={title}
                aria-hidden={active !== i}
                className={`absolute inset-0 max-w-xl mx-auto transition-opacity duration-300 ${
                  active === i ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <FeatureVisual kind={visual} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
