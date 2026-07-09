# Extension Chrome ResellOS

Phase 1 complète (voir [../EXTENSION.md](../EXTENSION.md)) : 1.1 (scaffold + appairage), 1.2 (détection du compte Vinted), 1.3 (synchronisation des annonces). **Les trois validées en conditions réelles** avec un compte Vinted réel : appairage → dissociation → ré-appairage, détection automatique du compte au chargement de `vinted.fr/member/<id>` (avec test négatif confirmé sur le profil d'un autre utilisateur), puis synchronisation de 20 annonces réelles avec vérification de non-duplication sur re-synchronisation.

**Piège rencontré en test live, à connaître avant de toucher à `pairing.ts`** : ne jamais utiliser `supabase.auth.setSession()`/`getSession()`/`signOut()` sans option explicite dans ce fichier — `setSession()` s'est montré peu fiable dans le contexte service worker MV3, et `signOut()` sans `{ scope: 'local' }` révoque la session côté serveur pour tous les clients qui la partagent, y compris l'app web. La gestion de session est volontairement self-managed (validation stateless + persistance manuelle dans `chrome.storage.local`) — voir EXTENSION.md §3 pour le détail complet de cette décision et du bug qui l'a motivée.

## Développement

```bash
cd extension
npm install
cp .env.example .env   # memes valeurs VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY que le .env racine
npm run build
```

Le build produit `extension/dist/`. Charger l'extension dans Chrome :

1. `chrome://extensions`
2. Activer "Mode développeur" (en haut à droite)
3. "Charger l'extension non empaquetée" → sélectionner `extension/dist`
4. Noter l'ID généré (affiché sous le nom de l'extension) et le mettre dans `VITE_RESELLOS_EXTENSION_ID` du `.env` **racine du repo** (pas celui de `extension/`) — c'est l'app web qui a besoin de connaître cet ID pour s'adresser à l'extension via `chrome.runtime.sendMessage`

Après toute modification du code de l'extension : `npm run build` puis, dans `chrome://extensions`, cliquer l'icône de rechargement de la carte de l'extension (l'ID reste stable tant qu'on recharge le même dossier `dist`).

## Vérifications avant de committer

```bash
npm run typecheck
npm run lint
npm run build
```

## Structure (Phase 1 complète)

```
src/
  background/    service worker : seul composant a parler a Supabase (voir EXTENSION.md §4)
    index.ts        routeur de messages (externes depuis l'app web, internes depuis popup/content scripts)
    supabaseClient.ts  client Supabase + supabaseWithToken() (client a portee de requete)
    session.ts        gestion de session self-managed (lecture/ecriture/rafraichissement)
    pairing.ts       traite PAIR/UNPAIR, lit le statut (utilise session.ts)
    sync.ts            traite les detections des content scripts (utilise session.ts)
    logger.ts         logger leve + ring buffer persiste (50 dernieres entrees)
    retry.ts           backoff exponentiel pour les ecritures Supabase
  content/
    vinted-profile.ts  injecte sur vinted.fr/member/* - detecte le propre profil + les annonces visibles
    selectors.ts         selecteurs DOM Vinted centralises (verifies en direct, voir EXTENSION.md)
  popup/          UI (statut connexion, journal) - styles inline, pas de Tailwind ici
  lib/
    messages.ts     contrat de messages partage (seule source de verite des types de message)
    env.ts            lecture des variables Vite
```

## Pourquoi un paquet indépendant

Pas de workspace/monorepo (voir EXTENSION.md §9) : `extension/` a son propre `package.json`/`vite.config.ts`/`tsconfig.json`, indépendant de la racine. Duplication assumée (types, config ESLint) — la surface commune est petite, un outillage monorepo serait prématuré.
