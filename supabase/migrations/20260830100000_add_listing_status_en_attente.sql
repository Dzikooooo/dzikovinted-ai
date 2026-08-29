-- Nouvelle rubrique "En attente" (2026-08-30, refonte Generateur) : un
-- quatrieme statut interne, distinct des trois existants
-- (listings.status in ('draft', 'en_stock', 'vendu'), contrainte posee par
-- 20260707120000_align_listings_and_expenses.sql) et distinct AUSSI de
-- l'onglet "Brouillons" deja existant cote UI (qui filtre en realite sur
-- vinted_status='draft', un concept Vinted totalement different -- une
-- annonce reellement publiee que VINTED lui-meme considere brouillon).
--
-- "en_attente" designe une annonce enregistree DEPUIS LE GENERATEUR mais
-- volontairement pas encore consideree prete (bouton dedie "Enregistrer en
-- attente", voir GeneratorPage.tsx) -- jamais publiee, jamais comptee comme
-- stock actif (voir src/lib/listingStatus.ts::isActivelyInStock), visible
-- dans son propre onglet (ListingsManagementSection.tsx) plutot que mélangee
-- a la grille "Annonces" principale.
--
-- Verifie en prod (2026-08-30) : cette contrainte n'existe en realite PAS
-- encore malgre le `check (...)` inline de la migration d'origine -- son
-- `add column IF NOT EXISTS` a du etre un no-op (colonne deja presente sans
-- ce check) la premiere fois qu'elle a tourne, donc le check n'a jamais ete
-- pose. Les 3 valeurs deja en base ('draft'/'en_stock'/'vendu', confirme par
-- requete live) restent toutes valides -- cette migration POSE la contrainte
-- pour la premiere fois plutot que d'en elargir une existante.
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('draft', 'en_stock', 'vendu', 'en_attente'));
