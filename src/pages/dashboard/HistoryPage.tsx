import { useEffect, useState } from 'react';
import { Search, Trash2, Star, StarOff, ExternalLink, Filter, Sparkles, Copy, Check, Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Listing, DashboardPage } from '../../lib/types';

interface HistoryPageProps {
  onNavigate: (page: DashboardPage) => void;
}

type FilterMode = 'all' | 'favorites';

export default function HistoryPage({ onNavigate }: HistoryPageProps) {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filtered, setFiltered] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selected, setSelected] = useState<Listing | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('listings').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const items = (data ?? []) as Listing[];
    setListings(items);
    setFiltered(items);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    let result = [...listings];
    if (filterMode === 'favorites') result = result.filter((l) => l.is_favorite);
    if (search) result = result.filter((l) => l.title.toLowerCase().includes(search.toLowerCase()) || l.brand?.toLowerCase().includes(search.toLowerCase()) || l.category?.toLowerCase().includes(search.toLowerCase()));
    if (brandFilter) result = result.filter((l) => l.brand?.toLowerCase() === brandFilter.toLowerCase());
    setFiltered(result);
  }, [search, brandFilter, listings, filterMode]);

  const deleteListing = async (id: string) => {
    await supabase.from('listings').delete().eq('id', id);
    setListings((prev) => prev.filter((l) => l.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const toggleFavorite = async (l: Listing) => {
    await supabase.from('listings').update({ is_favorite: !l.is_favorite }).eq('id', l.id);
    setListings((prev) => prev.map((item) => item.id === l.id ? { ...item, is_favorite: !item.is_favorite } : item));
    if (selected?.id === l.id) setSelected((prev) => prev ? { ...prev, is_favorite: !prev.is_favorite } : null);
  };

  const copyListing = (l: Listing) => {
    const text = [
      l.title, '', l.description, '',
      `Prix: ${l.price} EUR`,
      `Marque: ${l.brand}`,
      `Categorie: ${l.category}`,
      `Taille: ${l.size}`,
      `Couleur: ${l.color}`,
      `Etat: ${l.condition}`,
      l.keywords?.length ? `Mots-cles: ${l.keywords.join(', ')}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const brands = [...new Set(listings.map((l) => l.brand).filter(Boolean))];
  const favCount = listings.filter((l) => l.is_favorite).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
         <h1 className="text-2xl sm:text-3xl font-black mb-1">
  Mon <span className="text-[#39FF14]">stock</span>
</h1>
          <p className="text-gray-400 text-sm">{listings.length} annonce{listings.length > 1 ? 's' : ''} sauvegardee{listings.length > 1 ? 's' : ''} &middot; {favCount} favori{favCount > 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input type="text" placeholder="Rechercher par titre, marque, categorie..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-[#181818] border border-white/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-[#39FF14]/30 transition-all" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMode(filterMode === 'favorites' ? 'all' : 'favorites')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all ${filterMode === 'favorites' ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400' : 'bg-[#181818] border-white/8 text-gray-400 hover:text-gray-200'}`}
          >
            <Heart className={`w-4 h-4 ${filterMode === 'favorites' ? 'fill-yellow-400' : ''}`} />
            <span className="hidden sm:inline">Favoris</span>
            {favCount > 0 && <span className="text-[10px] font-mono">{favCount}</span>}
          </button>
          {brands.length > 0 && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="bg-[#181818] border border-white/8 rounded-xl pl-9 pr-8 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-[#39FF14]/30 transition-all appearance-none">
                <option value="">Toutes les marques</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-[#181818] rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#181818] border border-white/5 border-dashed rounded-2xl p-16 text-center">
          <Sparkles className="w-10 h-10 text-gray-700 mx-auto mb-4" />
         <p className="text-gray-400 font-semibold mb-2">
  {listings.length === 0 ? 'Aucun article en stock' : 'Aucun resultat'}
</p>

<p className="text-sm text-gray-600 mb-4">
  {listings.length === 0 ? 'Ajoute ton premier article depuis le generateur.' : 'Essaie un autre filtre.'}
</p>

{listings.length === 0 && (
  <button onClick={() => onNavigate('generator')} className="text-sm text-[#39FF14] hover:underline font-medium">
    Ajouter un article
  </button>
)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
<div className="lg:col-span-3 space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
  {filtered.map((l) => (
    <div key={l.id} onClick={() => setSelected(l)} className={`group flex items-center gap-3 bg-[#181818] border rounded-xl px-4 py-3 cursor-pointer transition-all duration-200 ${selected?.id === l.id ? 'border-[#39FF14]/30 shadow-[0_0_20px_rgba(57,255,20,0.08)]' : 'border-white/5 hover:border-white/10'}`}>
      {l.image_urls?.[0] ? (
        <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
          <img src={l.image_urls[0]} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-11 h-11 bg-[#39FF14]/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-[#39FF14]/70" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{l.title}</p>
        <p className="text-xs text-gray-500">
          {l.brand} &middot; {l.category?.split(' ')[0]} &middot; {new Date(l.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        <div className="mt-1">
          <span className="inline-flex items-center rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 px-2 py-0.5 text-[10px] text-[#39FF14]">
            En stock
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Valeur estimée</p>
          <p className="text-lg font-bold text-[#39FF14]">{l.price} €</p>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(l); }} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            {l.is_favorite ? <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" /> : <StarOff className="w-3.5 h-3.5 text-gray-600" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); deleteListing(l.id); }} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5 text-gray-600 hover:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  ))}
</div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-[#181818] border border-white/5 rounded-2xl p-5 sticky top-4 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">Fiche stock</h3>
                  <div className="flex gap-1.5">
                    <button onClick={() => copyListing(selected)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Copier tout">
                      {copiedAll ? <Check className="w-4 h-4 text-[#39FF14]" /> : <Copy className="w-4 h-4 text-gray-500" />}
                    </button>
                    <button onClick={() => toggleFavorite(selected)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                      {selected.is_favorite ? <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /> : <StarOff className="w-4 h-4 text-gray-500" />}
                    </button>
                    <button onClick={() => deleteListing(selected.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Image preview */}
                {selected.image_urls?.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selected.image_urls.map((url, i) => (
                      <div key={i} className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-sm font-semibold text-gray-200 leading-snug">{selected.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">{selected.description}</p>

                <div className="grid grid-cols-3 gap-2">
                 {[
  { label: 'Valeur estimée', val: `${selected.price} EUR`, color: 'text-[#39FF14]' },
  { label: 'Achat', val: `${selected.purchase_price ?? 0} EUR`, color: 'text-gray-300' },
  { label: 'Marge prévue', val: `${Number(selected.price || 0) - Number(selected.purchase_price || 0)} EUR`, color: 'text-blue-400' },
].map(
                    <div key={label} className="bg-[#0A0A0A] rounded-lg p-2.5 text-center border border-white/5">
                      <p className={`text-base font-black ${color}`}>{val}</p>
                      <p className="text-[9px] text-gray-600 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[['Marque', selected.brand], ['Categorie', selected.category], ['Taille', selected.size], ['Couleur', selected.color], ['Matiere', selected.material], ['Etat', selected.condition]].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="bg-[#0A0A0A] rounded-lg px-3 py-2 border border-white/5">
                      <p className="text-[9px] font-mono uppercase tracking-wider text-gray-600 mb-0.5">{k}</p>
                      <p className="text-gray-200 text-xs">{v}</p>
                    </div>
                  ))}
                </div>

                {selected.keywords?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-[#39FF14]/60 mb-2">Hashtags</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.keywords.map((kw) => (
                        <span
                          key={kw}
                          onClick={() => navigator.clipboard.writeText(`#${kw.replace(/\s+/g, '')}`)}
                          className="px-2 py-0.5 text-[10px] font-mono bg-[#39FF14]/10 text-[#39FF14] rounded-full border border-[#39FF14]/20 cursor-pointer hover:bg-[#39FF14]/20 transition-colors"
                        >
                          #{kw.replace(/\s+/g, '')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-600 pt-2 border-t border-white/5">
                  Cree le {new Date(selected.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ) : (
              <div className="bg-[#181818] border border-white/5 border-dashed rounded-2xl p-10 text-center">
                <ExternalLink className="w-6 h-6 text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-600">Clique sur une annonce pour voir les details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
