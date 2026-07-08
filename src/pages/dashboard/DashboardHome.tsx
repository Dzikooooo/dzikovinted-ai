import { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, History, Star, ArrowRight, Zap, Clock, CreditCard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { DashboardPage, Listing } from '../../lib/types';
import { PLAN_LIMITS } from '../../lib/types';

interface DashboardHomeProps {
  onNavigate: (page: DashboardPage) => void;
}

export default function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { profile, user } = useAuth();
  const [listingsCount, setListingsCount] = useState(0);
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [favCount, setFavCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count }, { data: recent }, { count: favs }] = await Promise.all([
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('listings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_favorite', true),
      ]);
      setListingsCount(count ?? 0);
      setRecentListings((recent ?? []) as Listing[]);
      setFavCount(favs ?? 0);
      setLoading(false);
    })();
  }, [user]);

  const plan = profile?.plan ?? 'free';
  const credits = profile?.credits ?? 0;
  const limit = PLAN_LIMITS[plan];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon apres-midi';
    return 'Bonsoir';
  };

  const firstName = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'la';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black">
            {greeting()}, <span className="text-neon-500">{firstName}</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Voici un apercu de ton activite Resell OS.</p>
        </div>
        <button
          onClick={() => onNavigate('generator')}
          className="flex items-center gap-2 bg-neon-500 text-black font-bold px-5 py-2.5 rounded-xl hover:bg-neon-600 transition-all hover:shadow-[0_0_20px_rgba(255,196,0,0.25)] text-sm"
        >
          <Sparkles className="w-4 h-4" />
          Nouvelle annonce
        </button>
      </div>

      {/* Credits banner */}
      {limit !== null && (
        <div className="bg-gradient-to-r from-surface to-surface border border-white/5 rounded-2xl p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neon-500/10 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-neon-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200">Credits restants</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-neon-500">{credits}</span>
                  <span className="text-sm text-gray-500">/ {limit} ce mois</span>
                </div>
              </div>
            </div>
            <div className="flex-1 max-w-xs">
              <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min((credits / limit) * 100, 100)}%`,
                    background: credits > 3 ? '#FFC400' : credits > 0 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              {credits <= 0 && (
                <p className="text-xs text-red-400 mt-2">
                  Limite atteinte.{' '}
                  <button onClick={() => onNavigate('subscription')} className="underline hover:text-red-300">
                    Passer au Pro
                  </button>
                </p>
              )}
              {credits > 0 && credits <= 3 && (
                <p className="text-xs text-amber-400 mt-2">Plus que {credits} credit{credits > 1 ? 's' : ''} disponible{credits > 1 ? 's' : ''}.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Sparkles, label: 'Annonces generees', value: loading ? '-' : listingsCount.toString(), color: 'text-neon-500', bg: 'bg-neon-500/10' },
          { icon: CreditCard, label: 'Plan actuel', value: plan.toUpperCase(), color: plan === 'free' ? 'text-gray-400' : 'text-neon-500', bg: plan === 'free' ? 'bg-gray-400/10' : 'bg-neon-500/10' },
          { icon: Star, label: 'Favoris', value: loading ? '-' : favCount.toString(), color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
          { icon: TrendingUp, label: 'Revenus estimes', value: loading ? '-' : `${recentListings.reduce((s, l) => s + (l.price ?? 0), 0)} EUR`, color: 'text-blue-400', bg: 'bg-blue-400/10' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-surface border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-xl sm:text-2xl font-black ${color} mb-1`}>{value}</p>
            <p className="text-[11px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { icon: Sparkles, title: 'Generer une annonce', desc: 'Uploade des photos et genere.', page: 'generator' as DashboardPage, color: 'text-neon-500', bg: 'bg-neon-500/10', border: 'hover:border-neon-500/20' },
          { icon: History, title: 'Mes annonces', desc: 'Retrouve tes annonces sauvegardees.', page: 'stock' as DashboardPage, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'hover:border-blue-400/20' },
          { icon: TrendingUp, title: 'Statistiques', desc: 'Suis tes performances et revenus.', page: 'stats' as DashboardPage, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'hover:border-yellow-400/20' },
        ].map(({ icon: Icon, title, desc, page, color, bg, border }) => (
          <button key={title} onClick={() => onNavigate(page)} className={`bg-surface border border-white/5 rounded-2xl p-5 text-left ${border} hover:-translate-y-0.5 transition-all duration-200 group`}>
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <h3 className="font-semibold text-sm mb-1">{title}</h3>
            <p className="text-xs text-gray-500">{desc}</p>
            <ArrowRight className={`w-4 h-4 ${color} mt-3 opacity-0 group-hover:opacity-100 transition-opacity`} />
          </button>
        ))}
      </div>

      {/* Recent listings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm text-gray-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Annonces recentes
          </h2>
          {listingsCount > 0 && (
            <button onClick={() => onNavigate('stock')} className="text-xs text-neon-500 hover:underline flex items-center gap-1">
              Voir tout <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-surface rounded-xl animate-pulse" />)}</div>
        ) : recentListings.length === 0 ? (
          <div className="bg-surface border border-white/5 border-dashed rounded-2xl p-10 text-center">
            <Sparkles className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">Aucune annonce encore</p>
            <p className="text-xs text-gray-600 mb-4">Lance ton premier generateur et vois la magie operer !</p>
            <button onClick={() => onNavigate('generator')} className="text-sm text-neon-500 hover:underline font-medium">
              Generer maintenant
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentListings.map((l) => (
              <div key={l.id} className="bg-surface border border-white/5 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-white/10 transition-colors group">
                {l.image_urls?.[0] ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                    <img src={l.image_urls[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-neon-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-neon-500/70" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-gray-100 transition-colors">{l.title}</p>
                  <p className="text-xs text-gray-500">{l.brand} &middot; {new Date(l.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>
                </div>
                {l.is_favorite && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />}
                <p className="text-sm font-bold text-neon-500 flex-shrink-0">{l.price} EUR</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
