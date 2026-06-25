import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../../lib/types';

export default function StockPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error) setItems((data ?? []) as Listing[]);
      setLoading(false);
    };

    load();
  }, [user]);

  const filtered = items.filter((item) =>
    item.title?.toLowerCase().includes(search.toLowerCase()) ||
    item.brand?.toLowerCase().includes(search.toLowerCase()) ||
    item.category?.toLowerCase().includes(search.toLowerCase())
  );

  const stockValue = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const investment = items.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0);
  const potentialMargin = stockValue - investment;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">
          Stock
        </h1>
        <p className="text-gray-400 text-sm">
          Gère tes articles, leur valeur et leur marge potentielle.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Articles" value={items.length.toString()} />
        <StatCard label="Valeur du stock" value={`${stockValue} €`} />
        <StatCard label="Investissement" value={`${investment} €`} />
        <StatCard label="Marge potentielle" value={`${potentialMargin} €`} highlight />
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un article..."
          className="w-full bg-[#181818] border border-white/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-[#39FF14]/30"
        />
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Chargement...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-[#181818] border border-white/5 border-dashed rounded-2xl p-12 text-center">
          <p className="text-gray-400 font-semibold mb-2">Aucun article en stock</p>
          <p className="text-sm text-gray-600">Ajoute un article depuis le générateur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((item) => {
            const margin = Number(item.price || 0) - Number(item.purchase_price || 0);

            return (
              <div key={item.id} className="bg-[#181818] border border-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-gray-100">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.brand} · {item.category} · {item.size}
                    </p>
                    <p className="text-[10px] text-[#39FF14] mt-2">En stock</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-right">
                    <MiniValue label="Valeur" value={`${item.price ?? 0} €`} />
                    <MiniValue label="Achat" value={`${item.purchase_price ?? 0} €`} />
                    <MiniValue label="Marge" value={`${margin} €`} highlight />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-[#181818] border border-white/5 rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className={`text-xl font-black ${highlight ? 'text-[#39FF14]' : 'text-gray-100'}`}>
        {value}
      </p>
    </div>
  );
}

function MiniValue({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-[#39FF14]' : 'text-gray-200'}`}>
        {value}
      </p>
    </div>
  );
}
