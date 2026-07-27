-- Tolerance de schema pour les futurs roles/paliers d'acces (Membre,
-- Client, Client Premium, Admin -- demande explicite de l'utilisateur,
-- 2026-07-27, chantier Communaute). Aucune logique d'application n'est
-- construite ici : min_plan reste toujours NULL (= aucune restriction)
-- tant qu'un vrai systeme de gating par contenu n'est pas implemente.
--
-- Choix d'architecture : 'role' (profiles.role, 'user'|'admin') reste la
-- seule distinction ADMINISTRATIVE. 'plan' (profiles.plan,
-- 'free'|'pro'|'team') est deja la distinction de PALIER D'ACCES -- pas
-- besoin d'elargir le CHECK sur role pour representer Membre/Client/
-- Client Premium, qui correspondent naturellement aux valeurs de plan
-- deja existantes. Toute table de contenu future (roadmap_items, polls,
-- suggestions, support_tickets) qui aura besoin de la meme tolerance de
-- schema doit suivre cette meme convention (colonne `min_plan text
-- references implicites aux valeurs de Plan, nullable, jamais appliquee
-- avant qu'un vrai gating soit demande`).
alter table public.community_content
  add column if not exists min_plan text check (min_plan in ('free', 'pro', 'team'));
