import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, ChevronDown, Heart, ImageOff, Search, SlidersHorizontal, Sparkles, Tag, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import type { MarketOpportunity, OpportunityBreakdownEntry, OpportunityFilters, OpportunityRiskLevel } from "../../lib/types";
import { OPPORTUNITY_CATEGORIES } from "../../lib/opportunityCategories";
import { computeVerdict, VERDICT_BADGES } from "../../lib/opportunityVerdict";
import { formatEUR } from "../../lib/currency";
import { VINTED_INK } from "../../lib/brandColors";
import { buildOpportunityChips, MAX_CARD_CHIPS } from "../../lib/opportunityChips";
import { formatRelativeSync } from "../../lib/formatRelativeTime";
import { StatCard } from "../../components/ui/StatCard";
import { OneScoreBar } from "../../components/ui/OneScoreBar";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { FilterPill } from "../../components/ui/FilterPill";
import { SearchInput } from "../../components/ui/SearchInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useActionEngine } from "../../hooks/useActionEngine";
import { buildScanFailureState } from "../../lib/actions/scanFailureState";
import ScanProgressModal from "../../components/opportunities/ScanProgressModal";
import OpportunityFilterPanel, { countAdvancedFilters } from "../../components/opportunities/OpportunityFilterPanel";

type SortBy = "score" | "profit" | "roi" | "created_at" | "price_found";
type CategoryFilter = "all" | (typeof OPPORTUNITY_CATEGORIES)[number];

const RISK_BADGE: Record<OpportunityRiskLevel, { label: string; className: string }> = {
  faible: { label: "Risque estimé : faible", className: "bg-neon-500/15 text-neon-500 border border-neon-500/30" },
  // Meme correction que VERDICT_BADGES : amber-400 sur fond amber-400/15
  // mesure 1.43:1, amber-700 y mesure 4.68:1.
  modere: { label: "Risque estimé : modéré", className: "bg-amber-400/15 text-amber-700 border border-amber-400/30" },
  eleve: { label: "Risque estimé : élevé", className: "bg-red-400/15 text-red-700 border border-red-400/30" },
};

function daysSince(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "aujourd'hui";
  return `${days} jour${days > 1 ? "s" : ""}`;
}

const EMPTY_FILTERS: OpportunityFilters = {
  category: "all",
  brands: [],
  minScore: null,
  minConfidence: null,
  minRoi: null,
  minProfit: null,
  maxBudget: null,
  maxResaleDays: null,
  riskLevels: [],
  verdicts: [],
};

interface OpportunitiesProps {
  onViewAction?: (actionId: string) => void;
}

interface ScanState {
  historyId: string | null;
  done: boolean;
  error: string | null;
  opportunitiesFound: number | null;
  failedSearches: number | null;
}

interface LastScanRun {
  status: "running" | "success" | "error";
  startedAt: string;
  completedAt: string | null;
}

export default function Opportunities({ onViewAction }: OpportunitiesProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [filters, setFilters] = useState<OpportunityFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [favouriteUrls, setFavouriteUrls] = useState<Set<string>>(new Set());
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  // Replie par defaut : les filtres avances servent a affiner une recherche
  // deja lancee, pas a la demarrer -- les laisser deplies coutait ~180px de
  // hauteur avant la premiere carte, a chaque visite.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [lastScanRun, setLastScanRun] = useState<LastScanRun | null>(null);
  const { prepareAction, confirmAction } = useActionEngine();

  // "Dernier scan" (cron 4h ou manuel) : sans ca, un scan planifie qui
  // echoue apres avoir vide market_opportunities est indiscernable d'un
  // simple manque de donnees pour l'utilisateur - meme ecran vide dans les
  // deux cas (audit du parcours Scanner, 2026-07-24). scan_runs est ecrite
  // pour CHAQUE run, contrairement a action_log qui ne concerne que les
  // scans manuels.
  const loadLastScanRun = useCallback(async () => {
    const { data } = await supabase
      .from("scan_runs")
      .select("status, started_at, completed_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setLastScanRun({ status: data.status, startedAt: data.started_at, completedAt: data.completed_at });
    }
  }, []);

  useEffect(() => {
    loadLastScanRun();
  }, [loadLastScanRun]);

  // Le tri se fait desormais cote client (voir sortedProducts) : plus besoin
  // de refaire un aller-retour reseau a chaque changement de sortBy, exactement
  // comme tous les autres filtres de cette page qui operent deja sur le
  // meme jeu de donnees deja charge.
  const loadProducts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("market_opportunities")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setLoadError("Impossible de charger les opportunités. Réessaie plus tard.");
    } else {
      setLoadError(null);
      if (data) setProducts(data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Favoris : market_opportunities est integralement recreee a chaque scan
  // (voir ARCHITECTURE.md §4.8), une colonne "favori" dessus serait effacee
  // toutes les ~4h - stockes dans une table dediee cle par vinted_url, pas
  // par market_opportunities.id qui change a chaque scan.
  useEffect(() => {
    if (!user) return;
    let ignore = false;
    (async () => {
      const { data, error } = await supabase
        .from("opportunity_favourites")
        .select("vinted_url")
        .eq("user_id", user.id);
      if (!ignore && !error && data) {
        setFavouriteUrls(new Set(data.map((row) => row.vinted_url)));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [user]);

  // Mise a jour optimiste : le coeur reagit immediatement au clic. En cas
  // d'echec de l'ecriture, on annule le changement local (le coeur reprend
  // son etat reel) plutot que de laisser l'UI mentir sur un favori jamais
  // reellement enregistre -- reverter est le retour visible suffisant pour
  // une action aussi legere, pas besoin d'un toast.
  const toggleFavourite = useCallback(
    async (vintedUrl: string) => {
      if (!user) return;
      const isFavourited = favouriteUrls.has(vintedUrl);

      setFavouriteUrls((prev) => {
        const next = new Set(prev);
        if (isFavourited) next.delete(vintedUrl);
        else next.add(vintedUrl);
        return next;
      });

      const { error } = isFavourited
        ? await supabase
            .from("opportunity_favourites")
            .delete()
            .eq("user_id", user.id)
            .eq("vinted_url", vintedUrl)
        : await supabase.from("opportunity_favourites").insert({ user_id: user.id, vinted_url: vintedUrl });

      if (error) {
        console.error(error);
        setFavouriteUrls((prev) => {
          const next = new Set(prev);
          if (isFavourited) next.add(vintedUrl);
          else next.delete(vintedUrl);
          return next;
        });
      }
    },
    [user, favouriteUrls]
  );

  const isScanning = !!scanState && !scanState.done;

  async function scanNow() {
    if (isScanning) return;
    setScanState({ historyId: null, done: false, error: null, opportunitiesFound: null, failedSearches: null });

    const prepared = await prepareAction("scan_market", {});
    if (!prepared.ok) {
      setScanState({ historyId: null, done: true, error: prepared.failure.message, opportunitiesFound: null, failedSearches: null });
      return;
    }

    setScanState({ historyId: prepared.prepared.id, done: false, error: null, opportunitiesFound: null, failedSearches: null });

    // P1-6 (Freeze Audit correctif) : confirmAction() peut rejeter (ex.
    // updateHistoryRow leve si l'ecriture action_log echoue, useActionEngine.ts)
    // -- sans ce try/catch, isScanning restait bloque a `true` pour toujours
    // (scanState.done jamais mis a jour), bouton "Scanner maintenant" fige
    // sans aucun message d'erreur. Jamais de message technique brut affiche
    // (meme discipline que translateExtensionError/translateAuthError).
    let result;
    try {
      result = await confirmAction(prepared.prepared);
    } catch {
      setScanState(buildScanFailureState(prepared.prepared.id));
      await loadLastScanRun();
      return;
    }

    if (result.outcome.status === "success") {
      const found = (result.outcome.resultPayload?.opportunitiesFound as number | undefined) ?? 0;
      const failed = (result.outcome.resultPayload?.failedSearches as number | undefined) ?? 0;
      setScanState({ historyId: prepared.prepared.id, done: true, error: null, opportunitiesFound: found, failedSearches: failed });
      await loadProducts();
    } else if (result.outcome.status === "error") {
      setScanState({ historyId: prepared.prepared.id, done: true, error: result.outcome.errorMessage, opportunitiesFound: null, failedSearches: null });
    } else {
      setScanState({
        historyId: prepared.prepared.id,
        done: true,
        error: "Cette action n'est pas encore disponible.",
        opportunitiesFound: null,
        failedSearches: null,
      });
    }
    await loadLastScanRun();
  }

  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const item of products) {
      if (item.brand) brands.add(item.brand);
    }
    return Array.from(brands).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((item) => {
      if (filters.category !== "all" && item.category !== filters.category) return false;
      if (filters.brands.length > 0 && (!item.brand || !filters.brands.includes(item.brand))) return false;
      if (filters.minScore !== null && Number(item.score ?? 0) < filters.minScore) return false;
      if (filters.minConfidence !== null && Number(item.confidence ?? 0) < filters.minConfidence) return false;
      if (filters.minRoi !== null && Number(item.roi ?? 0) < filters.minRoi) return false;
      if (filters.minProfit !== null && Number(item.profit ?? 0) < filters.minProfit) return false;
      if (filters.maxBudget !== null && Number(item.price_found ?? Infinity) > filters.maxBudget) return false;
      if (filters.maxResaleDays !== null) {
        if (item.resale_days_max === null) return false;
        if (item.resale_days_max > filters.maxResaleDays) return false;
      }
      if (filters.riskLevels.length > 0 && (!item.risk_level || !filters.riskLevels.includes(item.risk_level))) return false;
      if (filters.verdicts.length > 0) {
        const verdict = computeVerdict(Number(item.score ?? 0), Number(item.confidence ?? 0), item.risk_level);
        if (!filters.verdicts.includes(verdict)) return false;
      }
      if (favouritesOnly && (!item.vinted_url || !favouriteUrls.has(item.vinted_url))) return false;
      if (query) {
        const haystack = `${item.title} ${item.brand ?? ""} ${item.category ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [products, filters, favouritesOnly, favouriteUrls, search]);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const aVal = Number(a[sortBy] ?? 0);
      const bVal = Number(b[sortBy] ?? 0);
      return bVal - aVal;
    });
  }, [filteredProducts, sortBy]);

  const stats = useMemo(() => {
    const count = filteredProducts.length;
    const avgProfit =
      count === 0
        ? 0
        : filteredProducts.reduce((sum, item) => sum + Number(item.profit || 0), 0) / count;

    const avgRoi =
      count === 0
        ? 0
        : filteredProducts.reduce((sum, item) => sum + Number(item.roi || 0), 0) / count;

    const bestProfit =
      count === 0
        ? 0
        : Math.max(...filteredProducts.map((item) => Number(item.profit || 0)));

    return {
      count,
      avgProfit: Math.round(avgProfit),
      avgRoi: Math.round(avgRoi),
      bestProfit: Math.round(bestProfit),
    };
  }, [filteredProducts]);

  // Marque la plus representee dans le marche scanne (toutes opportunites,
  // pas seulement celles filtrees -- reflete le marche dans son ensemble,
  // pas la vue courante de l'utilisateur).
  const topBrand = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of products) {
      if (item.brand) counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
    }
    let best: { brand: string; count: number } | null = null;
    for (const [brand, count] of counts) {
      if (!best || count > best.count) best = { brand, count };
    }
    return best;
  }, [products]);

  const categories: CategoryFilter[] = ["all", ...OPPORTUNITY_CATEGORIES];
  const activeAdvancedCount = countAdvancedFilters(filters);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={
          loading ? (
            <>Opportunités <span className="text-neon-500">Vinted</span></>
          ) : (
            <>
              {products.length} opportunité{products.length !== 1 ? 's' : ''}{' '}
              <span className="text-neon-500">détectée{products.length !== 1 ? 's' : ''}</span>
            </>
          )
        }
        description={
          <>
            Les meilleures opportunités détectées en temps réel.
            {lastScanRun && (
              <span className="block text-xs text-gray-500 mt-1.5">
                {lastScanRun.status === "success" && lastScanRun.completedAt
                  ? `Dernier scan réussi : ${formatRelativeSync(lastScanRun.completedAt)}`
                  : lastScanRun.status === "error"
                    ? "Le dernier scan automatique a échoué — nouvelle tentative au prochain passage (toutes les 4h), ou lance un scan manuel."
                    : "Un scan est en cours."}
              </span>
            )}
          </>
        }
        action={
          <Button
            onClick={scanNow}
            disabled={isScanning}
            loading={isScanning}
            icon={!isScanning && <Search className="w-4 h-4" />}
          >
            {isScanning ? "Scan en cours" : "Scanner maintenant"}
          </Button>
        }
      />

      {loadError && <ErrorBanner message={loadError} className="mb-6" />}

      {lastScanRun?.status === "error" && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
          <p className="text-sm text-red-700">
            Le dernier scan automatique a échoué. Les opportunités ci-dessous peuvent être obsolètes — un nouveau scan aura lieu automatiquement dans les prochaines heures, ou lance-le toi-même.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <StatCard size="lg" label="Opportunités" value={stats.count} highlight tone="attention" />
        <StatCard size="lg" label="Profit moyen" value={`+${formatEUR(stats.avgProfit)}`} highlight tone="positive" />
        <StatCard size="lg" label="ROI moyen" value={`+${stats.avgRoi}%`} highlight tone="positive" />
        <StatCard size="lg" label="Meilleur deal" value={`+${formatEUR(stats.bestProfit)}`} highlight tone="positive" />
        <StatCard size="lg" icon={Tag} label="Marque la plus vue" value={topBrand ? topBrand.brand : "-"} />
      </div>

      {/* Ligne 1 : chercher et ordonner -- les deux gestes qu'on refait le
          plus souvent, donc toujours visibles, jamais replies. */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une opportunité..."
          className="flex-1 min-w-0"
        />
        <SegmentedControl
          options={[
            { value: "score", label: "Score" },
            { value: "profit", label: "Profit" },
            { value: "roi", label: "ROI" },
            { value: "price_found", label: "Prix" },
            { value: "created_at", label: "Récent" },
          ]}
          value={sortBy}
          onChange={setSortBy}
          className="flex-shrink-0 self-start lg:self-auto"
        />
      </div>

      {/* Ligne 2 : filtres rapides + acces aux filtres avances. */}
      <div className={`flex flex-wrap items-center gap-1 ${advancedOpen ? "mb-3" : "mb-5"}`}>
        {categories.map((cat) => (
          <FilterPill
            key={cat}
            label={cat === "all" ? "Toutes" : cat}
            active={filters.category === cat}
            onClick={() => setFilters({ ...filters, category: cat })}
          />
        ))}
        <FilterPill
          label="Favoris"
          active={favouritesOnly}
          onClick={() => setFavouritesOnly((v) => !v)}
          icon={<Heart className={`w-3.5 h-3.5 ${favouritesOnly ? "fill-current" : ""}`} />}
        />

        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="opportunity-advanced-filters"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ml-auto flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-500/50 focus-visible:ring-offset-2 ${
            advancedOpen || activeAdvancedCount > 0
              ? "bg-neon-500/10 text-neon-600"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtres avancés
          {/* Le compte reste affiche panneau REPLIE : sinon un filtre actif
              deviendrait invisible et on ne comprendrait plus pourquoi la
              grille est vide. Le nombre double le code couleur, il ne s'y
              substitue pas. */}
          {activeAdvancedCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-neon-600 text-white text-[10px] font-bold">
              {activeAdvancedCount}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Monte/demonte au lieu de rester cache en CSS : replie, le panneau ne
          doit occuper AUCUNE hauteur -- c'est tout l'objet du repliement,
          liberer la grille sans scroll. */}
      {advancedOpen && (
        <div id="opportunity-advanced-filters" className="mb-5">
          <OpportunityFilterPanel filters={filters} onChange={setFilters} availableBrands={availableBrands} />
        </div>
      )}


      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 overflow-hidden">
              <Skeleton shape="block" className="h-44 rounded-none" />
              <div className="p-5 space-y-3">
                <Skeleton shape="text" className="w-3/4" />
                <Skeleton shape="text" className="w-1/2" />
                <Skeleton shape="block" className="h-16" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedProducts.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Aucune opportunité"
          description={
            products.length === 0
              ? "Aucune donnée pour l'instant, mais ta prochaine opportunité peut arriver au prochain scan. Un scan tourne automatiquement toutes les 4h, ou lance-le toi-même."
              : "Aucune opportunité ne correspond à tes filtres actuels. Essaie de les assouplir."
          }
          action={
            products.length === 0
              ? { label: isScanning ? 'Scan en cours...' : 'Scanner maintenant', onClick: scanNow }
              : { label: 'Réinitialiser les filtres', onClick: () => setFilters(EMPTY_FILTERS) }
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-5">
          {sortedProducts.map((item) => (
            <OpportunityCard
              key={item.id}
              item={item}
              isFavourited={!!item.vinted_url && favouriteUrls.has(item.vinted_url)}
              onToggleFavourite={() => item.vinted_url && toggleFavourite(item.vinted_url)}
            />
          ))}
        </div>
      )}

      {scanState && (
        <ScanProgressModal
          actionId={scanState.historyId}
          done={scanState.done}
          error={scanState.error}
          opportunitiesFound={scanState.opportunitiesFound}
          failedSearches={scanState.failedSearches}
          onClose={() => setScanState(null)}
          onViewAction={
            onViewAction && scanState.historyId
              ? () => {
                  const historyId = scanState.historyId as string;
                  setScanState(null);
                  onViewAction(historyId);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

interface OpportunityCardProps {
  item: MarketOpportunity;
  isFavourited: boolean;
  onToggleFavourite: () => void;
}

function buildHighlights(item: MarketOpportunity, risk: { label: string; className: string } | null): string[] {
  // Chiffres concrets dérivés des champs déjà exposés par le moteur (aucun
  // nouveau calcul côté serveur) - complète le breakdown existant, qui reste
  // en tier abstrait ("ROI élevé (≥100%)"), par les vraies valeurs de cette
  // opportunité précise.
  const highlights: string[] = [];
  if (item.price_found && item.market_price && item.market_price > 0) {
    const pctUnderMarket = Math.round((1 - Number(item.price_found) / Number(item.market_price)) * 100);
    if (pctUnderMarket > 0) highlights.push(`Prix ${pctUnderMarket}% sous le marché`);
  }
  if (item.competing_listings_count !== null && item.competing_listings_count > 0) {
    highlights.push(
      `${item.competing_listings_count} annonce${item.competing_listings_count > 1 ? "s" : ""} comparable${item.competing_listings_count > 1 ? "s" : ""} analysée${item.competing_listings_count > 1 ? "s" : ""}`
    );
  }
  if (item.profit !== null) highlights.push(`Bénéfice estimé de +${formatEUR(Number(item.profit))}`);
  if (item.roi !== null) highlights.push(`ROI estimé ${Math.round(Number(item.roi))}%`);
  if (item.confidence !== null) highlights.push(`Confiance du modèle ${item.confidence}%`);
  if (item.resale_days_min !== null && item.resale_days_max !== null) {
    highlights.push(`Revente moyenne en ${Math.round((item.resale_days_min + item.resale_days_max) / 2)} jours`);
  }
  if (risk) highlights.push(risk.label);
  for (const entry of item.breakdown ?? []) {
    highlights.push(`${entry.delta >= 0 ? "✓" : "⚠"} ${entry.label}`);
  }
  return highlights;
}

// P0-2 (2026-08-04) : le score/confiance/risque du moteur sont chacun une
// somme de facteurs nommes (voir scripts/opportunity-engine/scoring.ts,
// confidence.ts, risk.ts) deja tagues par `kind` a la source -- jamais
// exploite cote affichage jusqu'ici, tout finissait dans un seul flux
// "Pourquoi cette opportunite ?". Regrouper par kind rend visible QUELS
// facteurs ont fait le score (pas juste le resultat final), sans toucher au
// moteur de calcul lui-meme.
const BREAKDOWN_GROUP_ORDER: OpportunityBreakdownEntry["kind"][] = ["score", "confidence", "risk"];
const BREAKDOWN_GROUP_LABELS: Record<OpportunityBreakdownEntry["kind"], string> = {
  score: "Facteurs de score",
  confidence: "Facteurs de confiance",
  risk: "Facteurs de risque",
};

function groupBreakdownByKind(
  breakdown: OpportunityBreakdownEntry[] | null
): Record<OpportunityBreakdownEntry["kind"], OpportunityBreakdownEntry[]> {
  const groups: Record<OpportunityBreakdownEntry["kind"], OpportunityBreakdownEntry[]> = {
    score: [],
    confidence: [],
    risk: [],
  };
  for (const entry of breakdown ?? []) {
    groups[entry.kind].push(entry);
  }
  return groups;
}
// STRUCTURE (2026-08-26) : la carte etait un <button> englobant TOUT, ce qui
// rendait impossible d'y poser le lien "Voir sur Vinted" demande -- un <a>
// dans un <button> est du HTML invalide, et les navigateurs en font ce qu'ils
// veulent. C'est deja pour cette raison que le coeur "favori" etait un
// <span role="button"> bricole a l'interieur.
//
// Desormais : <article> neutre, et DEUX commandes reelles a l'interieur --
// un <button> qui couvre la zone d'info (ouvre le detail) et un <a> vers
// Vinted. Le coeur redevient un vrai <button>. Trois elements focusables
// legitimes, plus aucun role bricole.
// Exporte pour etre teste seul (meme parti que watchlist/ListingCard) : la
// page entiere exigerait de simuler supabase + auth juste pour verifier le
// balisage d'une carte.
export function OpportunityCard({ item, isFavourited, onToggleFavourite }: OpportunityCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const verdict = computeVerdict(Number(item.score || 0), Number(item.confidence || 0), item.risk_level);
  const verdictBadge = VERDICT_BADGES[verdict];
  const favourites = item.favourites ?? 0;
  const risk = item.risk_level ? RISK_BADGE[item.risk_level] : null;
  const allHighlights = buildHighlights(item, risk);
  const chips = buildOpportunityChips(item).slice(0, MAX_CARD_CHIPS);
  const profit = item.profit !== null ? Number(item.profit) : null;
  const roi = item.roi !== null ? Math.round(Number(item.roi)) : null;

  return (
    <>
      <article className="group bg-surface-alt rounded-2xl border border-gray-200 hover:border-neon-500/40 transition-colors overflow-hidden flex flex-col">
        <div className="relative h-44 bg-dark-400 border-b border-gray-200 overflow-hidden flex-shrink-0">
          {item.image && !imageFailed ? (
            <img
              src={item.image}
              alt={item.title}
              onError={() => setImageFailed(true)}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-700">
              <ImageOff className="w-8 h-8" />
            </div>
          )}

          {/* Badge d'estimation, en bas a gauche : le chiffre qui decide de
              cliquer, lisible sans avoir a parcourir la carte. Fond opaque
              plutot que teinte -- il se superpose a une photo quelconque, et
              le contraste du texte ne doit dependre d'AUCUN pixel en dessous. */}
          {item.market_price !== null && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 bg-black/75 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
              ≈ {formatEUR(Number(item.market_price))} estimés
            </span>
          )}

          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            {favourites > 0 && (
              <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                <Heart className="w-3 h-3 fill-current" />
                {favourites}
              </span>
            )}
            <button
              type="button"
              onClick={onToggleFavourite}
              aria-label={isFavourited ? "Retirer des favoris" : "Ajouter aux favoris"}
              aria-pressed={isFavourited}
              className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isFavourited ? "bg-neon-600 text-white" : "bg-black/60 text-white hover:bg-black/80"
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isFavourited ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          aria-label={`Voir le détail de ${item.title}`}
          className="p-5 text-left w-full flex-1 flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neon-500/50"
        >
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-2 self-start ${verdictBadge.className}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
            {verdictBadge.label}
          </span>
          <h2 className="text-base font-black line-clamp-2 min-h-[48px]">{item.title}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {[item.brand, item.category].filter(Boolean).join(" · ") || "Marque et catégorie inconnues"}
          </p>

          {/* Le potentiel, en un bloc : ce qu'on paie, ce que ca vaut, ce
              qu'on gagne. Le gain et le ROI sont la vraie reponse a "est-ce
              que j'achete ?", d'ou leur taille et leur couleur -- le reste
              est le contexte qui les rend credibles. */}
          <div className="mt-4 rounded-xl bg-surface border border-gray-200 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-700 font-semibold">
                {item.price_found !== null ? formatEUR(Number(item.price_found)) : "Prix inconnu"}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" aria-hidden="true" />
              <span className="text-gray-900 font-bold">
                {item.market_price !== null ? formatEUR(Number(item.market_price)) : "Estimation indisponible"}
              </span>
            </div>
            {(profit !== null || roi !== null) && (
              <div className="flex items-baseline gap-3 mt-1.5">
                {profit !== null && (
                  <span className="text-green-700 text-lg font-black leading-none">
                    +{formatEUR(profit)}
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 ml-1.5 font-normal">gain</span>
                  </span>
                )}
                {roi !== null && (
                  <span className="text-green-700 text-lg font-black leading-none">
                    +{roi} %
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 ml-1.5 font-normal">roi</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <OneScoreBar score={Number(item.score || 0)} size="md" className="mt-4" />

          {/* Remplace le pave "Pourquoi cette opportunite ?" : les memes
              signaux, en etiquettes scannables. Le detail complet (phrases +
              breakdown par facteur) reste dans la modale, rien n'est perdu. */}
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mt-3">
              {chips.map((chip) => (
                <li
                  key={chip.kind}
                  className="text-[11px] text-gray-700 bg-surface border border-gray-200 rounded-md px-2 py-1"
                >
                  {chip.label}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-gray-500 mt-3">
            {item.price_source ?? "estimation IA"}
            {item.first_observed_at ? ` · vue depuis ${daysSince(item.first_observed_at)}` : ""}
          </p>
        </button>

        <div className="px-5 pb-5 pt-0 mt-auto">
          {item.vinted_url ? (
            <a
              href={item.vinted_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white px-3 py-2.5 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: VINTED_INK }}
            >
              Voir sur Vinted
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-[11px] text-gray-500 text-center py-2.5">Lien Vinted indisponible</p>
          )}
        </div>
      </article>

      {detailOpen && (
        <OpportunityDetailModal
          item={item}
          highlights={allHighlights}
          verdictLabel={verdictBadge.label}
          verdictClassName={verdictBadge.className}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

interface OpportunityDetailModalProps {
  item: MarketOpportunity;
  highlights: string[];
  verdictLabel: string;
  verdictClassName: string;
  onClose: () => void;
}

// Vue detaillee d'une opportunite (demande produit 2026-07-29 : carte
// cliquable -> "galerie photo"). scripts/vinted-scan.ts visite desormais la
// page de chaque opportunite retenue pour recuperer sa galerie complete
// (meme selecteur verifie que extension/src/content/itemSelectors.ts) --
// quand cette galerie existe (item.images), on l'affiche reellement ; sinon
// (ligne pas encore rescrapee, ou page inaccessible au moment du scan) on
// reste honnete plutot que d'inventer des photos qui n'existent pas dans
// nos donnees, et on renvoie vers Vinted. Le clic-pour-acheter en un geste
// depuis cette modale est explicitement roadmap (decision utilisateur
// 2026-07-29), pas construit ici.
function OpportunityDetailModal({ item, highlights, verdictLabel, verdictClassName, onClose }: OpportunityDetailModalProps) {
  const gallery = item.images && item.images.length > 0 ? item.images : item.image ? [item.image] : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const activeSrc = gallery[activeIndex];

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-4 mb-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${verdictClassName}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
          {verdictLabel}
        </span>
        <button onClick={onClose} aria-label="Fermer" className="text-gray-500 hover:text-gray-700 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="rounded-xl bg-dark-400 border border-gray-200 overflow-hidden h-64 mb-2">
        {activeSrc && !imageFailed ? (
          <img src={activeSrc} alt={item.title} onError={() => setImageFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <ImageOff className="w-10 h-10" />
          </div>
        )}
      </div>

      {gallery.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
          {gallery.map((src, i) => (
            <button
              key={src}
              onClick={() => { setActiveIndex(i); setImageFailed(false); }}
              className={`w-14 h-14 rounded-lg overflow-hidden border flex-shrink-0 transition-colors ${i === activeIndex ? 'border-neon-500' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-500 mb-4">
        {gallery.length > 1
          ? `Galerie complète (${gallery.length} photos) récupérée depuis l'annonce Vinted.`
          : "Galerie photo pas encore récupérée pour cette annonce — visible directement sur Vinted."}
      </p>

      <h2 className="text-xl font-black mb-1">{item.title}</h2>
      <p className="text-gray-500 text-sm mb-4">{item.brand} · {item.category}</p>

      <div className="flex items-center gap-2 text-sm mb-4">
        <span className="text-gray-500 font-medium">
          {item.price_found !== null ? formatEUR(Number(item.price_found)) : "Prix inconnu"}
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        <span className="text-gray-800 font-semibold">
          {item.market_price !== null ? `${formatEUR(Number(item.market_price))} estimés` : "Estimation indisponible"}
        </span>
      </div>

      <div className="mb-4">
        <OneScoreBar score={Number(item.score || 0)} size="md" />
        {/* P0-2 : le score est une somme de bonus/malus plafonnee a 100 (voir
            scripts/opportunity-engine/scoring.ts) -- plusieurs signaux forts
            cumules atteignent legitimement le plafond, ce n'est pas un defaut
            d'affichage. Le detail juste en dessous montre precisement quels
            facteurs y ont contribue. */}
        {Number(item.score ?? 0) >= 100 && (
          <p className="text-[11px] text-amber-700 mt-1.5">
            Score maximal atteint — plusieurs signaux positifs se cumulent (détail ci-dessous).
          </p>
        )}
      </div>

      {highlights.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-gray-500 font-bold mb-2">Pourquoi cette opportunité ?</p>
          <ul className="space-y-1.5 text-sm text-gray-700">
            {highlights.map((label, i) => (
              <li key={i}>{label}</li>
            ))}
          </ul>
        </div>
      )}

      {(() => {
        const groups = groupBreakdownByKind(item.breakdown);
        const nonEmptyGroups = BREAKDOWN_GROUP_ORDER.filter((kind) => groups[kind].length > 0);
        if (nonEmptyGroups.length === 0) return null;
        return (
          <div className="mb-5 space-y-4">
            {nonEmptyGroups.map((kind) => (
              <div key={kind}>
                <p className="text-xs text-gray-500 font-bold mb-2">{BREAKDOWN_GROUP_LABELS[kind]}</p>
                <ul className="space-y-1.5 text-sm text-gray-700">
                  {groups[kind].map((entry, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className={entry.delta >= 0 ? "text-neon-500 flex-shrink-0" : "text-amber-700 flex-shrink-0"}>
                        {entry.delta >= 0 ? "✓" : "⚠"}
                      </span>
                      <span>
                        {entry.label}
                        {entry.delta !== 0 && (
                          <span className="text-gray-500"> ({entry.delta > 0 ? "+" : ""}{entry.delta})</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })()}

      {item.vinted_url ? (
        <a
          href={item.vinted_url}
          target="_blank"
          rel="noreferrer"
          className="w-full bg-neon-600 text-white px-5 py-3 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all"
        >
          Voir l'annonce et ses photos sur Vinted
          <ArrowUpRight size={18} />
        </a>
      ) : (
        <div className="w-full bg-dark-400 text-gray-500 px-5 py-3 rounded-xl font-black flex items-center justify-center gap-2 border border-gray-200 cursor-not-allowed">
          Lien indisponible
        </div>
      )}
    </Modal>
  );
}
