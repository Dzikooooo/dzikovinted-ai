import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Convention deja utilisee dans le repo (ex. scanMarket.ts::execute,
      // params `_request`/`_ctx`/`_deps`) mais qui ne declenchait jamais la
      // regle par defaut (args:'after-used' ignore un unused suivi d'un
      // param utilise). Les fakes de test Deno du chantier Stripe (Lots 2-4,
      // supabase/functions/**) exposent des parametres intentionnellement
      // inutilises en toute fin de signature -- ce cas n'etait pas couvert,
      // d'ou ce pattern explicite plutot que de renommer chaque parametre.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
);
