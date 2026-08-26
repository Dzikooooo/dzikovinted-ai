-- Bascule atomique des opportunites (2026-08-26).
--
-- AVANT : scripts/vinted-scan.ts faisait un DELETE de toute la table au
-- DEMARRAGE du scan, puis reinserissait a la fin. Pendant les 8 a 14 minutes
-- du scan, la page Opportunites affichait donc 0 resultat -- et si le scan
-- cassait apres le DELETE, l'utilisateur restait sur une table vide sans
-- aucune opportunite, jusqu'au prochain cron (4 h plus tard).
--
-- APRES : chaque scan tague ses lignes avec un identifiant de lot, et ne
-- supprime les lignes des lots precedents qu'une fois le scan REUSSI. Un scan
-- qui echoue en cours de route ne detruit plus rien.
--
-- Colonne nullable et sans valeur par defaut : les lignes ecrites avant cette
-- migration ont scan_batch_id IS NULL, et seront nettoyees par le premier
-- scan qui reussit (son DELETE cible "tout ce qui n'est pas mon lot", donc
-- les NULL inclus -- voir le `is distinct from` cote script, `<> ` seul ne
-- matcherait jamais un NULL en SQL).
--
-- Pas de contrainte de cle etrangere vers scan_runs a dessein : l'insertion
-- dans scan_runs peut echouer sans que le scan lui-meme doive s'arreter (le
-- script logue et continue). Faire dependre la bascule de cette insertion
-- rendrait le scan plus fragile qu'avant, pas moins.

alter table market_opportunities
  add column if not exists scan_batch_id uuid;

-- Le seul acces reel a cette colonne est "supprimer tout ce qui n'appartient
-- pas au lot courant", en fin de scan, sur une table de quelques centaines de
-- lignes. L'index sert ce DELETE, et rien d'autre.
create index if not exists market_opportunities_scan_batch_id_idx
  on market_opportunities (scan_batch_id);

comment on column market_opportunities.scan_batch_id is
  'Identifiant du run de scan qui a ecrit cette ligne. Les lignes des lots precedents sont supprimees a la FIN d''un scan reussi, jamais au demarrage.';
