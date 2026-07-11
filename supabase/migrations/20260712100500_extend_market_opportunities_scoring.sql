-- Colonnes nullables uniquement : market_opportunities est integralement
-- recreee a chaque scan (delete-all + upsert, voir scripts/vinted-scan.ts),
-- donc aucun backfill n'est necessaire - le prochain scan repeuple tout avec
-- les nouvelles colonnes. Alimentees par scripts/opportunity-engine/.

alter table market_opportunities
  add column if not exists risk_level text,               -- 'faible' | 'modere' | 'eleve', null si pas encore calcule
  add column if not exists breakdown jsonb,                -- [{label, delta, kind}] - alimente le checklist cote UI (OpportunityCard)
  add column if not exists resale_days_min integer,        -- null tant que l'historique de revente est insuffisant
  add column if not exists resale_days_max integer,
  add column if not exists resale_confidence numeric,      -- distinct de `confidence` (confiance du prix) - confiance de l'estimation de delai de revente
  add column if not exists first_observed_at timestamptz,  -- premiere fois que ResellOS a vu cette annonce (PAS l'age reel Vinted)
  add column if not exists competing_listings_count integer; -- nb d'annonces comparables dans le meme batch de scan
