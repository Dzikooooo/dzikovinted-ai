# ResellOS Design Playbook

Source canonique du savoir design de ResellOS. Ce document n'est **pas** un article générique sur le design SaaS — il transforme le raisonnement de deux formations réelles (voir `docs/design-sources/`) en règles opérationnelles propres à ResellOS, un produit pour vendeurs Vinted.

**Sources** :
- **[L1]** = `docs/design-sources/Level 1.md.md` — vidéo sur les 4 niveaux de qualité d'une landing SaaS.
- **[B]** = `docs/design-sources/Intro (AI SaaS Website).md.md` — construction complète d'une landing "Cognify" (AI SaaS fictif) dans Figma.
- **[C]** = déduction/adaptation pour ResellOS, non tirée littéralement d'une source.

Chaque règle ci-dessous cite sa source. Aucune règle n'est présentée comme universelle si elle ne vient que d'une démo contextuelle.

**Règle d'or de ce document** : les valeurs exactes vues dans `[B]` (marge 120, corner radius 8, gap 60...) sont des choix pédagogiques d'un tutoriel Figma pour une marque fictive appelée "Cognify" — jamais des lois. La DA "Cognify" (gradients violet/orange, blobs, bento, mega menu, badge "Powered by AI") est un exemple de niveau 3-4 **pour ce projet-là**, pas un habit à enfiler pour ResellOS.

---

## Anti-AI-generic design rules

C'est la section la plus importante de ce document. Elle répond directement au constat de l'utilisateur : *"beaucoup de projets faits par IA finissent avec la même DA / les mêmes layouts / les mêmes patterns"*.

**Pourquoi ça arrive** — `[L1]` le nomme précisément : un site de niveau 1 n'est pas mauvais parce qu'il a de mauvaises idées, il est mauvais parce que *"it's just a product of someone not making any design decisions whatsoever"*. Le générique n'est pas un style — c'est l'**absence de décision**. Une IA (ou un humain pressé) qui n'a pas de doctrine propre retombe systématiquement sur le chemin de moindre résistance : le dernier tutoriel/exemple qu'elle a "vu" le plus souvent. Aujourd'hui, ce chemin de moindre résistance ressemble presque toujours à `[B]` : fond sombre, glow violet, gradient diagonal, grille de points en arrière-plan, bento cards, badge "Powered by AI", mega menu.

**Ce que ResellOS doit refuser par défaut**, sauf preuve qu'un choix précis sert un but précis :

1. **Glow/blob décoratif répété sans fonction.** Un halo violet flou n'existe dans `[B]` que pour donner de la texture au fond du hero (`gradient one`, un dégradé de DEUX couleurs très pâles). Il n'est jamais dupliqué à l'identique section après section. Dans ResellOS actuel, `Hero.tsx` et `CTABanner.tsx` utilisent le **même** blob + la **même** grille de points en arrière-plan — c'est une signature "SaaS générique", pas une décision.
2. **Grille de points/lignes en fond `absolute inset-0`** utilisée comme texture par défaut plutôt que comme un choix lié au contenu.
3. **Headline énorme "pour faire SaaS"** sans que la taille serve la hiérarchie réelle de la page. `[L1]` niveau 3 note déjà ce piège même à haut niveau : *"the headline dominates at the expense of the subline... even slightly overdone."*
4. **Cards identiques répétées mécaniquement** (icône + titre + paragraphe × 3, toutes de la même forme). C'est littéralement la section "Features" construite dans `[B]` (3 cartes carrées, icône colorée, titre, texte) — une technique **contextuelle**, jamais une brique à reproduire telle quelle pour ResellOS (voir Layout & spacing, catégorie B/C).
5. **Illustrations décoratives sans lien produit** (icônes génériques, vecteurs abstraits "AI-themed") à la place de captures ou de représentations du vrai produit. `[B]` lui-même admet créer des vecteurs random faute de mieux pour un produit fictif : *"we don't have a dashboard, and I don't want to stress about bringing a dashboard... we're just going to add random vectors."* Un produit RÉEL comme ResellOS n'a jamais cette excuse.
6. **Fausse preuve sociale** : avatars stock, faux avis, faux logos clients. `[B]` utilise volontairement des logos placeholder pour la démo et dit explicitement où trouver de VRAIS logos pour un vrai projet — la vraie preuve sociale est la norme visée, pas l'exception.
7. **Badge "Powered by AI" / vocabulaire IA générique.** ResellOS ne vend pas "de l'IA" en tant que catégorie — il vend une automatisation Vinted concrète. Le badge/eyebrow de ResellOS doit nommer Vinted et le bénéfice, jamais la techno.
8. **Bento grid, mega menu, blur de verre** utilisés parce qu'ils sont "beaux dans la vidéo" plutôt que parce qu'un vrai besoin de navigation/densité les justifie (voir Principes universalisables vs Techniques contextuelles).
9. **Copie qui explique ce que fait le produit plutôt que ce qu'il permet**, sans jamais nommer concrètement une action réelle de vendeur Vinted (voir Copywriting, section G).
10. **Animations gratuites** — mouvement ajouté parce que "ça fait plus premium", sans lien avec un état réel (chargement, ouverture, hover). `[L1]` niveau 1 note déjà qu'un simple hover "doesn't really make the website jump to life in any way" — l'absence de raison rend l'animation inutile, qu'elle existe ou non.
11. **Sections toutes construites sur la même composition** (texte centré + bouton, répété 4 fois). `[L1]` niveau 1→2 : le passage d'une page "a series of sections dropped one on top of the other" à une page avec un vrai flow est justement le signal de progression le plus cité.
12. **Excès de border-radius / shadow / glow appliqués uniformément** sans hiérarchie (tout au même rayon, tout avec la même ombre) plutôt que des choix qui distinguent ce qui est important de ce qui ne l'est pas.

**Test rapide anti-générique** : *"Si on enlève le logo ResellOS, est-ce que la page pourrait être n'importe quel autre SaaS ?"* Si la réponse est oui, la page a échoué — peu importe la qualité d'exécution.

---

## A. Design principles

### 1. Une décision de design vaut mieux qu'une absence de décision
**Règle** : chaque choix visuel (taille, couleur, position, animation) doit avoir une raison identifiable, même simple.
**Pourquoi** — `[L1]` : la différence entre un site à 500$ et un site à 10 000$ n'est "pas le talent, c'est de savoir exactement à quel niveau on est et quoi corriger". Un niveau 1 fonctionne mais n'est le produit d'aucune décision.
**Mauvais exemple** : un blob violet flou ajouté "parce que ça fait pro" sans lien avec le contenu qu'il entoure.
**Attendu pour ResellOS** : chaque élément visuel doit pouvoir répondre à "pourquoi celui-ci, ici, à cette taille ?" — sinon il est retiré.

### 2. Le produit doit produire les visuels de la marque
**Règle** : chaque fois qu'une vraie fonctionnalité peut être montrée, elle remplace une illustration décorative.
**Pourquoi** — `[L1]` niveaux 2→4 : la progression #1 citée à chaque niveau est le remplacement d'images stock par le vrai dashboard (niveau 2), puis un zoom curaté sur ses parties importantes (niveau 3), puis des visuels *"crafted to be exactly what we need and show exactly what the product does"* (niveau 4).
**Mauvais exemple** : une grille de 5 icônes + labels à la place d'une vraie capture d'écran (déjà présent dans ResellOS, voir audit).
**Attendu pour ResellOS** : privilégier systématiquement un rendu fidèle d'un écran réel (générateur, stock, calendrier de republication...) à une icône ou un pictogramme.

### 3. La hiérarchie se construit par contraste relatif, pas par taille absolue
**Règle** : un élément n'est "important" que relativement aux autres — pas parce qu'il est gros dans l'absolu.
**Pourquoi** — `[L1]` niveau 3 note qu'un headline qui écrase totalement la subline est "légèrement trop" même à un niveau déjà avancé ; niveau 4 parle explicitement d'un typographique "well balanced".
**Mauvais exemple** : un H1 en `text-8xl` suivi d'un paragraphe en `text-2xl` sur deux lignes complètes — tout est énorme, rien ne respire.
**Attendu pour ResellOS** : le H1 doit rester le point le plus fort de la page, mais sa taille doit être calibrée contre le reste du hero (badge, sous-texte, CTA, visuel), pas fixée en isolation.

### 4. Le flow de page se construit, il ne s'empile pas
**Règle** : les sections doivent s'enchaîner (transition, respiration, écho visuel) plutôt que d'être des blocs indépendants les uns sous les autres.
**Pourquoi** — `[L1]` : le passage niveau 1 → niveau 2 est décrit comme *"a series of sections dropped one on top of the other"* → *"some logical top to bottom progression"*. Niveau 3 va plus loin : *"the subsection of the logos flows well into analytics, and the fade out of the dashboard segues nicely into the actual features."*
**Attendu pour ResellOS** : penser l'ordre des sections comme une histoire (comprendre → croire → essayer → payer), pas comme une liste de blocs interchangeables.

### 5. La couleur doit venir du produit, pas de la décoration
**Règle** : la couleur d'accent de ResellOS doit apparaître d'abord à travers de vrais éléments produit (statuts, prix, graphiques), pas à travers des effets purement esthétiques.
**Pourquoi** — `[L1]` : *"color is often the hardest thing to really nail... [niveau 1] relies largely on images to do a lot of that heavy lifting."* Niveau 2 : *"the color pops now come from the dashboard, which is a much more vibrant and professional way to add color."*
**Attendu pour ResellOS** : un badge de statut "En ligne" en violet, un prix en surbrillance, une courbe de CA — plutôt qu'un glow décoratif flou.

### 6. Le copywriting doit dire ce que ça permet, pas seulement ce que ça fait
**Règle** : transformer une description fonctionnelle en bénéfice concret pour le vendeur.
**Pourquoi** — `[L1]` niveau 4 (cité textuellement) : *"the trick with copy between level three and level four is to transform from what it does to how it helps"* — exemple donné : "collecting and analyzing data quickly" (fonctionnel) devient "turn that into decisions" (bénéfice).
**Mauvais exemple** : "Générateur IA de fiches produit."
**Attendu pour ResellOS** : nommer le gain concret pour un vendeur Vinted (temps gagné, annonce publiée en X secondes), sans perdre en précision produit (voir section G, cette règle a une limite volontaire).

### 7. La variété de composition est un signal de maîtrise
**Règle** : ne pas répéter la même structure de section en boucle (texte centré + visuel, texte centré + visuel...).
**Pourquoi** — `[L1]` niveau 1 critique déjà l'alternance mécanique texte-gauche/image-droite répétée sans variation ; niveau 3 loue explicitement le passage d'une simple rangée de 3 cartes à une interaction "multi-select... which is a hallmark of an experienced designer."
**Attendu pour ResellOS** : alterner consciemment layout centré / layout en split / layout asymétrique selon ce que chaque section a réellement à montrer.

### 8. Chaque niveau de qualité s'obtient en resserrant, jamais en ajoutant du bruit
**Règle** : améliorer une section signifie enlever ce qui ne sert à rien avant d'ajouter un effet.
**Pourquoi** — `[L1]` niveau 4 (conclusion explicite) : *"there's no custom illustrations or 3D craziness. It's just well-crafted UI with strong attention to detail that is attainable for everyone."* La différence entre "bien" et "excellent" n'est presque jamais une seule grosse feature, mais l'attention au détail.
**Attendu pour ResellOS** : avant d'ajouter un effet, vérifier qu'aucun élément existant n'est bruyant/inutile.

### 9. Un composant réutilisable vaut mieux qu'une variation ad hoc
**Règle** : un même besoin visuel (badge, bouton, en-tête de section) doit passer par le même composant partout.
**Pourquoi** — `[B]` : le tutoriel construit systématiquement des composants Figma avec variantes (icône affichable/masquable, état primaire/outline/secondaire) explicitement *"pour que ce soit plus facile pour vos développeurs de venir choisir ce composant... plutôt que de vous demander"*.
**Attendu pour ResellOS** : réutiliser `Button.tsx`/`Badge.tsx`/etc. existants plutôt que de recréer un style inline à chaque section (déjà largement en place côté dashboard, à étendre à la landing).

### 10. Choisir des visuels dont le ton correspond au reste de la page
**Règle** : toute image/photo utilisée doit partager la palette et l'ambiance du reste du design — jamais un stock générique au ton disparate.
**Pourquoi** — `[B]` (cité) : *"you must choose images that have the same tone of what you're currently designing... you shouldn't choose colors that have totally different color blend modes."*
**Attendu pour ResellOS** : préférer de vraies captures de l'app (déjà dans la bonne palette) à toute photo stock.

### 11. La navigation doit refléter une vraie hiérarchie d'importance
**Règle** : tous les liens de nav ne se valent pas — l'action principale doit être visuellement distincte.
**Pourquoi** — `[L1]` niveau 1 : *"every item looks virtually identical, there's no hierarchy drawing our eye to the most important action."* Niveau 2 corrige en distinguant bouton outlined + liens centrés.
**Attendu pour ResellOS** : le CTA principal (déjà bien traité dans `Navbar.tsx` actuel) reste visuellement à part ; les libellés de CTA identiques entre nav et hero doivent continuer à pointer vers la même destination (déjà le cas).

### 12. L'animation doit avoir un état réel derrière elle
**Règle** : n'animer que ce qui change réellement d'état (ouverture, chargement, sélection) — jamais un mouvement gratuit.
**Pourquoi** — `[L1]` : le hover "vide" de niveau 1 est explicitement noté comme ne faisant "rien" pour le site ; à l'inverse, niveau 4 gagne 2 points entiers avec un simple effet de flou appliqué à un endroit précis, parce qu'il sert une vraie transition d'état (mega menu ouvert/fermé).
**Attendu pour ResellOS** : l'accordéon FAQ doit animer une vraie transition d'état (ouvert/fermé), pas un affichage binaire instantané.

### 13. Le produit doit rester identifiable même sans son logo
**Règle** : la landing doit porter des signaux visuels propres au produit réel (Vinted, statuts d'annonces, prix en euros, workflow de republication) — pas seulement une identité de couleur.
**Pourquoi** — `[C]`, déduit des retours du designer et du principe #2 : un produit spécifique à Vinted qui ne montre jamais Vinted, ni son propre workflow réel, perd exactement ce qui le distingue d'un SaaS générique.
**Attendu pour ResellOS** : toute maquette de landing doit passer le test "reconnaissable sans logo" (voir Design review checklist).

---

## B. Layout & spacing

`[B]` documente une grille précise (12 colonnes, marge 80–120px, gutter 20px) — l'auteur précise lui-même : *"most times, any time I'm designing, I choose between 80 to 120. I don't let my margins exceed 120"* — un **habitude personnelle**, pas une règle universelle imposée.

**Ce qu'on retient comme principe [L1]/[B]**, pas comme valeur figée :
- Une grille cohérente doit exister et être **respectée section après section** — c'est la régularité qui compte, pas le chiffre exact.
- Le rythme vertical entre sections doit être constant (`[B]` utilise 60px de padding haut/bas par section, répété partout) : ResellOS doit choisir **sa propre** valeur et s'y tenir, alignée sur l'échelle déjà en usage dans le dashboard (`py-16 sm:py-24`, déjà cohérent entre `Features.tsx`/`Pricing.tsx`/`FAQ.tsx`/`CTABanner.tsx` — à conserver, c'est déjà une bonne discipline).
- Les cadrages de contenu (`max-w-3xl` pour du texte, `max-w-6xl`/`max-w-7xl` pour des grilles) doivent rester intentionnels et limités en nombre de valeurs différentes, pas improvisés section par section.
- `[L1]` niveau 3 : les lignes verticales encadrant le contenu servent aussi la responsivité sur grand écran — un rappel que la grille doit être pensée au-delà du desktop standard.

**Décision ResellOS `[C]`** : garder l'échelle de spacing déjà en place dans `src/pages/landing/*.tsx` (`py-16 sm:py-24`, `max-w-*` déjà cohérents) comme base — ce n'est pas ce qui est cassé aujourd'hui. Le playbook n'introduit pas une nouvelle échelle, il documente celle qui existe pour qu'elle soit respectée consciemment plutôt que redécouverte à chaque section.

---

## C. Visual hierarchy

| Niveau | Règle | Source |
|---|---|---|
| H1 | Le plus fort élément de la page, mais calibré contre le reste du hero — jamais isolé de son contexte. Une seule idée par H1. | `[L1]` (principe #3) |
| H2 (titres de section) | Cohérents entre eux (même échelle sur toute la page), jamais plus dominants que le H1. | `[C]`, déduit de `[L1]` |
| Body | Lisible, largeur de ligne contrôlée (voir ci-dessous), jamais en concurrence de taille avec les titres. | `[L1]` |
| Labels/eyebrows | Petits, en majuscules ou badge, servent à nommer immédiatement la catégorie/l'audience avant le titre. | `[B]` (badge hero) |
| Navigation | Le CTA principal toujours visuellement distinct des liens simples. | `[L1]` niveau 1→2 |
| CTA | Un seul CTA "fort" par vue ; les CTA secondaires en style outline/discret. | `[B]` |
| Largeur de ligne | Le texte de sous-titre/paragraphe doit rester lisible sans forcer l'œil à trop de mouvement horizontal — préférer une largeur contenue (`max-w-*`) à un paragraphe qui court sur toute la largeur du viewport. | `[C]`, déduit de `[L1]` ("no one is stopping to read a block of text like this") |
| Contraste primaire/secondaire | Le texte gris (secondaire) ne doit jamais concurrencer le texte blanc/accent (primaire) en poids visuel. | `[B]` (gray text token dédié) |

---

## Tokens de couleur & accessibilité

Source de vérité en code : **`src/lib/brandColors.ts`**. Cette section documente les règles ; le fichier documente les valeurs. Les deux doivent rester d'accord.

### Les trois tokens

| Token | Valeur | Contraste sur blanc | Usage |
|---|---|---|---|
| `BRAND_VIOLET` | `#7C5CFF` | 4.35:1 | **Tout ce qui est ResellOS** : icônes de modules, onglets, puces, liens de la marque. C'est la couleur du glyphe « R » et du « OS » du wordmark. |
| `VINTED_TEAL` | `#09B1BA` | **2.62:1** | **Aplats DÉCORATIFS uniquement** : fonds de pastille, bordures, remplissages, barres. Jamais de texte dessus (voir ci-dessous). |
| `VINTED_INK` | `#007782` | 5.30:1 | **Texte et icônes** désignant Vinted sur fond clair, **et fond des boutons pleins Vinted** (blanc dessus : 5.30:1). |

`BRAND_VIOLET` reprend exactement le token `neon-500` de `tailwind.config.js` — préférer la classe `text-neon-500` quand une classe suffit, la constante quand seul un style inline le permet (opacités calculées en hexadécimal, bordures dérivées).

### Règle d'attribution

Un accent Vinted ne s'emploie **que si l'élément désigne réellement Vinted** : le mot « Vinted », un compte Vinted, un CTA qui mène vers Vinted, une colonne « Avant / Vinted seul ». Jamais comme accent décoratif — c'est exactement la dérive corrigée le 2026-08-26, où les icônes de modules ResellOS, les onglets de la section Fonctionnalités et l'enveloppe de la FAQ étaient en teal alors qu'ils ne parlaient pas de Vinted.

Test rapide : *« si je remplace cet élément par du texte, est-ce qu'il parle de Vinted ? »* Si non, il est violet.

### Pourquoi deux teintes Vinted

Ce n'est pas une hésitation, c'est une contrainte mesurée. `#09B1BA` sur blanc plafonne à **2.62:1** — il échoue WCAG AA y compris pour du grand texte (seuil 3:1). Un libellé écrit dans cette teinte est illisible pour une partie des utilisateurs.

`VINTED_TEAL` est donc réservé aux surfaces où **aucun texte ne repose dessus**, et `VINTED_INK` est la seule des deux utilisable dès qu'un libellé entre en jeu — que ce soit le libellé lui-même, ou le fond sur lequel il est posé. **Ne jamais les intervertir.**

#### Correction du 2026-08-26 : les boutons pleins

Ce tableau a autorisé pendant un temps « boutons pleins (texte blanc dessus) » sur `VINTED_TEAL`. **C'était faux, et la mesure n'avait jamais été faite dans ce sens.** Le 2.62:1 documenté est le ratio du teal *lu comme texte sur blanc* ; renverser les rôles ne change rien au chiffre — un contraste est symétrique. Du blanc sur `#09B1BA` reste à **2.62:1**, sous le seuil AA de 4.5:1 et même sous les 3:1 du grand texte.

Le bon fond pour un bouton plein Vinted est donc `VINTED_INK` : blanc dessus mesure **5.30:1**, et la teinte reste sans ambiguïté celle de Vinted.

Deux boutons livrés sous l'ancienne règle ont été corrigés le même jour : « Ouvrir sur Vinted » (relance favoris) et « Voir sur Vinted » (opportunités).

### Vérifier un contraste

Avant d'introduire une couleur pour du texte, mesurer plutôt que d'estimer à l'œil :

```js
const lum = h => { const c = [1,3,5].map(i => parseInt(h.substr(i,2),16)/255)
  .map(v => v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
  return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1,l2)+0.05) / (Math.min(l1,l2)+0.05); };
```

Seuils WCAG AA : **4.5:1** pour du texte normal, **3:1** pour du grand texte (≥ 24 px, ou ≥ 19 px en gras) et pour les éléments d'interface porteurs de sens.

### Ce que cette section n'autorise pas

- Introduire une quatrième teinte de marque sans raison mesurable (le nombre de tokens est volontairement petit — voir Anti-patterns #12 sur l'uniformité sans hiérarchie).
- Colorer plusieurs éléments du même accent quand aucun n'est plus important qu'un autre : un accent partout est un accent nulle part. Sur les onglets Fonctionnalités, l'icône inactive reste grise pour cette raison.
- Utiliser une couleur comme **seul** porteur d'information (statut, erreur, sélection) : toujours doublée d'un libellé, d'une icône ou d'une forme.

---

## D. Product visuals

**Principe directeur** (voir Design principles #2) : chaque fois qu'une vraie fonctionnalité peut remplacer une illustration décorative, elle le fait.

- **Quand montrer une capture réelle** : dès qu'une fonctionnalité a un état visuel qui se comprend en un coup d'œil (une annonce générée, une liste d'annonces avec statuts, un calendrier de republication, une courbe de comptabilité). `[L1]` niveau 2→4 : c'est la progression la plus citée du document source.
- **Comment la recadrer** : ne jamais montrer un écran entier tel quel (niveau 2 le fait encore et c'est noté comme perfectible : *"it's not perfectly framed and it doesn't draw attention to anything in particular"*). Niveau 3/4 : zoomer/cadrer sur la partie qui raconte l'histoire de la section (un titre d'annonce généré, un statut "Republication programmée", un prix recommandé) plutôt que la sidebar + le header + tout le reste.
- **Quand zoomer sur une fonctionnalité précise** : à chaque fois que la section a un message unique et concret (ex. "republication automatique" → montrer une carte de programmation avec une heure et un statut, pas tout le dashboard).
- **Quand utiliser une animation plutôt qu'une image statique** : quand l'état AVANT/APRÈS raconte la fonctionnalité mieux qu'une capture seule (ex. republication : ancienne annonce → nouvelle annonce ; génération : photo → fiche complète). `[L1]` niveau 4 : c'est l'attention aux transitions, pas un gadget, qui fait la différence de niveau.
- **Comment transformer un workflow en narration** : découper le workflow réel (photo → IA → fiche → publication → suivi → republication) en étapes visuelles séquencées plutôt qu'en un paragraphe qui décrit tout d'un coup. C'est exactement la mécanique du "Générateur IA" déjà en germe dans `Features.tsx::FeatureVisual`.
- **Choix des images/photos annexes** : toujours dans le ton du reste de la page (voir Design principles #10) — pour ResellOS, cela veut dire des photos de vêtements/objets réels type Vinted plutôt que du stock lifestyle générique.

---

## E. Motion

`[B]` ne fournit aucune norme de durée/easing chiffrée universelle — le tutoriel règle les valeurs à l'œil, en testant plusieurs options en direct (*"let's try 8... let's increase to 12... I think I prefer 8"*). C'est la **méthode** qui est une source légitime, pas un nombre.

- **Ce qui mérite une animation** : un vrai changement d'état (ouverture/fermeture, hover sur un élément interactif, apparition au scroll d'un élément qui a du sens en contexte, transition entre étapes d'un workflow). `[L1]` niveau 1→4.
- **Ce qui doit rester statique** : tout ce qui n'a pas d'état — un logo, un texte de footer, une image purement illustrative.
- **Hover** : doit rester subtil (translation légère, changement d'opacité/ombre) — jamais un rebond exagéré. Déjà globalement respecté dans le code actuel (`hover:-translate-y-1`, `hover:scale-[1.02]`).
- **Accordéons (FAQ)** : doivent animer une vraie transition d'état — hauteur et opacité, pas un `{condition && <p>}` qui apparaît/disparaît sans transition. `[B]` construit ce comportement explicitement via un état ouvert/fermé animé (icône +  qui devient X par rotation, "smart animate").
- **Transitions entre sections** : privilégier un fondu/chevauchement léger qui fait "respirer" le scroll plutôt qu'une coupure nette section par section — `[L1]` niveau 3 cite ce point comme un signe de maturité (*"the fade out of the dashboard segues nicely into the actual features"*).
- **Durée générale recommandée `[C]`** : rester dans la même fourchette que ce qui existe déjà dans le code (`duration-300`/`duration-500`) — cohérent avec l'esprit "subtil" des deux sources, pas une nouvelle échelle à inventer.

---

## F. Copywriting

- **Principe central `[L1]` (cité)** : transformer "ce que le produit fait" en "ce que ça permet d'obtenir" — sans perdre en précision. L'exemple donné (analytics → decisions) reste un exemple, pas une formule à copier mot pour mot.
- **Longueur** : `[L1]` niveau 1→2 documente une réduction progressive de la longueur des textes à mesure que les visuels prennent en charge une partie du message (*"especially as our visuals start to carry more of the narrative"*). Pour ResellOS : plus `D. Product visuals` est respecté, moins le texte a besoin d'être long.
- **Précision maintenue `[C]`** : contrairement à un SaaS abstrait, ResellOS doit rester concret sur CE QUI se passe réellement (Vinted, republication, calendrier, stock) — le bénéfice ne doit jamais remplacer l'information factuelle, il s'ajoute à elle. Un titre du type "Vendez plus, stressez moins" sans jamais dire Vinted serait un contre-exemple : bénéfice présent, produit absent.
- **Nom du produit répété inutilement** : `[L1]` niveau 1 note qu'un site n'a pas besoin de répéter le nom de la marque dans le texte alors qu'il est déjà visible dans le logo/nav — éviter la redondance.

---

## G. Human feel

Ce que "moins IA / plus humain" veut dire concrètement pour ResellOS — pas des adjectifs, des critères vérifiables :

1. **Vraies captures, jamais de maquettes vides.** Un écran "Générateur IA" doit montrer une vraie fiche produit plausible (marque réelle, prix réaliste), pas un lorem ipsum stylisé.
2. **Vraies situations vendeur.** Les exemples de contenu (titres d'annonces, noms de marques, prix) doivent ressembler à ce qu'un vendeur Vinted publie réellement — pull Nike, jean Levi's, pas des noms de produits fictifs génériques.
3. **Microcopy naturelle.** Les textes d'aide/CTA/sous-textes doivent sonner comme une vraie personne qui explique quelque chose à un vendeur, pas comme une notice.
4. **Variation de composition d'une section à l'autre** (voir Design principles #7) — l'uniformité mécanique est un signal "généré", pas "conçu".
5. **Imperfections maîtrisées.** Un vrai produit a des états "en cours", "désactivée", "bientôt disponible" — les montrer honnêtement (déjà fait en partie dans `Features.tsx`, ex. "Communication... bientôt") est plus humain qu'une démo parfaite à 100%.
6. **Présence du produit réel**, pas d'un produit fantasmé — chaque visuel doit correspondre à une fonctionnalité qui existe vraiment aujourd'hui dans ResellOS, jamais une anticipation présentée comme acquise.
7. **Preuves réelles.** Vrais chiffres (même modestes), vrais témoignages une fois disponibles — jamais un chiffre inventé pour faire nombre (voir Anti-patterns #6).
8. **Rythme éditorial.** Alterner longueur de phrase, densité d'information, et présence/absence de visuel d'une section à l'autre — un rythme parfaitement régulier lit comme un template.

---

## H. Design review checklist

À passer avant de considérer une section/page terminée :

- [ ] Comprend-on ce qu'est ResellOS en 3 secondes ?
- [ ] Comprend-on que c'est lié à Vinted en 3 secondes (pas seulement en scrollant) ?
- [ ] Sait-on à qui ça s'adresse (vendeurs Vinted) sans avoir à déduire ?
- [ ] Le CTA principal est-il évident et unique par vue ?
- [ ] Chaque section a-t-elle une raison d'exister (elle dit quelque chose que les autres ne disent pas) ?
- [ ] Le visuel de chaque section raconte-t-il plus que le texte à côté de lui ?
- [ ] Si on retire le logo ResellOS, la page reste-t-elle reconnaissable comme ResellOS (pas interchangeable avec un autre SaaS) ?
- [ ] Y a-t-il une vraie hiérarchie (pas tout à la même taille/poids) ?
- [ ] Le scroll a-t-il du rythme (pas la même composition répétée section après section) ?
- [ ] Les animations correspondent-elles à un vrai changement d'état ?
- [ ] Les détails sont-ils cohérents (spacing, radius, ombres du même ordre de grandeur partout) ?
- [ ] Les chiffres/preuves affichés sont-ils tous réels ?
- [ ] Un décorateur (glow, grille de points, gradient) a-t-il une fonction, ou est-il juste "joli" ?
- [ ] Chaque accent coloré désigne-t-il bien ce qu'il prétend (violet = ResellOS, teal = Vinted) — aucun accent décoratif ?
- [ ] Tout texte coloré atteint-il 4.5:1 sur son fond (3:1 si grand) — mesuré, pas estimé ?
- [ ] Une information est-elle portée par autre chose que la seule couleur ?

---

## Annexe — traçabilité des apprentissages

Voir la synthèse complète (A/B/C) livrée dans la réponse de ce round de travail — non dupliquée ici pour éviter que ce fichier ne devienne un compte-rendu de vidéo plutôt qu'un outil de décision. Ce fichier documente les RÈGLES qui en découlent ; le raisonnement détaillé section-par-section des deux sources reste consultable directement dans `docs/design-sources/`.
