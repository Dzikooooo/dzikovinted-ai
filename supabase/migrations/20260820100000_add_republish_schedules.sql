-- ROUND 1 -- couche DB uniquement (audit scheduler valide : Supabase = source
-- de verite persistante, extension = seul executeur, chrome.alarms = simple
-- declenchement -- voir l'audit precedent). Aucune Edge Function, aucune RPC,
-- aucun trigger applicatif : cette table est une persistance passive, RIEN ne
-- l'exploite encore (ni l'extension, ni l'UI, qui garde son etat local
-- scheduledRepublishes pour ce round -- migration volontairement inerte).
--
-- Un "job" = une programmation de republication pour UNE annonce. Au plus UNE
-- ligne status='scheduled' par listing_id a tout instant (index unique
-- partiel ci-dessous) -- meme mecanisme d'idempotence deja eprouve par
-- listing_recommendation_log_open_unique (episodes ouverts) : "Modifier"
-- (rounds futurs) doit donc mettre a jour la ligne 'scheduled' existante,
-- jamais en inserer une seconde tant que la premiere n'est pas resolue.
--
-- package_size est la SEULE donnee de payload figee a la programmation (choix
-- humain sans equivalent dans `listings`) -- tout le reste du payload de
-- republication (titre/prix/categorie/marque/...) sera relu depuis `listings`
-- au moment de l'execution reelle (round futur), jamais fige ici : une
-- annonce peut legitimement changer (voire etre vendue) entre la
-- programmation et l'heure prevue, voir checkListingRepublishEligible
-- (src/lib/actions/checks.ts) qui re-verifie deja l'eligibilite au moment du
-- clic aujourd'hui -- meme discipline a l'execution differee.
--
-- locked_at/locked_by : claim d'execution (round futur, extension) via une
-- simple UPDATE ... WHERE status='scheduled' conditionnelle -- Postgres
-- garantit qu'une seule requete concurrente peut reussir cette transition,
-- aucune table de verrou separee ni RPC necessaire pour ca.

create table republish_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  listing_id uuid not null references listings(id) on delete cascade,
  -- NOT NULL ici (contrairement a listings.vinted_account_id, optionnel) :
  -- une programmation sans compte Vinted cible n'a aucun sens. `on delete
  -- cascade` (jamais `set null`, qui violerait ce NOT NULL) -- si le compte
  -- Vinted est retire, une republication programmee pour ce compte n'a plus
  -- de sens non plus, coherent avec `listing_id` ci-dessus.
  vinted_account_id uuid not null references vinted_accounts(id) on delete cascade,

  scheduled_for timestamptz not null,

  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'succeeded', 'failed', 'cancelled')),
  -- Enum explicite (check constraint), pas un simple commentaire -- suit la
  -- convention la plus recente du schema (listing_recommendation_log.kind/
  -- confidence/cta_type), plus stricte que l'ancien style de action_log.status
  -- (texte libre, seulement documente en commentaire).
  package_size text not null
    check (package_size in ('small', 'medium', 'large')),

  attempt_count integer not null default 0,
  locked_at timestamptz,
  locked_by text,

  result_vinted_item_id text,
  result_vinted_url text,
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Jobs dus : la requete reelle du futur executeur sera
-- "where status='scheduled' and scheduled_for <= now()" -- index partiel
-- scope directement sur ce cas, jamais sur les lignes deja resolues.
create index republish_schedules_due_idx
  on republish_schedules (scheduled_for)
  where status = 'scheduled';

-- Historique par utilisateur (affichage futur cote app), plus recent en tete.
create index republish_schedules_user_id_idx
  on republish_schedules (user_id, scheduled_for desc);

-- Coeur de l'idempotence de programmation : au plus une ligne ACTIVE
-- ('scheduled' OU 'running') par annonce, meme sous ecriture concurrente
-- (deux onglets) -- une seconde tentative d'INSERT viole cet index (23505),
-- a traiter cote application (round futur) comme "cette annonce a deja une
-- programmation active" plutot que comme une erreur inattendue. Couvre
-- explicitement 'running' en plus de 'scheduled' : sans ca, une annonce dont
-- le job est deja en cours d'execution (status='running', donc sorti du
-- filtre 'scheduled' seul) pourrait recevoir une SECONDE programmation
-- pendant que la premiere tourne encore -- exactement le risque de double
-- republication que ce round doit fermer en amont, avant meme qu'un
-- executeur existe. 'succeeded'/'failed'/'cancelled' restent
-- delibersement HORS de cet index : une reprogrammation apres resolution
-- doit rester possible (nouvelle ligne 'scheduled', l'ancienne ligne
-- resolue ne bloque plus rien). Meme mecanisme exact que
-- listing_recommendation_log_open_unique.
create unique index republish_schedules_one_active_per_listing
  on republish_schedules (listing_id)
  where status in ('scheduled', 'running');

alter table republish_schedules enable row level security;

create policy "select_own_republish_schedules" on republish_schedules for select
  to authenticated using (auth.uid() = user_id);

-- with check verifie que listing_id ET vinted_account_id appartiennent bien a
-- l'utilisateur authentifie (les deux NOT NULL ici, contrairement a
-- action_log ou ils sont optionnels -- pas de branche "is null or ...").
create policy "insert_own_republish_schedules" on republish_schedules for insert
  to authenticated with check (
    auth.uid() = user_id
    and listing_id in (select id from listings where user_id = auth.uid())
    and vinted_account_id in (select id from vinted_accounts where user_id = auth.uid())
  );

-- update necessaire pour : Modifier (scheduled_for/package_size), Annuler
-- (status='cancelled'), et le futur claim d'execution cote extension
-- (status/locked_at/locked_by/result_*/error_message/started_at/completed_at)
-- -- l'extension ecrit avec le JWT de l'utilisateur proprietaire
-- (supabaseWithToken, meme mecanisme deja utilise par sync.ts), jamais de
-- role service_role : cette seule policy suffit, aucune RPC necessaire.
create policy "update_own_republish_schedules" on republish_schedules for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Pas de policy delete : annuler une programmation est une mise a jour de
-- statut ('cancelled'), jamais une suppression -- meme discipline que
-- action_log/listing_recommendation_log (aucune des deux n'expose delete),
-- garde une trace consultable de ce qui a ete annule.
