-- Fermeture P0 #7 (audit pre-lancement 2026-07-10, encore ouvert le
-- 2026-08-29) : AccountingPage.tsx filtre deja le CA/la marge par compte
-- Vinted selectionne (listings.vinted_account_id), mais `expenses` n'a
-- jamais eu de colonne equivalente -- les depenses de TOUS les comptes
-- etaient donc toujours soustraites du benefice d'un seul compte filtre,
-- un chiffre faux sur un outil dont la comptabilite sert a une vraie
-- declaration URSSAF.
--
-- Nullable + ON DELETE SET NULL : meme convention que listings.vinted_account_id
-- (20260709190000) et action_log.vinted_account_id (20260710120000) -- une
-- depense reste apres deconnexion du compte, simplement detachee, jamais
-- supprimee. Nullable aussi pour les depenses "generales" non rattachees a
-- un compte precis (materiel partage entre plusieurs comptes, etc.).
alter table public.expenses
  add column if not exists vinted_account_id uuid references public.vinted_accounts(id) on delete set null;

create index if not exists expenses_vinted_account_id_idx on public.expenses (vinted_account_id);
