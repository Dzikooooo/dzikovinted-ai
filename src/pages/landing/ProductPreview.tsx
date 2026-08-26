import { Shirt, RefreshCw, MessageSquare, ReceiptEuro } from 'lucide-react';
import { DiscordIcon } from '../../components/ui/DiscordIcon';

// Refonte complete (audit personnel utilisateur, 2026-08-01) : l'ancienne
// version reproduisait une capture d'ecran quasi complete du Dashboard
// (sidebar, anneaux, cartes, chiffres) -- trop dense, devoilait toute
// l'interface. Nouvelle version : uniquement 5 modules, presentation
// premium et volontairement mysterieuse (aucune capture d'ecran, aucune
// donnee chiffree), pour donner envie de decouvrir le produit plutot que
// de tout montrer avant l'inscription.
// Round M -- retire la description isolee sous le 3e module (retour
// utilisateur : asymetrie bizarre, seul module a avoir une legende) --
// aucun des 5 n'en a desormais, coherent avec l'intention d'origine
// ("presentation volontairement mysterieuse").
//
// Passe 2026-08-26 -- icones et libelles :
//   - Discord : le vrai glyphe de marque (DiscordIcon) remplace la bulle
//     generique MessageCircle, qui ne disait rien de la plateforme visee.
//   - Generateur : `Shirt` (vetement) plutot que `Sparkles` -- l'etoile "IA"
//     est un signe de techno, pas de metier ; le playbook demande de nommer
//     le benefice vendeur, jamais la techno.
//   - "Mes annonces" devient "Republication" avec `RefreshCw` : c'est la
//     fonction reelle mise en avant, et l'oeil ne designait rien.
//   - Comptabilite : `ReceiptEuro` plutot que `Receipt` -- l'euro rend le
//     module lisible sans lire le libelle.
// Toutes les icones passent au violet de marque : le teal signifie Vinted,
// jamais ResellOS (voir src/lib/brandColors.ts).
const MODULES = [
  { icon: DiscordIcon, label: 'Communauté Discord' },
  { icon: Shirt, label: 'Générateur IA' },
  { icon: RefreshCw, label: 'Republication' },
  { icon: MessageSquare, label: 'Communication' },
  { icon: ReceiptEuro, label: 'Comptabilité' },
];

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

        <div className="rounded-[36px] border border-gray-200 bg-gray-50 px-6 py-16 sm:px-16 sm:py-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {MODULES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center text-center gap-3">
                <Icon className="w-7 h-7 text-neon-500" />
                <p className="font-bold text-gray-900 text-sm sm:text-base">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
