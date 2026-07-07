import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../../lib/types';

export default function StockPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sellingItem, setSellingItem] = useState<Listing | null>(null);
  const [soldPrice, setSoldPrice] = useState('');
  const [fees, setFees] = useState('0');

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

  useEffect(() => {
    load();
  }, [user]);

  const markAsSold = async () => {
    if (!sellingItem) return;

    const { error } = await supabase
      .from('listings')
      .update({
        status: 'vendu',
        sold_price: Number(soldPrice || 0),
        fees: Number(fees || 0),
        sold_date: new Date().toISOString().slice(0, 10),
      })
      .eq('id', sellingItem.id);

    if (!error) {
      setSellingItem(null);
      setSoldPrice('');
      setFees('0');
      await load();
    }
  };

  const filtered = items.filter((item) =>
    item.title?.toLowerCase().includes(search.toLowerCase()) ||
    item.brand?.toLowerCase().includes(search.toLowerCase()) ||
    item.category?.toLowerCase().includes(search.toLowerCase())
  );

  const stockItems = items.filter((item) => item.status !== 'vendu');
  const soldItems = items.filter((item) => item.status === 'vendu');

  const stockValue = stockItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const investment = stockItems.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0);
  const potentialMargin = stockValue - investment;
  const averageRoi = investment > 0 ? Math.round((potentialMargin / investment) * 100) : 0;

  const revenue = soldItems.reduce((sum, item) => sum + Number(item.sold_price || 0), 0);
  const profit = soldItems.reduce(
    (sum, item) =>
      sum +
      (Number(item.sold_price || 0) -
        Number(item.purchase_price || 0) -
        Number(item.fees || 0)),
    0
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Stock</h1>
        <p className="text-gray-400 text-sm">
          Gère tes articles, leur valeur et leur marge potentielle.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Articles en stock" value={stockItems.length.toString()} />
        <StatCard label="Valeur du stock" value={`${stockValue} €`} />
        <StatCard label="Investissement" value={`${investment} €`} />
        <StatCard label="Marge potentielle" value={`${potentialMargin} €`} highlight />
        <StatCard label="ROI moyen" value={`${averageRoi} %`} highlight />
        <StatCard label="Articles vendus" value={soldItems.length.toString()} />
        <StatCard label="Chiffre d'affaires" value={`${revenue} €`} />
        <StatCard label="Bénéfice" value={`${profit} €`} highlight />
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un article..."
          className="w-full bg-[#181818] border border-white/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-[#FFC400]/30"
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
            const isSold = item.status === 'vendu';
            const margin = isSold
              ? Number(item.sold_price || 0) - Number(item.purchase_price || 0) - Number(item.fees || 0)
              : Number(item.price || 0) - Number(item.purchase_price || 0);

            const roi =
              Number(item.purchase_price || 0) > 0
                ? Math.round((margin / Number(item.purchase_price || 0)) * 100)
                : 0;

            return (
              <div
                key={item.id}
                className="bg-[#181818] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-gray-100">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.brand} · {item.category} · {item.size}
                    </p>
                    <p className={`text-[10px] mt-2 ${isSold ? 'text-blue-400' : 'text-[#FFC400]'}`}>
                      {isSold ? 'Vendu' : 'En stock'}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="grid grid-cols-4 gap-3 text-right">
                      <MiniValue label={isSold ? 'Vente' : 'Valeur'} value={`${isSold ? item.sold_price ?? 0 : item.price ?? 0} €`} />
                      <MiniValue label="Achat" value={`${item.purchase_price ?? 0} €`} />
                      <MiniValue label={isSold ? 'Bénéfice' : 'Marge'} value={`${margin} €`} highlight />
                      <MiniValue label="ROI" value={`${roi} %`} highlight />
                    </div>

                    {!isSold && (
                      <button
                        onClick={() => {
                          setSellingItem(item);
                          setSoldPrice(String(item.price ?? ''));
                          setFees('0');
                        }}
                        className="text-xs font-semibold bg-[#FFC400] text-black px-3 py-2 rounded-xl hover:bg-[#50ff30] transition-all"
                      >
                        Marquer vendu
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sellingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-black">Marquer comme vendu</h2>
                <p className="text-xs text-gray-500 mt-1">{sellingItem.title}</p>
              </div>
              <button
                onClick={() => setSellingItem(null)}
                className="p-1.5 rounded-lg hover:bg-white/5"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                  Prix de vente
                </label>
                <input
                  type="number"
                  value={soldPrice}
                  onChange={(e) => setSoldPrice(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#FFC400]/40"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                  Frais
                </label>
                <input
                  type="number"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#FFC400]/40"
                />
              </div>

              <button
                onClick={markAsSold}
                className="w-full bg-[#FFC400] text-black font-bold py-3 rounded-xl hover:bg-[#50ff30] transition-all"
              >
                Confirmer la vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-[#181818] border border-white/5 rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className={`text-xl font-black ${highlight ? 'text-[#FFC400]' : 'text-gray-100'}`}>
        {value}
      </p>
    </div>
  );
}

function MiniValue({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-[#FFC400]' : 'text-gray-200'}`}>
        {value}
      </p>
    </div>
  );
}
