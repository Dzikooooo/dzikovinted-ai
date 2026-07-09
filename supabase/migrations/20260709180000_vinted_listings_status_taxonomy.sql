-- Fiabilisation de la page Stock : la taxonomie de statut initiale
-- (actif/vendu/vendu_non_finalise/reserve/masque/brouillon) est remplacee par
-- une taxonomie anglaise stable, incluant deux etats qui n'existaient pas
-- encore : 'deleted' (annonce disparue d'un scan, desormais une mise a jour
-- de statut plutot qu'une suppression physique - preserve l'historique) et
-- 'unknown' (item recupere sans titre exploitable, remonte plutot que
-- silencieusement ignore). Pas de contrainte CHECK : reste volontairement
-- flexible si Vinted introduit un nouvel etat.

alter table vinted_listings add column if not exists brand text;
alter table vinted_listings add column if not exists size text;

update vinted_listings set status = case status
  when 'actif' then 'online'
  when 'reserve' then 'reserved'
  when 'vendu_non_finalise' then 'sold_pending'
  when 'vendu' then 'sold_completed'
  when 'brouillon' then 'draft'
  when 'masque' then 'hidden'
  else status
end;

alter table vinted_listings alter column status set default 'online';
