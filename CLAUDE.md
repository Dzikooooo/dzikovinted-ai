# CLAUDE.md

Instructions persistantes pour Claude Code sur ce repo.

## Design / UI

Pour tout travail UI/UX, branding, landing page ou frontend visuel ResellOS, lire et respecter `docs/RESELLOS_DESIGN_PLAYBOOK.md` avant de proposer ou modifier du code. Ce fichier est la source canonique du savoir design du projet — il prime sur le goût générique par défaut et sur les patterns "SaaS/IA" classiques. Si une demande contredit ce playbook, le signaler avant d'exécuter plutôt que de l'appliquer silencieusement.

## Tokens de couleur & accessibilité

Règles applicables **sans avoir à ouvrir le playbook** — le détail, les ratios mesurés et la méthode de vérification sont dans sa section « Tokens de couleur & accessibilité », les valeurs dans `src/lib/brandColors.ts`.

| Token | Valeur | Usage |
|---|---|---|
| `BRAND_VIOLET` | `#7C5CFF` | tout ce qui est **ResellOS** (= token Tailwind `neon-500`, préférer `text-neon-500`) |
| `VINTED_TEAL` | `#09B1BA` | **aplats décoratifs seulement** — fonds de pastille, bordures, remplissages. Aucun texte dessus |
| `VINTED_INK` | `#007782` | **texte et icônes** désignant Vinted, **et fond des boutons pleins Vinted** (blanc dessus : 5.30:1) |

Trois règles à ne pas enfreindre :

1. **Un accent Vinted ne s'emploie que si l'élément désigne réellement Vinted.** Jamais comme accent décoratif — sinon c'est du violet.
2. **Jamais de texte en `VINTED_TEAL`, ni de texte SUR `VINTED_TEAL`** : 2.62:1, il échoue WCAG AA même en grand — et un contraste est symétrique, donc du blanc sur le teal échoue exactement pareil. Un bouton plein Vinted se fait en `VINTED_INK` (5.30:1). Corrigé le 2026-08-26 : la règle précédente autorisait à tort « boutons pleins » sur le teal.
3. **Mesurer un contraste avant d'introduire une couleur pour du texte**, ne pas l'estimer à l'œil (seuils : 4.5:1 normal, 3:1 grand texte et éléments d'interface).

Ne jamais introduire une quatrième teinte de marque sans raison mesurable, ni faire porter une information par la seule couleur.
