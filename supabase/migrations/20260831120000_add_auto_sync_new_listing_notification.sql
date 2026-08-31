-- Sync automatique en arriere-plan (2026-08-31, demande produit) : un
-- nouveau type de notification pour signaler qu'un article a ete detecte et
-- importe SANS intervention manuelle (scripts/vinted-wardrobe-sync.ts, cron
-- GitHub Actions toutes les 4h, meme rythme que scan-market.yml). Distinct
-- de 'sync_success' (qui concerne un ARTICLE DEJA CONNU dont le statut se
-- synchronise) : ici l'article lui-meme vient d'apparaitre, jamais vu avant.
--
-- Ecrite directement par le script (jamais un trigger sur listings) : a la
-- difference de sync_success/sync_failed/waitlist_signup (plusieurs
-- ecrivains possibles sur la meme colonne, un trigger est le seul point
-- unique fiable), UN SEUL code appelle cette insertion -- pas de duplication
-- a eviter, pas de raison d'ajouter une colonne/trigger pour un seul
-- appelant.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('sale', 'community', 'admin_broadcast', 'ticket_reply', 'stock_alert', 'sync_success', 'sync_failed', 'waitlist_signup', 'auto_sync_new_listing'));
