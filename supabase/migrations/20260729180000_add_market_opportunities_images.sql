-- Galerie photo reelle par opportunite (demande produit 2026-07-29 : carte
-- cliquable -> voir toutes les photos de l'annonce Vinted). market_opportunities
-- n'exposait jusqu'ici qu'une seule photo (colonne image) -- scripts/vinted-scan.ts
-- visite desormais la page de chaque opportunite retenue pour recuperer sa
-- galerie complete (meme selecteur verifie que extension/src/content/itemSelectors.ts,
-- extractPhotoUrls()). Nullable : une ligne peut rester sans galerie si la
-- page de l'annonce n'a pas pu etre visitee (timeout, annonce supprimee
-- entre le scrape de recherche et ce second passage).
alter table market_opportunities
  add column if not exists images text[] null;
