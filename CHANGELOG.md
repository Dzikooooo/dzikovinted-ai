# Changelog

Résumé court des changements livrés, orienté utilisateur. Le détail technique complet vit dans [ROADMAP.md](ROADMAP.md), [ARCHITECTURE.md](ARCHITECTURE.md) et [DATABASE.md](DATABASE.md).

## 2026-07-12 — Watchlist personnelle + Opportunity Intelligence

**Watchlist personnelle**
- Nouvelle page "Watchlist" : chaque revendeur ajoute, édite, active/désactive et supprime ses propres recherches (marque, modèle, catégorie, priorité).
- Les 7 recherches historiques de la plateforme restent actives pour tout le monde, affichées en lecture seule ("Recommandé").
- Le scan évite de payer deux fois le même coût si plusieurs utilisateurs suivent la même marque/modèle.

**Opportunity Intelligence**
- Chaque opportunité affiche désormais un verdict clair : 🔥 Excellent Deal, 🟢 Achat recommandé, 🟡 À surveiller, 🔴 Trop risqué — filtrable comme le reste.
- La section "Pourquoi cette opportunité ?" affiche les vrais chiffres (% sous le marché, nombre d'annonces comparables, ROI, délai de revente moyen), pas seulement des paliers abstraits.
- Le moteur confirme désormais explicitement quand un prix est stable, pas seulement quand il est volatil.
- Performance : requête d'historique de prix indexée et plafonnée pour rester rapide à grande échelle.

**Aucune régression, aucun changement de design** — même identité visuelle, mêmes pages, mêmes flux existants inchangés.

---

## 2026-07-12 — Audit senior + fondations UX (passe précédente)

- Bibliothèque de composants partagés (`Button`, `Card` retiré ensuite car inutilisé, `Modal`, `Skeleton`, `EmptyState`, `ErrorBanner`) — 4 fenêtres modales de plus migrées vers le composant partagé (piège à focus, fermeture Échap/clic-extérieur).
- 3 erreurs Supabase auparavant silencieuses (Stock, Dashboard, Centre des Actions) affichent désormais un vrai message d'erreur.
- Favoris sur les opportunités, recherche rapide, tri 100% côté client.
- 4 nouvelles métriques marché sur le Dashboard.
- Nettoyage : code mort supprimé, largeurs de page harmonisées.
