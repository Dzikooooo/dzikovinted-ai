import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useExpenses } from '../../hooks/useExpenses';
import { StatCard } from '../../components/ui/StatCard';

const CATEGORIES = [
  'Emballage',
  'Frais de port',
  'Frais Vinted',
  'Materiel',
  'Deplacement',
  'Stockage',
  'Autre',
];

export default function ExpensesPage() {
  const { expenses, loading, addExpense, deleteExpense } = useExpenses();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalThisMonth = expenses
    .filter((e) => e.expenseDate?.startsWith(thisMonth))
    .reduce((sum, e) => sum + e.amount, 0);

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});
  const topCategory = Object.entries(byCategory).sort(([, a], [, b]) => b - a)[0];

  const resetForm = () => {
    setCategory(CATEGORIES[0]);
    setAmount('');
    setNote('');
  };

  const handleAdd = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return;

    setSaving(true);
    await addExpense(category, value, note);
    setSaving(false);
    resetForm();
    setShowForm(false);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">Depenses</h1>
          <p className="text-gray-400 text-sm">
            Suis tes frais lies a l'activite (emballage, port, materiel...).
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-neon-500 text-black text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-600 transition-all flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total depenses" value={`${total.toFixed(2)} €`} />
        <StatCard label="Ce mois-ci" value={`${totalThisMonth.toFixed(2)} €`} highlight />
        <StatCard label="Categorie principale" value={topCategory ? topCategory[0] : '—'} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-surface rounded-2xl animate-pulse" />)}
        </div>
      ) : expenses.length === 0 ? (
        <div className="bg-surface border border-white/5 border-dashed rounded-2xl p-12 text-center">
          <p className="text-gray-400 font-semibold mb-2">Aucune depense enregistree</p>
          <p className="text-sm text-gray-600">Ajoute ta premiere depense pour suivre tes frais.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="bg-surface border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-semibold text-sm text-gray-100">{expense.category}</p>
                {expense.note && <p className="text-xs text-gray-500 mt-1">{expense.note}</p>}
                <p className="text-[10px] text-gray-600 mt-1">{expense.expenseDate}</p>
              </div>

              <div className="flex items-center gap-4">
                <p className="text-sm font-bold text-gray-200">{expense.amount.toFixed(2)} €</p>
                <button
                  onClick={() => deleteExpense(expense.id)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black">Nouvelle depense</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-white/5"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                  Categorie
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                  Montant (€)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                  Note (optionnel)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Details..."
                  className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>

              <button
                onClick={handleAdd}
                disabled={saving || !amount}
                className="w-full bg-neon-500 text-black font-bold py-3 rounded-xl hover:bg-neon-600 transition-all disabled:opacity-60"
              >
                {saving ? 'Enregistrement...' : 'Ajouter la depense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
