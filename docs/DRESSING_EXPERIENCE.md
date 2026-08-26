# Dressing ResellOS — concept gelé

> **Statut : GELÉ** (2026-08-23) — décision utilisateur : « gèle l'idée de dressing pour plus tard,
> c'est pas le moment ». Aucune partie de cette réflexion n'est abandonnée, elle est mise en
> attente. La landing revient à une structure classique en attendant.
>
> **Ne pas ré-ouvrir ce chantier sans validation explicite.**

---

## 1. Concept central

La landing entière donne l'impression que l'utilisateur explore physiquement un **dressing de
revendeur**. ResellOS = le dressing / système d'exploitation du revendeur.

Le dressing n'est pas une illustration décorative derrière le site : **le dressing EST l'interface
narrative**. Les briques classiques d'une landing SaaS deviennent des objets physiques :

| Brique SaaS | Objet physique |
| --- | --- |
| Hero | Portes du dressing (fermées → s'ouvrent) |
| Avant/Après | Étagère haute |
| Features | Penderie — 1 vêtement = 1 fonctionnalité |
| FAQ | Tiroir — 1 pochette d'expédition = 1 question |
| Pricing | Étagère basse — 1 boîte à chaussures = 1 forfait |
| CTA final | Recul caméra, on voit le meuble entier |

**Signature émotionnelle recherchée** : le fil qu'on tire (« drop the mic » transposé au textile).
On tire un fil, le vêtement se défait, le fil devient le conducteur graphique vers la scène
suivante. Métaphore du produit : tu tires un fil (une photo), tout le reste se déroule.

**Règle qui gouverne tout** : on ne doit jamais avoir l'impression d'être sorti du dressing.

---

## 2. Architecture physique

```text
╔══════════════════════════════════════════════════════════╗
║  S00 · FAÇADE — portes fermées, poignées, ombre au sol   ║
║  H1 · sous-texte · CTA (DOM, lisibles, jamais masqués)   ║
╠══════════════════════════════════════════════════════════╣
║  S01 · OUVERTURE — les 2 portes pivotent                 ║
║  Sur leur face intérieure : vêtements accrochés          ║
╠══════════════════════════════════════════════════════════╣
║  ÉTAGÈRE HAUTE · TRANSFORMATION                          ║
║   ┌────────────┐        ~~fil~~        ┌────────────┐    ║
║   │  AVANT     │ ─────────────────────▶│  APRÈS     │    ║
║   └────────────┘                       └────────────┘    ║
╠══════════════════════════════════════════════════════════╣
║  ── TRANSITION FIL ── (le fil descend, devient tringle)  ║
╠══════════════════════════════════════════════════════════╣
║  PENDERIE · 5 vêtements = 5 fonctionnalités              ║
║     ↓ un seul sort à la fois, loupe sur son étiquette    ║
╠══════════════════════════════════════════════════════════╣
║  TIROIR · FAQ — 5 pochettes d'expédition                 ║
╠══════════════════════════════════════════════════════════╣
║  ÉTAGÈRE BASSE · PRICING — 3 boîtes à chaussures         ║
╠══════════════════════════════════════════════════════════╣
║  S-FIN · recul caméra → on voit le meuble entier · CTA   ║
╚══════════════════════════════════════════════════════════╝
```

---

## 3. Distinction technique validée (importante, à conserver)

| | Définition | Verdict |
| --- | --- | --- |
| **Scroll-jacking** | On intercepte/annule le scroll natif (preventDefault, snap forcé, pin qui piège) | À éviter |
| **Scroll-scrubbing** | La page scrolle normalement, la progression de l'animation est mappée sur la position de scroll | **Légitime** |

Le concept dressing a besoin du **second**, pas du premier. Le seul point risqué est le **pinning**
(immobiliser le viewport pendant qu'une séquence se joue) — évitable en donnant à chaque scène sa
propre hauteur de document.

---

## 4. Architecture technique retenue (V1, sans WebGL)

**Décision : pas de Three.js / WebGL pour la V1.** Justification mesurée :

| Critère | DOM/SVG/CSS/raster | Three.js + R3F |
| --- | --- | --- |
| Poids ajouté | ~25 KB (GSAP) | ~600 KB min |
| Texte SEO/sélectionnable | Natif | Overlay HTML requis de toute façon |
| `prefers-reduced-motion` | Trivial | À recâbler |
| Mobile bas de gamme | Robuste | Risque FPS/batterie |
| Assets à produire | Photos + SVG | Modélisation 3D de 15+ objets |

La scène est frontale, sur un axe vertical, sans rotation libre de caméra — cas où la 3D réelle
n'apporte rien qu'un 2.5D bien fait ne donne pas.

### Couches

| Couche | Techno | Contenu |
| --- | --- | --- |
| Structure du meuble | CSS 3D | Caisson, portes, étagères, tiroir |
| Objets à matière | **Raster détouré (AVIF/WebP + alpha)** | Vêtements, chaussures, pochettes — éclairage *baked* |
| Objets à trait | SVG | Cintre, loupe, **le fil**, formes d'étiquettes |
| Physique / poids | CSS transforms + easing ressort | Voir §5 |
| Textes | DOM | Non négociable (SEO, a11y) |
| Séquençage | GSAP ScrollTrigger `scrub`, **sans `pin`** | ~25 KB gzip |

### Pipeline « le vêtement se défait »

```
[raster détouré]
   └─ CSS mask-image : gradient dont la position est scrubbée
[SVG path : le fil]
   └─ stroke-dashoffset scrubbé, inversement
```

Les deux pilotés par **la même variable de progression** — c'est le couplage qui crée l'illusion
causale (le fil *provoque* la disparition, il ne l'accompagne pas).

---

## 5. Illusion de poids (le point le plus important)

**Options de déformation étudiées :**

| Technique | Coût | Robustesse | Verdict |
| --- | --- | --- | --- |
| `feDisplacementMap` + `feTurbulence` animés | Élevé | Janky mobile, inégal Safari | Écarté |
| Mesh warp Canvas 2D | Moyen-élevé | Sort du DOM, perd les ombres CSS | Écarté V1 |
| **Chaîne de segments transformés** | Très bas (GPU) | Excellente | **À tester en P0** |

Principe à tester : le vêtement = **3 tranches horizontales de la même image** (épaules / corps /
bas), chacune positionnée par `clip-path`, pivotant autour de son **bord supérieur**, avec retard
progressif (~60 ms / ~120 ms) et amortissement croissant. Mécaniquement un **pendule à 3 maillons**.

**Non tranché** : les segments risquent de produire des cassures artificielles dans le tissu.
P0 doit comparer :
- **Variante A** — asset entier (translation + rotation + scale + inertie globale + oscillation + ombre)
- **Variante B** — même asset en 3 zones avec retard progressif

Ne garder B que si la différence est franchement perceptible. *Ne pas complexifier parce que la
technique existe.*

---

## 6. Cycle d'inspection d'une feature (comportement de référence)

```
vêtement sort → stabilisation → loupe entre → inspection étiquette
→ loupe repart → vêtement retourne exactement sur son cintre → suivant
```

**Non tranché** : ce cycle complet coûte cher en hauteur de scroll. P0 doit mesurer la hauteur
consommée par UN cycle. Si ≤ ~120vh → les 5 tiennent en 600vh, comportement viable. Si > ~180vh →
arbitrer (option envisagée mais **non validée** : les vêtements restent sortis au lieu de revenir).

---

## 7. Budget performance

| Poste | Budget |
| --- | --- |
| JS initial | ≤ 160 KB gzip |
| Raster par vêtement | ~60 KB cible, **90 KB acceptable si la matière est clairement meilleure** |
| Résolution par vêtement | ≤ 800 px de large |
| Total raster de la scène | ≤ 550 KB, **100 % lazy** |
| SVG total | ≤ 30 KB |
| FPS desktop / mobile | 60 / ≥ 50 |
| Hauteur de scroll | ≤ 700vh |
| Reduced motion | État final direct, zéro mouvement |

Règle explicite : **ne jamais détruire la signature visuelle pour gagner 20-30 KB sur un asset
lazy-loaded.**

---

## 8. Mapping produit → objets (fonctionnalités réelles du repo)

| Élément ResellOS | Objet | Information affichée |
| --- | --- | --- |
| **Générateur IA** (`GeneratorPage`) | Polo | Titre SEO, description, catégorie/taille/état, prix recommandé |
| **Mes annonces** (`WatchlistPage`) | Quarter-zip | Sync Vinted, statut réel, modification, sélection multiple |
| **Republication programmée** (`republishScheduler.ts`) | Chemise | Republication un clic ou programmée à l'heure choisie |
| **Comptabilité** (`AccountingPage`) | Veste | CA, bénéfice net, ROI, dépenses, estimation TVA + URSSAF |
| **Communauté Discord** (`DiscordTab`) | Tee-shirt | Alertes, entraide, accès équipe |
| **Communication** ⚠️ non construit | **Cintre vide** + « bientôt » | Ne jamais le mettre au même rang que les autres |

**Écarts produit signalés (toujours valables) :**
1. `Communication` n'existe pas — tout est marqué « bientôt » dans le code.
2. **Pro et Team ont exactement les mêmes limites réelles** (documenté dans `plans.ts`) — une
   hiérarchie visuelle forte entre les deux survendrait une différence qui n'existe pas.
3. `VITE_DISCORD_INVITE_URL` non configurée — la landing affiche un fallback honnête.

---

## 9. Assets

| Asset | Format | Source |
| --- | --- | --- |
| Caisson, portes, étagères, tiroir | CSS | ✅ prototypé (`Wardrobe.tsx`) |
| Vêtements × 5 | AVIF + WebP, alpha | **Photos des vrais vêtements de l'utilisateur** |
| Chaussures × 3 | AVIF + WebP, alpha | Idem, **aucune marque visible** |
| Pochette d'expédition | AVIF + WebP, alpha | Emballages réels |
| Cintre, loupe, fil, formes d'étiquettes | SVG | Maison |
| Ombre portée | CSS | — |

**Marques** : reproduire une Air Max / Timberland / Louboutin reconnaissable expose à un risque réel
(la semelle rouge Louboutin est une marque déposée défendue activement ; les silhouettes de sneakers
relèvent du trade dress). → **3 silhouettes génériques différenciées par la forme.**

---

## 10. Checklist de prise de vue (validée, non exécutée)

Polo bleu ciel → **fond sombre** (règle : vêtement clair → fond sombre).

- **Lumière** : jour, **latérale**, flash coupé, pas de soleil direct dur, **ne pas repasser le
  vêtement** (les plis sont l'asset)
- **Fond** : uni, sombre, sans motif ; vêtement décollé du fond de 30-50 cm
- **Téléphone** : caméra arrière, **1×** (jamais l'ultra grand-angle), vertical, parallèle au
  vêtement, objectif à mi-hauteur
- **Distance** : 1,5-2 m
- **Cadrage** : tout le vêtement + crochet du cintre, 10-15 % de marge
- **Cintre** : simple et fin, crochet net

| # | Photo | Rôle |
| --- | --- | --- |
| 1 | Polo suspendu, de face, immobile | Asset de référence |
| 2 | Idem après l'avoir fait bouger | Roue de secours |
| 3 | Cintre seul, vide, même fond/lumière | Cintre animable séparément |
| 4 | Gros plan étiquette d'entretien (neutre, sans marque) | Matière + couture |
| 5 | Macro maille du piqué | Référence pour juger la compression |

**Transfert** : fichiers originaux, jamais via WhatsApp/Instagram (recompression = destruction de la
texture recherchée).

**Détourage 0 €** : Windows 11 Paint intègre « Supprimer l'arrière-plan » (déjà installé). Repli :
Photopea (navigateur, gratuit, sans compte).

---

## 11. Plan d'implémentation

| Phase | Contenu |
| --- | --- |
| **P0** | Mini-scène complète sur route isolée : fragment de dressing, cintre, **1 vêtement raster**, ombre, sortie avec inertie, stabilisation, loupe, étiquette (texte DOM), retour, scrub natif, reduced motion. **Compare Variante A vs B.** Mesure la hauteur de scroll d'un cycle. |
| P1 | Bibliothèque d'assets (après validation P0 uniquement) |
| P2 | Coquille du dressing |
| P3 | Hero + ouverture des portes |
| P4 | Étagère haute — transformation |
| P5 | Le fil (animation signature) |
| P6 | Penderie + système d'inspection |
| P7 | Tiroir FAQ + pochettes |
| P8 | Étagère chaussures + pricing (**prix compréhensible en 3 s = critère éliminatoire**) |
| P9 | Recul final, responsive, perf, reduced motion |

**Question à laquelle P0 doit répondre** : *est-ce que cette technique donne assez l'illusion d'un
vrai vêtement physique premium pour construire toute la landing dessus ?*

---

## 12. Risques identifiés (à relire avant tout dégel)

1. **Le concept mange la preuve produit** — conflit direct avec `RESELLOS_DESIGN_PLAYBOOK.md`
   (règle anti-générique n°5, principe A.2 : le produit doit produire les visuels de la marque).
   Mitigation : chaque étiquette contient de la vraie donnée produit + garder un compartiment avec
   une vraie capture ResellOS.
2. Scroll trop long → abandon avant le pricing. Mitigation : plafond 700vh + ancres navbar.
3. Effet gimmick (« joli mais je n'ai pas compris le produit »). Mitigation : test 3 s + test sans texte.
4. Perf mobile. 5. Lisibilité. 6. Accessibilité. 7. Temps de dev.
8. **Qualité des illustrations** — 3 tentatives ont échoué en session ; cause racine identifiée :
   construction sans retour visuel. Mitigation obligatoire : boucle de validation par screenshot.
9. Team survendu vs Pro. 10. Maintenance (ajouter une feature = produire un asset).

---

## 13. Code prototype conservé

Ces fichiers restent dans le repo **volontairement**, non branchés à la landing — ils constituent le
prototype v4 du caisson. **Ne pas les signaler comme code mort.**

- `src/pages/landing/Wardrobe.tsx` — caisson, portes 3D, étagères, tiroir
- `src/pages/landing/WardrobeIllustration.tsx` — cintre + silhouette SVG (approche 100 % SVG,
  **rejetée** par l'utilisateur au profit du raster photoréaliste — conservé comme trace)

Les primitives CSS associées (`.wardrobe-*`, `.hanger-swing`, `.garment-drop`, `.magnify-in`,
`.price-tag-*`) sont retirées de `index.css` au dégel de la landing ; elles sont reconstructibles à
partir de ce document.
