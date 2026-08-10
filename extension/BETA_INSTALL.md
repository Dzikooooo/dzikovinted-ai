# Installer l'extension ResellOS (version bêta)

Ce guide t'explique comment installer l'extension ResellOS pour Chrome. Il ne faut **aucune compétence technique** — pas besoin d'installer quoi que ce soit d'autre, pas de ligne de commande.

Ça prend environ 3 minutes.

## 1. Télécharger le ZIP

Télécharge le fichier `resellos-extension-beta.zip` que tu as reçu, puis décompresse-le (double-clic dessus, ou clic droit → "Extraire tout..."). Tu obtiens un dossier nommé **ResellOS-Extension**.

Garde ce dossier quelque part de stable sur ton ordinateur (ex. dans "Documents") — ne le supprime pas après l'installation, Chrome doit pouvoir le retrouver à chaque démarrage.

## 2. Ouvrir la page des extensions Chrome

Ouvre Chrome, puis colle cette adresse dans la barre du haut et appuie sur Entrée :

```
chrome://extensions
```

## 3. Activer le "Mode développeur"

En haut à droite de cette page, il y a un interrupteur **"Mode développeur"**. Active-le (il doit passer en bleu/vert).

*(Ce nom peut faire peur, mais c'est juste le réglage Chrome qui autorise à installer une extension qui n'est pas encore sur le Store — normal pour une bêta.)*

## 4. Charger l'extension

Trois nouveaux boutons apparaissent en haut de la page. Clique sur **"Charger l'extension non empaquetée"**.

Une fenêtre de sélection de dossier s'ouvre : sélectionne le dossier **ResellOS-Extension** que tu as décompressé à l'étape 1 (celui qui contient directement le fichier `manifest.json`), puis valide.

L'extension "ResellOS pour Vinted" apparaît maintenant dans ta liste d'extensions.

## 5. L'épingler (recommandé)

Clique sur l'icône puzzle 🧩 en haut à droite de Chrome, puis clique sur l'épingle 📌 à côté de "ResellOS pour Vinted". Son icône reste maintenant visible en permanence dans la barre d'outils.

## 6. Se connecter à ResellOS

Ouvre :

```
https://www.resellosapp.com/
```

Connecte-toi à ton compte (ou crée-en un si ce n'est pas déjà fait).

## 7. Appairer l'extension

Dans le tableau de bord, va dans **"Compte Vinted"**. Tu y trouves l'état de connexion de l'extension.

Clique sur le bouton pour connecter/appairer l'extension. Une fenêtre Chrome peut s'afficher brièvement — laisse-la faire.

## 8. Détecter ton compte Vinted

Après l'appairage :

1. ouvre Vinted dans le même navigateur ;
2. connecte-toi ;
3. ouvre TA PAGE DE PROFIL VINTED ;
4. attends quelques secondes ;
5. retourne dans ResellOS ;
6. vérifie que ton compte apparaît.

C'est cette visite de ta page de profil qui permet à l'extension de détecter ton compte pour la première fois — une étape normale de cette version bêta.

## 9. Vérifier que ça a marché

Toujours sur la page "Compte Vinted", ton compte doit maintenant apparaître avec l'état **"Connectée"** (ou équivalent, en vert). C'est le signal que tout fonctionne : tu peux maintenant naviguer sur Vinted normalement, l'extension se charge d'y détecter tes annonces.

---

## Dépannage rapide

**L'extension n'apparaît pas dans `chrome://extensions` après l'étape 4**
Vérifie que tu as bien sélectionné le dossier **ResellOS-Extension** lui-même (celui qui contient `manifest.json`), pas un dossier au-dessus ou en dessous. Si tu as sélectionné le mauvais dossier, Chrome affiche une erreur claire — recommence l'étape 4 avec le bon dossier.

**J'ai sélectionné le mauvais dossier**
Retourne dans `chrome://extensions`, retrouve la carte "ResellOS pour Vinted" si elle existe (sinon rien à faire) et supprime-la avec "Supprimer", puis recommence l'étape 4.

**L'état reste sur "Déconnectée" ou "Non appairée" après l'étape 7**
Recharge la page `resellosapp.com` et réessaie l'appairage. Si ça persiste, va dans `chrome://extensions`, trouve la carte "ResellOS pour Vinted" et clique sur l'icône de rechargement (flèche circulaire) dessus, puis recommence à partir de l'étape 6.

**Mon compte n'apparaît toujours pas après l'étape 8**
Vérifie que tu as bien ouvert TA PAGE DE PROFIL Vinted (celle avec tes propres annonces, pas la page d'accueil ni la fiche d'un autre vendeur) et que tu es bien connecté à Vinted dans ce même navigateur. Recharge cette page de profil, attends quelques secondes, puis retourne sur ResellOS.

**L'appairage a échoué avec un message d'erreur**
Vérifie que tu es bien connecté sur `resellosapp.com` (pas juste sur la page de connexion) avant de cliquer sur "Appairer". Recharge la page et réessaie.

**Après avoir fermé et rouvert Chrome, l'extension a disparu**
C'est normal si le dossier **ResellOS-Extension** a été déplacé ou supprimé entre-temps — Chrome a besoin qu'il reste au même endroit pour une extension chargée en mode "non empaquetée". Remets-le à son emplacement d'origine, ou recommence l'étape 4 depuis son nouvel emplacement.

**Besoin d'aide ?** Contacte l'équipe ResellOS directement.
