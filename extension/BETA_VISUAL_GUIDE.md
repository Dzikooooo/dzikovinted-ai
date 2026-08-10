# Storyboard visuel — Installation bêta ResellOS (8 slides)

Ce document décrit le contenu texte + captures de chaque slide d'un futur guide visuel (PDF ou carrousel d'images) pour l'installation de l'extension bêta. Aucune image n'est générée ici — uniquement la structure, le texte final et l'annotation attendue pour chaque capture, pour que quelqu'un (ou un outil de mise en page) puisse produire les visuels ensuite.

Le contenu suit fidèlement le flux réel documenté dans [BETA_INSTALL.md](BETA_INSTALL.md) (9 étapes texte) — ce storyboard en est la version condensée/illustrée, pas une variante différente.

---

## Slide 1 — Bienvenue

**Titre :** Bienvenue dans la bêta ResellOS

**Texte final :** Tu fais partie des premiers testeurs de ResellOS. Ce guide t'accompagne pas à pas pour installer l'extension Chrome — 3 minutes, aucune compétence technique requise.

**Capture nécessaire :** Aucune (slide de titre, logo ResellOS sur fond de la palette produit).

**Annotation :** Aucune.

**Objectif :** Rassurer et cadrer la durée avant de commencer.

---

## Slide 2 — Télécharger et extraire le ZIP

**Titre :** Étape 1 — Télécharger le ZIP

**Texte final :** Télécharge `resellos-extension-beta.zip`, puis décompresse-le. Tu obtiens un dossier **ResellOS-Extension** — garde-le à un endroit stable (ex. Documents), ne le supprime pas après l'installation.

**Capture nécessaire :** Fenêtre de l'explorateur de fichiers montrant le dossier `ResellOS-Extension` décompressé, avec `manifest.json` visible à l'intérieur.

**Annotation :** Flèche/entourage sur le fichier `manifest.json` pour confirmer qu'on est au bon niveau du dossier.

**Objectif :** Éviter l'erreur la plus fréquente (sélectionner le mauvais niveau de dossier à l'étape 4).

---

## Slide 3 — Activer le Mode développeur

**Titre :** Étape 2-3 — Ouvrir `chrome://extensions` et activer le Mode développeur

**Texte final :** Colle `chrome://extensions` dans la barre d'adresse, puis active l'interrupteur **"Mode développeur"** en haut à droite. C'est un réglage Chrome normal pour installer une extension bêta, rien d'inquiétant.

**Capture nécessaire :** Page `chrome://extensions` avec l'interrupteur "Mode développeur" à l'état activé (bleu/vert).

**Annotation :** Cercle rouge autour de l'interrupteur.

**Objectif :** Lever l'appréhension du terme "développeur" pour un public non technique.

---

## Slide 4 — Charger l'extension

**Titre :** Étape 4 — Charger l'extension non empaquetée

**Texte final :** Clique sur **"Charger l'extension non empaquetée"**, puis sélectionne le dossier **ResellOS-Extension**. L'extension "ResellOS pour Vinted" apparaît dans ta liste.

**Capture nécessaire :** Deux captures — (a) les trois boutons après activation du Mode développeur, avec "Charger l'extension non empaquetée" mis en évidence ; (b) la carte "ResellOS pour Vinted" apparue dans la liste.

**Annotation :** Flèche sur le bouton (capture a) ; encadré sur la carte de l'extension (capture b).

**Objectif :** Confirmer visuellement le succès de l'étape la plus technique du guide.

---

## Slide 5 — Épingler et se connecter à ResellOS

**Titre :** Étape 5-6 — Épingler l'extension et se connecter

**Texte final :** Épingle l'extension via l'icône puzzle 🧩 pour la garder visible, puis va sur `resellosapp.com` et connecte-toi à ton compte (ou crée-en un).

**Capture nécessaire :** Menu des extensions Chrome ouvert avec l'épingle à côté de "ResellOS pour Vinted" ; page de connexion ResellOS.

**Annotation :** Flèche sur l'icône épingle.

**Objectif :** Rendre l'extension immédiatement accessible pour la suite.

---

## Slide 6 — Appairer l'extension

**Titre :** Étape 7 — Appairer l'extension

**Texte final :** Dans le tableau de bord ResellOS, va dans **"Compte Vinted"** et clique sur le bouton d'appairage. Une fenêtre Chrome peut s'afficher brièvement — laisse-la faire.

**Capture nécessaire :** Page "Compte Vinted" avec le bouton d'appairage visible avant le clic.

**Annotation :** Flèche sur le bouton d'appairage.

**Objectif :** Localiser l'action clé sans ambiguïté.

---

## Slide 7 — Détecter ton compte Vinted

**Titre :** Étape 8 — Visiter ta page de profil Vinted

**Texte final :** Ouvre Vinted dans ce même navigateur, connecte-toi, puis ouvre **ta page de profil Vinted** et attends quelques secondes. C'est cette visite qui permet à l'extension de détecter ton compte pour la première fois — une étape normale de cette version bêta, pas un bug.

**Capture nécessaire :** Page de profil Vinted de l'utilisateur (URL `vinted.fr/member/<id>` visible dans la barre d'adresse, floutée si besoin pour l'exemple).

**Annotation :** Encadré sur la barre d'adresse pour montrer qu'on est bien sur SA PROPRE page de profil (pas la page d'accueil).

**Objectif :** Rendre explicite l'étape la plus souvent oubliée — actuellement le seul point de friction connu du parcours bêta.

---

## Slide 8 — Vérifier et c'est prêt

**Titre :** Étape 9 — Vérifier que ça a marché

**Texte final :** Retourne sur ResellOS, page "Compte Vinted" : ton compte doit apparaître avec l'état **"Connectée"** (en vert). Tu peux maintenant utiliser ResellOS normalement — l'extension détecte tes annonces Vinted en arrière-plan.

**Capture nécessaire :** Page "Compte Vinted" avec un compte affichant l'état "Connectée".

**Annotation :** Encadré vert sur le badge d'état.

**Objectif :** Donner un signal de succès clair et clore le guide sur une confirmation positive.

---

## Note sur ce document

Ce storyboard a été rédigé lors de la passe d'implémentation du 2026-08-10, en cohérence avec le texte déjà validé de [BETA_INSTALL.md](BETA_INSTALL.md) (notamment son étape 8 sur la détection du compte, ajoutée dans la même passe). Si un storyboard différent avait déjà été validé verbalement lors d'un échange antérieur non conservé dans le contexte actif de cette session, relis ce fichier et signale tout écart avant de faire produire les visuels.
