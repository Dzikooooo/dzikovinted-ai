-- Bug reel confirme le 2026-07-27 (suite du diagnostic de l'annonce
-- disparue, voir 20260727160000_fix_sku_trigger_timing.sql) : une fois le
-- trigger SKU corrige, l'utilisateur a confirme que l'annonce etait bien
-- reapparue en base mais restait invisible dans StockPage.tsx tant qu'un
-- F5 manuel n'etait pas fait -- pas un probleme de donnees, un probleme
-- d'affichage.
--
-- Cause racine : resolveOrCreateVintedAccount() (extension/src/background/
-- sync.ts) met a jour vinted_accounts.last_synced_at, et est appelee a la
-- fois par recordAccountDetected() (quasi instantanee, avant meme le debut
-- de la recuperation paginee du wardrobe) ET par recordListings() (apres
-- l'ecriture reelle des annonces, potentiellement plusieurs secondes plus
-- tard pour un wardrobe volumineux). Le sondage de fin de synchro cote UI
-- (StockPage.tsx::handleSync) s'arretait au TOUT PREMIER changement
-- detecte de last_synced_at -- presque toujours celui d'ACCOUNT_DETECTED,
-- pas celui de la vraie synchro des annonces -- et rechargeait la liste
-- trop tot, avant que recordListings() ait fini d'ecrire.
--
-- Fix : colonne dediee, ecrite UNIQUEMENT par recordListings() (jamais par
-- recordAccountDetected()) -- signal non ambigu de "les annonces
-- elles-memes ont ete synchronisees", distinct de "le compte a ete
-- detecte". StockPage.tsx::handleSync sonde desormais cette colonne
-- precisement plutot que last_synced_at.

alter table public.vinted_accounts
  add column if not exists listings_synced_at timestamptz;
