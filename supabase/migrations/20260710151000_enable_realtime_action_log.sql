-- Supabase Realtime necessite qu'une table soit explicitement ajoutee a la
-- publication supabase_realtime pour que postgres_changes fonctionne - verifie
-- via pg_publication_tables, aucune table du projet n'y figurait avant cette
-- migration. Necessaire pour que le Centre des Actions reflete une action en
-- cours meme depuis un autre onglet (voir ARCHITECTURE.md, premiere
-- introduction de Realtime cote app web).
alter publication supabase_realtime add table action_log;
alter publication supabase_realtime add table action_log_entries;
