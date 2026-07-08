-- Faille de securite : ces policies (creees hors migration, hors sync avec le repo)
-- autorisaient n'importe quel visiteur non authentifie (cle anon, publique) a
-- inserer/modifier/supprimer n'importe quelle ligne de market_opportunities.
-- Seul le service_role (script de scan, cron GitHub Actions) doit pouvoir ecrire ;
-- il bypass RLS nativement, donc aucune policy d'ecriture n'est necessaire pour lui.
drop policy if exists "Allow public upsert market opportunities" on market_opportunities;
drop policy if exists "Allow insert market opportunities" on market_opportunities;
