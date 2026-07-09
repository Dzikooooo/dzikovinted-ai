# Extension Chrome ResellOS

Étape 1.1 du plan Phase 1 (voir [../EXTENSION.md](../EXTENSION.md)) : scaffold + appairage avec la session Supabase de l'app web. **Validée en conditions réelles** (extension chargée non empaquetée, cycle appairage → dissociation → ré-appairage rejoué avec succès, RLS et données vérifiées en base à chaque étape). Pas encore de détection de compte Vinted ni de synchronisation d'annonces (étapes 1.2/1.3).

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

## Structure (étape 1.1)

```
src/
  background/    service worker : seul composant a parler a Supabase (voir EXTENSION.md §4)
    index.ts        routeur de messages (externes depuis l'app web, internes depuis le popup)
    supabaseClient.ts  client Supabase, storage adapter chrome.storage.local
    pairing.ts       traite PAIR/UNPAIR, lit le statut
    logger.ts         logger leve + ring buffer persiste (50 dernieres entrees)
    retry.ts           backoff exponentiel pour les ecritures Supabase
  popup/          UI (statut connexion, journal) - styles inline, pas de Tailwind ici
  lib/
    messages.ts     contrat de messages partage (seule source de verite des types de message)
    env.ts            lecture des variables Vite
```

Pas de `content/` pour l'instant — arrive à l'étape 1.2 (détection de compte Vinted), une fois les vrais sélecteurs DOM de vinted.fr observés en conditions réelles.

## Pourquoi un paquet indépendant

Pas de workspace/monorepo (voir EXTENSION.md §9) : `extension/` a son propre `package.json`/`vite.config.ts`/`tsconfig.json`, indépendant de la racine. Duplication assumée (types, config ESLint) — la surface commune est petite, un outillage monorepo serait prématuré.
