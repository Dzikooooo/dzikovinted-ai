import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, Tag, Sparkles, DollarSign, Star, Layers } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { supabase } from '../../lib/supabase';
import { Skeleton } from '../../components/ui/Skeleton';
import type { Listing } from '../../lib/types';

export default function StatsPage() {
  const { user } = useAuth();
  const { selectedAccountId } = useVintedAccountFilter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let query = supabase.from('listings').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (selectedAccountId !== 'all') {
        query = query.eq('vinted_account_id', selectedAccountId);
      }
      const { data } = await query;
      setListings((data ?? []) as Listing[]);
      setLoading(false);
    })();
  }, [user, selectedAccountId]);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgPrice = avg(listings.map((l) => l.price));
  const catalogValue = listings.reduce((sum, l) => sum + (l.price ?? 0), 0);
  const favCount = listings.filter((l) => l.is_favorite).length;
  const brandCounts = listings.reduce<Record<string, number>>((acc, l) => { if (l.brand) acc[l.brand] = (acc[l.brand] ?? 0) + 1; return acc; }, {});
  const topBrands = Object.entries(brandCounts).sort(([, a], [, b]) => b - a).slice(0, 6);
  const maxBrandCount = topBrands[0]?.[1] ?? 1;

  const catCounts = listings.reduce<Record<string, number>>((acc, l) => {
    if (l.category) {
      const cat = l.category.includes('>') ? l.category.split('>')[0].trim() : l.category;
      acc[cat] = (acc[cat] ?? 0) + 1;
    }
    return acc;
  }, {});
  const topCats = Object.entries(catCounts).sort(([, a], [, b]) => b - a).slice(0, 6);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthCount = listings.filter((l) => l.created_at.startsWith(thisMonth)).length;

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    const count = listings.filter((l) => l.created_at.startsWith(key)).length;
    return { key, label, count };
  });
  const maxMonthCount = Math.max(...last6Months.map((m) => m.count), 1);

  const conditionCounts = listings.reduce<Record<string, number>>((acc, l) => {
    if (l.condition) acc[l.condition] = (acc[l.condition] ?? 0) + 1;
    return acc;
  }, {});
  const conditions = Object.entries(conditionCounts).sort(([, a], [, b]) => b - a);

  if (loading) return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} shape="block" className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} shape="block" className="h-52" />)}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-2">Statistiques</h1>
        <p className="text-gray-400 text-sm">Vue d'ensemble de ton activite de revente sur Resell OS.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {[
          { icon: Sparkles, label: 'Annonces', value: listings.length.toString(), color: 'text-neon-500', bg: 'bg-neon-500/10' },
          { icon: DollarSign, label: 'Prix moyen', value: `${avgPrice.toFixed(0)} EUR`, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { icon: TrendingUp, label: 'Valeur du catalogue', value: `${catalogValue.toFixed(0)} EUR`, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
          { icon: BarChart2, label: 'Ce mois-ci', value: thisMonthCount.toString(), color: 'text-teal-400', bg: 'bg-teal-400/10' },
          { icon: Star, label: 'Favoris', value: favCount.toString(), color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-surface border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-xl font-black ${color} mb-1`}>{value}</p>
            <p className="text-[11px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly chart */}
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          <h2 className="font-bold text-sm mb-6 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-neon-500" />
            Annonces par mois
          </h2>
          {listings.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-gray-600">Pas encore de donnees</div>
          ) : (
            <div className="flex items-end gap-3 h-40">
              {last6Months.map(({ key, label, count }) => (
                <div key={key} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-mono text-neon-500">{count > 0 ? count : ''}</span>
                  <div
                    className="w-full rounded-t-lg transition-all duration-700 bg-gradient-to-t from-neon-500/30 to-neon-500/60 hover:from-neon-500/40 hover:to-neon-500/80"
                    style={{ height: `${(count / maxMonthCount) * 100}%`, minHeight: count > 0 ? '8px' : '2px' }}
                  />
                  <span className="text-[10px] text-gray-600 capitalize">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top brands */}
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          <h2 className="font-bold text-sm mb-6 flex items-center gap-2">
            <Tag className="w-4 h-4 text-neon-500" />
            Marques les plus frequentes
          </h2>
          {topBrands.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-600">Pas encore de donnees</div>
          ) : (
            <div className="space-y-3">
              {topBrands.map(([brand, count], i) => (
                <div key={brand} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-gray-600 w-4 flex-shrink-0">{i + 1}.</span>
                  <span className="text-xs text-gray-300 w-28 truncate flex-shrink-0 font-medium">{brand}</span>
                  <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(count / maxBrandCount) * 100}%`,
                        background: `linear-gradient(90deg, rgba(255,196,0,0.4), rgba(255,196,0,0.8))`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-neon-500 w-6 flex-shrink-0 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          <h2 className="font-bold text-sm mb-6 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Categories
          </h2>
          {topCats.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-gray-600">Pas encore de donnees</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {topCats.map(([cat, count]) => (
                <div key={cat} className="bg-dark-400 rounded-xl p-3 border border-white/5 hover:border-blue-400/20 transition-colors">
                  <p className="text-lg font-black text-blue-400 mb-1">{count}</p>
                  <p className="text-xs text-gray-500 truncate">{cat}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price distribution */}
        <div className="bg-surface border border-white/5 rounded-2xl p-6">
          <h2 className="font-bold text-sm mb-6 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-yellow-400" />
            Distribution des prix
          </h2>
          {listings.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-gray-600">Pas encore de donnees</div>
          ) : (
            <div className="space-y-3">
              {[
                { label: '< 30 EUR', count: listings.filter((l) => l.price < 30).length, color: 'from-gray-500/40 to-gray-500/60' },
                { label: '30 - 75 EUR', count: listings.filter((l) => l.price >= 30 && l.price < 75).length, color: 'from-neon-500/40 to-neon-500/70' },
                { label: '75 - 150 EUR', count: listings.filter((l) => l.price >= 75 && l.price < 150).length, color: 'from-yellow-400/40 to-yellow-400/70' },
                { label: '150+ EUR', count: listings.filter((l) => l.price >= 150).length, color: 'from-blue-400/40 to-blue-400/70' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-20 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`} style={{ width: listings.length > 0 ? `${(count / listings.length) * 100}%` : '0%' }} />
                  </div>
                  <span className="text-xs font-mono text-gray-500 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Condition breakdown */}
        <div className="bg-surface border border-white/5 rounded-2xl p-6 lg:col-span-2">
          <h2 className="font-bold text-sm mb-6 flex items-center gap-2">
            <Star className="w-4 h-4 text-teal-400" />
            Etat des articles
          </h2>
          {conditions.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-gray-600">Pas encore de donnees</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {conditions.map(([condition, count]) => {
                const pct = ((count / listings.length) * 100).toFixed(0);
                return (
                  <div key={condition} className="bg-dark-400 rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3 hover:border-teal-400/20 transition-colors">
                    <div className="text-center">
                      <p className="text-lg font-black text-teal-400">{pct}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-300 font-medium">{condition}</p>
                      <p className="text-[10px] text-gray-600">{count} article{count > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
