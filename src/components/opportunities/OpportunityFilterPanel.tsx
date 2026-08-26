import type { OpportunityFilters, OpportunityRiskLevel, Verdict } from "../../lib/types";
import { VERDICT_BADGES } from "../../lib/opportunityVerdict";

const RISK_OPTIONS: { value: OpportunityRiskLevel; label: string }[] = [
  { value: "faible", label: "Risque faible" },
  { value: "modere", label: "Risque modéré" },
  { value: "eleve", label: "Risque élevé" },
];

const VERDICT_OPTIONS: Verdict[] = ["excellent", "recommande", "a_surveiller", "trop_risque"];

// Exporte : la page affiche ce compte sur le bouton "Filtres avancés" pour
// qu'un filtre actif reste visible MEME panneau replie. Sans cela, replier
// masquerait silencieusement pourquoi la grille est vide -- le repliement
// gagnerait de la place au prix d'un mensonge par omission.
//
// `category` et la recherche n'en font PAS partie : ils ont leurs propres
// controles, toujours visibles au-dessus.
export function countAdvancedFilters(filters: OpportunityFilters): number {
  return (
    (filters.minScore !== null ? 1 : 0) +
    (filters.minConfidence !== null ? 1 : 0) +
    (filters.minRoi !== null ? 1 : 0) +
    (filters.minProfit !== null ? 1 : 0) +
    (filters.maxBudget !== null ? 1 : 0) +
    (filters.maxResaleDays !== null ? 1 : 0) +
    filters.brands.length +
    filters.riskLevels.length +
    filters.verdicts.length
  );
}

interface OpportunityFilterPanelProps {
  filters: OpportunityFilters;
  onChange: (filters: OpportunityFilters) => void;
  availableBrands: string[];
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-gray-500 font-semibold">{label}</span>
      <div className="flex items-center gap-1 bg-dark-400 border border-gray-200 rounded-lg px-2.5 py-2 transition-all focus-within:border-neon-500/40 focus-within:ring-2 focus-within:ring-neon-500/20">
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder="—"
          className="w-full bg-transparent text-sm text-gray-900 outline-none min-w-0"
        />
        {suffix && <span className="text-gray-500 text-xs">{suffix}</span>}
      </div>
    </label>
  );
}

export default function OpportunityFilterPanel({ filters, onChange, availableBrands }: OpportunityFilterPanelProps) {
  function toggleBrand(brand: string) {
    const brands = filters.brands.includes(brand)
      ? filters.brands.filter((b) => b !== brand)
      : [...filters.brands, brand];
    onChange({ ...filters, brands });
  }

  function toggleRisk(risk: OpportunityRiskLevel) {
    const riskLevels = filters.riskLevels.includes(risk)
      ? filters.riskLevels.filter((r) => r !== risk)
      : [...filters.riskLevels, risk];
    onChange({ ...filters, riskLevels });
  }

  function toggleVerdict(verdict: Verdict) {
    const verdicts = filters.verdicts.includes(verdict)
      ? filters.verdicts.filter((v) => v !== verdict)
      : [...filters.verdicts, verdict];
    onChange({ ...filters, verdicts });
  }

  const activeCount = countAdvancedFilters(filters);

  return (
    <div className="bg-surface-alt border border-gray-200 rounded-2xl p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <NumberField label="Score min" suffix="/100" value={filters.minScore} onChange={(v) => onChange({ ...filters, minScore: v })} />
        <NumberField label="Confiance min" suffix="%" value={filters.minConfidence} onChange={(v) => onChange({ ...filters, minConfidence: v })} />
        <NumberField label="ROI min" suffix="%" value={filters.minRoi} onChange={(v) => onChange({ ...filters, minRoi: v })} />
        <NumberField label="Profit min" suffix="€" value={filters.minProfit} onChange={(v) => onChange({ ...filters, minProfit: v })} />
        <NumberField label="Budget max" suffix="€" value={filters.maxBudget} onChange={(v) => onChange({ ...filters, maxBudget: v })} />
        <NumberField label="Revente max" suffix="jours" value={filters.maxResaleDays} onChange={(v) => onChange({ ...filters, maxResaleDays: v })} />
      </div>

      <div className="flex flex-wrap gap-4 mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold mr-1">Verdict</span>
          {VERDICT_OPTIONS.map((verdict) => (
            <button
              key={verdict}
              onClick={() => toggleVerdict(verdict)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                filters.verdicts.includes(verdict)
                  ? "bg-neon-600 text-white border-neon-500"
                  : "bg-dark-400 text-gray-500 border-gray-200 hover:text-gray-900"
              }`}
            >
              {VERDICT_BADGES[verdict].label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold mr-1">Risque</span>
          {RISK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleRisk(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                filters.riskLevels.includes(opt.value)
                  ? "bg-neon-600 text-white border-neon-500"
                  : "bg-dark-400 text-gray-500 border-gray-200 hover:text-gray-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {availableBrands.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-semibold mr-1">Marque</span>
            {availableBrands.map((brand) => (
              <button
                key={brand}
                onClick={() => toggleBrand(brand)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                  filters.brands.includes(brand)
                    ? "bg-neon-600 text-white border-neon-500"
                    : "bg-dark-400 text-gray-500 border-gray-200 hover:text-gray-900"
                }`}
              >
                {brand}
              </button>
            ))}
          </div>
        )}

        {activeCount > 0 && (
          <button
            onClick={() =>
              onChange({
                ...filters,
                minScore: null,
                minConfidence: null,
                minRoi: null,
                minProfit: null,
                maxBudget: null,
                maxResaleDays: null,
                brands: [],
                riskLevels: [],
                verdicts: [],
              })
            }
            className="text-xs text-gray-500 hover:text-gray-900 font-semibold ml-auto"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>
    </div>
  );
}
