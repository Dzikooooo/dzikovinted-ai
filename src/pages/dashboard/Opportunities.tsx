import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Heart, ImageOff, RefreshCw, Search, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import type { MarketOpportunity, OpportunityFilters, OpportunityRiskLevel } from "../../lib/types";
import { OPPORTUNITY_CATEGORIES } from "../../lib/opportunityCategories";
import { computeVerdict, VERDICT_BADGES } from "../../lib/opportunityVerdict";
import { formatEUR } from "../../lib/currency";
import { formatRelativeSync } from "../../lib/formatRelativeTime";
import { StatCard } from "../../components/ui/StatCard";
import { OneScoreBar } from "../../components/ui/OneScoreBar";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import { useActionEngine } from "../../hooks/useActionEngine";
import ScanProgressModal from "../../components/opportunities/ScanProgressModal";
import OpportunityFilterPanel from "../../components/opportunities/OpportunityFilterPanel";

type SortBy = "score" | "profit" | "roi" | "created_at" | "price_found";
type CategoryFilter = "all" | (typeof OPPORTUNITY_CATEGORIES)[number];

const RISK_BADGE: Record<OpportunityRiskLevel, { label: string; className: string }> = {
  faible: { label: "Risque estimé : faible", className: "bg-neon-500/15 text-neon-500 border border-neon-500/30" },
  modere: { label: "Risque estimé : modéré", className: "bg-amber-400/15 text-amber-400 border border-amber-400/30" },
  eleve: { label: "Risque estimé : élevé", className: "bg-red-400/15 text-red-400 border border-red-400/30" },
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
    const result = await confirmAction(prepared.prepared);

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

  const categories: CategoryFilter[] = ["all", ...OPPORTUNITY_CATEGORIES];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">
            Opportunités <span className="text-neon-500">Vinted</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Les meilleures opportunités détectées en temps réel.
          </p>
          {lastScanRun && (
            <p className="text-xs text-gray-600 mt-1.5">
              {lastScanRun.status === "success" && lastScanRun.completedAt
                ? `Dernier scan réussi : ${formatRelativeSync(lastScanRun.completedAt)}`
                : lastScanRun.status === "error"
                  ? "Le dernier scan automatique a échoué — nouvelle tentative au prochain passage (toutes les 4h), ou lance un scan manuel."
                  : "Un scan est en cours."}
            </p>
          )}
        </div>

        <button
          onClick={scanNow}
          disabled={isScanning}
          className="bg-neon-500 text-black px-6 py-3 rounded-xl font-bold flex gap-2 items-center justify-center disabled:opacity-50 hover:bg-neon-600 transition"
        >
          {isScanning ? <RefreshCw size={20} className="animate-spin" /> : <Search size={20} />}
          {isScanning ? "Scan en cours" : "Scanner maintenant"}
        </button>
      </div>

      {loadError && <ErrorBanner message={loadError} className="mb-6" />}

      {lastScanRun?.status === "error" && (
        <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3 mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-400">
            Le dernier scan automatique a échoué. Les opportunités ci-dessous peuvent être obsolètes — un nouveau scan aura lieu automatiquement dans les prochaines heures, ou lance-le toi-même.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard size="lg" label="Opportunités" value={stats.count} />
        <StatCard size="lg" label="Profit moyen" value={`+${formatEUR(stats.avgProfit)}`} />
        <StatCard size="lg" label="ROI moyen" value={`+${stats.avgRoi}%`} />
        <StatCard size="lg" label="Meilleur deal" value={`+${formatEUR(stats.bestProfit)}`} />
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une opportunité..."
          className="w-full bg-surface border border-white/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/30 focus:ring-2 focus:ring-neon-500/20"
        />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilters({ ...filters, category: cat })}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
                filters.category === cat
                  ? "bg-neon-500 text-black border-neon-500"
                  : "bg-surface-alt text-gray-400 border-white/10 hover:text-white"
              }`}
            >
              {cat === "all" ? "Toutes" : cat}
            </button>
          ))}
          <button
            onClick={() => setFavouritesOnly((v) => !v)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition flex items-center gap-1.5 ${
              favouritesOnly
                ? "bg-neon-500 text-black border-neon-500"
                : "bg-surface-alt text-gray-400 border-white/10 hover:text-white"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${favouritesOnly ? "fill-current" : ""}`} />
            Favoris
          </button>
        </div>

        <div className="flex bg-surface-alt border border-white/10 rounded-xl overflow-hidden">
          <SortButton label="Score" active={sortBy === "score"} onClick={() => setSortBy("score")} />
          <SortButton label="Profit" active={sortBy === "profit"} onClick={() => setSortBy("profit")} />
          <SortButton label="ROI" active={sortBy === "roi"} onClick={() => setSortBy("roi")} />
          <SortButton label="Prix" active={sortBy === "price_found"} onClick={() => setSortBy("price_found")} />
          <SortButton label="Récent" active={sortBy === "created_at"} onClick={() => setSortBy("created_at")} />
        </div>
      </div>

      <OpportunityFilterPanel filters={filters} onChange={setFilters} availableBrands={availableBrands} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/5 overflow-hidden">
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
              ? "Aucune donnée pour l'instant. Un scan tourne automatiquement toutes les 4h — ou lance-le toi-même avec \"Scanner maintenant\"."
              : "Aucune opportunité ne correspond à tes filtres actuels. Essaie de les assouplir."
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

function OpportunityCard({ item, isFavourited, onToggleFavourite }: OpportunityCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const verdict = computeVerdict(Number(item.score || 0), Number(item.confidence || 0), item.risk_level);
  const verdictBadge = VERDICT_BADGES[verdict];
  const favourites = item.favourites ?? 0;
  const risk = item.risk_level ? RISK_BADGE[item.risk_level] : null;
  const checklist = (item.breakdown ?? []).slice(0, 8);

  // Chiffres concrets dérivés des champs déjà exposés par le moteur (aucun
  // nouveau calcul côté serveur) - complète le breakdown existant, qui reste
  // en tier abstrait ("ROI élevé (≥100%)"), par les vraies valeurs de cette
  // opportunité précise.
  const concreteHighlights: string[] = [];
  if (item.price_found && item.market_price && item.market_price > 0) {
    const pctUnderMarket = Math.round((1 - Number(item.price_found) / Number(item.market_price)) * 100);
    if (pctUnderMarket > 0) concreteHighlights.push(`Prix ${pctUnderMarket}% sous le marché`);
  }
  if (item.competing_listings_count !== null && item.competing_listings_count > 0) {
    concreteHighlights.push(
      `${item.competing_listings_count} annonce${item.competing_listings_count > 1 ? "s" : ""} comparable${item.competing_listings_count > 1 ? "s" : ""} analysée${item.competing_listings_count > 1 ? "s" : ""}`
    );
  }
  if (item.profit !== null) concreteHighlights.push(`Bénéfice estimé de +${formatEUR(Number(item.profit))}`);
  if (item.roi !== null) concreteHighlights.push(`ROI estimé ${Math.round(Number(item.roi))}%`);
  if (item.confidence !== null) concreteHighlights.push(`Confiance du modèle ${item.confidence}%`);
  if (item.resale_days_min !== null && item.resale_days_max !== null) {
    concreteHighlights.push(`Revente moyenne en ${Math.round((item.resale_days_min + item.resale_days_max) / 2)} jours`);
  }
  if (risk) concreteHighlights.push(risk.label);

  return (
    <div className="group bg-surface-alt rounded-2xl border border-white/5 hover:border-neon-500/40 hover:-translate-y-1 transition-all duration-300 overflow-hidden hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
      <div className="relative h-44 bg-dark-400 border-b border-white/10 overflow-hidden">
        {item.image && !imageFailed ? (
          <img
            src={item.image}
            alt={item.title}
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <ImageOff className="w-8 h-8" />
          </div>
        )}
        <span className={`absolute top-3 left-3 flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${verdictBadge.className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
          {verdictBadge.label}
        </span>
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {favourites > 0 && (
            <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <Heart className="w-3 h-3 fill-current" />
              {favourites}
            </span>
          )}
          <button
            onClick={onToggleFavourite}
            aria-label={isFavourited ? "Retirer des favoris" : "Ajouter aux favoris"}
            className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
              isFavourited ? "bg-neon-500 text-black" : "bg-black/60 text-white hover:bg-black/80"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavourited ? "fill-current" : ""}`} />
          </button>
        </div>
      </div>

      <div className="p-5">
        <h2 className="text-base font-black line-clamp-2 min-h-[48px]">{item.title}</h2>
        <p className="text-gray-500 text-sm mt-1">
          {item.brand} · {item.category}
        </p>

        <div className="flex items-center gap-2 mt-4 text-sm">
          <span className="text-gray-400 font-medium">
            {item.price_found !== null ? formatEUR(Number(item.price_found)) : "Prix inconnu"}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
          <span className="text-gray-200 font-semibold">
            {item.market_price !== null ? `${formatEUR(Number(item.market_price))} estimés` : "Estimation indisponible"}
          </span>
        </div>

        <OneScoreBar score={Number(item.score || 0)} size="md" className="mt-4" />

        <p className="text-[11px] text-gray-600 mt-3">
          {item.price_source ?? "estimation IA"}
          {item.first_observed_at ? ` · vue depuis ${daysSince(item.first_observed_at)}` : ""}
        </p>

        {(concreteHighlights.length > 0 || checklist.length > 0) && (
          <div className="mt-3">
            <p className="text-[11px] text-gray-500 font-bold mb-1.5">Pourquoi cette opportunité ?</p>
            <ul className="space-y-1 text-[11px] text-gray-400">
              {concreteHighlights.map((label, i) => (
                <li key={`concrete-${i}`}>✔ {label}</li>
              ))}
              {checklist.map((entry, i) => (
                <li key={i} className={entry.delta < 0 ? "text-amber-400/80" : "text-gray-400"}>
                  {entry.delta >= 0 ? "✓" : "⚠"} {entry.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.vinted_url ? (
          <a
            href={item.vinted_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 bg-neon-500 text-black px-5 py-3 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all"
          >
            Voir l'annonce
            <ArrowUpRight size={18} />
          </a>
        ) : (
          <div className="mt-4 bg-dark-400 text-gray-600 px-5 py-3 rounded-xl font-black flex items-center justify-center gap-2 border border-white/5 cursor-not-allowed">
            Lien indisponible
          </div>
        )}
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-bold transition ${
        active ? "bg-neon-500 text-black" : "text-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
