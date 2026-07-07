import { useEffect, useMemo, useState } from "react";
import type { BusinessPage, Item } from "../types/business";
import Metric from "../components/business/Metric";
import { Input, ReadOnlyInput } from "../components/business/Input";
import { useBusinessItems } from "../hooks/useBusinessItems";
import { useExpenses } from "../hooks/useExpenses";
import {
  LayoutDashboard,
  Package,
  Euro,
  CreditCard,
  BarChart3,
  Settings,
  CheckSquare,
  Plus,
} from "lucide-react";

type NewItemForm = Omit<Item, "id" | "sku" | "purchaseDate">;

const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "today", label: "Aujourd'hui", icon: CheckSquare },
  { id: "stock", label: "Stock", icon: Package },
  { id: "sales", label: "Ventes", icon: Euro },
  { id: "expenses", label: "Dépenses", icon: CreditCard },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Paramètres", icon: Settings },
] as const;

export default function BusinessOS() {
  const [page, setPage] = useState<BusinessPage>("dashboard");
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const {
    items,
    loading,
    addItem: addBusinessItem,
    updateItem,
    deleteItem,
    sellItem,
  } = useBusinessItems();

  const { expenses, addExpense, deleteExpense } = useExpenses();

  const [accounts, setAccounts] = useState<string[]>(() => {
    const saved = localStorage.getItem("business_accounts");
    return saved ? JSON.parse(saved) : ["Matleshop", "Cheznous Boutique"];
  });

  useEffect(() => {
    localStorage.setItem("business_accounts", JSON.stringify(accounts));
  }, [accounts]);

  const addAccount = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (accounts.includes(clean)) return;
    setAccounts((prev) => [...prev, clean]);
  };

  const nextSku = useMemo(() => {
    return `RS-${String(items.length + 1).padStart(4, "0")}`;
  }, [items.length]);

  const addItem = async (form: NewItemForm) => {
    await addBusinessItem({
      sku: nextSku,
      purchaseDate: new Date().toISOString().slice(0, 10),
      ...form,
    });
    setPage("stock");
  };

  const finishEdit = () => {
    setEditingItem(null);
    setPage("stock");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        Chargement BusinessOS...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white overflow-hidden">
      <aside className="w-64 border-r border-white/5 bg-[#0A0A0A] p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-2xl font-black">
            Business<span className="text-[#FFC400]">OS</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">Cockpit privé revente</p>
        </div>

        <nav className="space-y-1 flex-1">
          {nav.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setPage(id);
                  if (id !== "new") setEditingItem(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
                  active
                    ? "bg-[#FFC400]/10 text-[#FFC400]"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => {
            setEditingItem(null);
            setPage("new");
          }}
          className="bg-[#FFC400] text-black font-bold rounded-2xl py-3 flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Nouvel article
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {page === "dashboard" && (
          <Dashboard
            items={items}
            expenses={expenses}
            accounts={accounts}
            onAddAccount={addAccount}
          />
        )}
        {page === "today" && <Today />}
        {page === "stock" && (
          <Stock
            items={items}
            onDelete={deleteItem}
            onEdit={(item) => {
              setEditingItem(item);
              setPage("new");
            }}
          />
        )}
        {page === "sales" && <Sales items={items} onSell={sellItem} />}
        {page === "expenses" && (
          <Expenses expenses={expenses} onAdd={addExpense} onDelete={deleteExpense} />
        )}
        {page === "analytics" && <Placeholder title="Analytics" />}
        {page === "settings" && <Placeholder title="Paramètres" />}
        {page === "new" && (
          <NewArticle
            nextSku={nextSku}
            onAdd={addItem}
            onUpdate={updateItem}
            editingItem={editingItem}
            onFinishEdit={finishEdit}
            accounts={accounts}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  items,
  expenses,
  accounts,
  onAddAccount,
}: {
  items: Item[];
  expenses: { amount: number }[];
  accounts: string[];
  onAddAccount: (name: string) => void;
}) {
  const [newAccount, setNewAccount] = useState("");
  const stockItems = items.filter((item) => item.status !== "Vendu");
  const soldItems = items.filter((item) => item.status === "Vendu");
  const capitalStock = stockItems.reduce((sum, item) => sum + item.purchasePrice, 0);
  const expectedStock = stockItems.reduce((sum, item) => sum + item.expectedPrice, 0);
  const revenue = soldItems.reduce((sum, item) => sum + (item.soldPrice ?? item.expectedPrice), 0);
  const grossProfit = soldItems.reduce(
    (sum, item) =>
      sum +
      ((item.soldPrice ?? item.expectedPrice) -
        item.purchasePrice -
        (item.fees ?? 0) -
        (item.shipping ?? 0)),
    0
  );
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const netProfit = grossProfit - totalExpenses;

  return (
    <div>
      <h2 className="text-4xl font-black mb-2">Dashboard</h2>
      <p className="text-gray-400 mb-8">Vue globale de ton business.</p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <Metric label="CA réalisé" value={`${revenue}€`} />
        <Metric label="Bénéfice brut" value={`${grossProfit}€`} />
        <Metric label="Dépenses" value={`${totalExpenses}€`} />
        <Metric label="Profit net" value={`${netProfit}€`} />
        <Metric label="Stock actuel" value={`${stockItems.length} articles`} />
        <Metric label="Capital stock" value={`${capitalStock}€`} />
        <Metric label="Valeur stock" value={`${expectedStock}€`} />
        <Metric label="Articles vendus" value={`${soldItems.length}`} />
      </div>
      <div className="bg-[#171717] border border-white/5 rounded-3xl p-6">
        <h3 className="text-2xl font-bold mb-6">Répartition par compte</h3>
        <div className="space-y-4">
          {accounts.map((account) => {
            const accountStock = stockItems.filter((item) => item.account === account);
            const accountSold = soldItems.filter((item) => item.account === account);
            const accountValue = accountStock.reduce((sum, item) => sum + item.expectedPrice, 0);
            return (
              <div
                key={account}
                className="flex justify-between items-center border-b border-white/5 pb-4 last:border-0"
              >
                <div>
                  <p className="font-bold text-lg">{account}</p>
                  <p className="text-gray-500 text-sm">
                    {accountStock.length} en stock • {accountSold.length} vendus
                  </p>
                </div>
                <div className="text-[#FFC400] font-bold text-xl">{accountValue}€</div>
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <input
            value={newAccount}
            onChange={(e) => setNewAccount(e.target.value)}
            placeholder="Nom du compte..."
            className="bg-black border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFC400]/60"
          />
          <button
            onClick={() => {
              onAddAccount(newAccount);
              setNewAccount("");
            }}
            className="bg-[#FFC400] text-black font-bold rounded-xl px-5 py-3"
          >
            Ajouter un compte
          </button>
        </div>
      </div>
    </div>
  );
}

function Today() {
  const tasks = [
    "Photographier les nouveaux articles",
    "Publier les annonces prêtes",
    "Mettre à jour les ventes",
    "Ajouter les dépenses",
    "Préparer les colis",
  ];
  return (
    <div>
      <h2 className="text-4xl font-black mb-2">Aujourd'hui</h2>
      <p className="text-gray-400 mb-8">Les actions qui font avancer le business.</p>
      <div className="space-y-3 max-w-2xl">
        {tasks.map((task) => (
          <label key={task} className="flex items-center gap-3 bg-[#171717] border border-white/5 rounded-2xl p-4">
            <input type="checkbox" className="accent-[#FFC400]" />
            <span>{task}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Stock({
  items,
  onDelete,
  onEdit,
}: {
  items: Item[];
  onDelete: (sku: string) => void;
  onEdit: (item: Item) => void;
}) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("Tous");
  const accounts = ["Tous", ...Array.from(new Set(items.map((item) => item.account)))];
  const stock = items
    .filter((item) => item.status !== "Vendu")
    .filter((item) => {
      const q = search.toLowerCase();
      const matchesSearch =
        item.sku.toLowerCase().includes(q) ||
        item.article.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q);
      const matchesAccount = accountFilter === "Tous" || item.account === accountFilter;
      return matchesSearch && matchesAccount;
    });

  return (
    <div>
      <h2 className="text-4xl font-black mb-2">Stock</h2>
      <p className="text-gray-400 mb-8">Inventaire avec SKU, compte et emplacement.</p>
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher SKU, marque, article, emplacement..."
          className="flex-1 bg-[#171717] border border-white/10 rounded-2xl px-5 py-3 text-sm outline-none focus:border-[#FFC400]/60"
        />
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="bg-[#171717] border border-white/10 rounded-2xl px-5 py-3 text-sm outline-none focus:border-[#FFC400]/60"
        >
          {accounts.map((account) => (
            <option key={account} value={account}>{account}</option>
          ))}
        </select>
      </div>
      <div className="bg-[#171717] border border-white/5 rounded-3xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-gray-400">
            <tr>
              <th className="text-left p-4">SKU</th>
              <th className="text-left p-4">Article</th>
              <th className="text-left p-4">Compte</th>
              <th className="text-left p-4">Emplacement</th>
              <th className="text-left p-4">Achat</th>
              <th className="text-left p-4">Prix prévu</th>
              <th className="text-left p-4">Statut</th>
              <th className="text-right p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((item) => (
              <tr key={item.sku} className="border-t border-white/5">
                <td className="p-4 text-[#FFC400] font-bold">{item.sku}</td>
                <td className="p-4">
                  <div className="font-medium">{item.article}</div>
                  <div className="text-xs text-gray-500">{item.brand}</div>
                </td>
                <td className="p-4">{item.account}</td>
                <td className="p-4">{item.location}</td>
                <td className="p-4">{item.purchasePrice}€</td>
                <td className="p-4">{item.expectedPrice}€</td>
                <td className="p-4">{item.status}</td>
                <td className="p-4">
                  <div className="flex justify-end gap-3">
                    <button onClick={() => onEdit(item)} className="text-[#FFC400] text-xs font-bold">
                      Modifier
                    </button>
                    <button onClick={() => onDelete(item.sku)} className="text-red-400 text-xs font-bold">
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {stock.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">Aucun article trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sales({
  items,
  onSell,
}: {
  items: Item[];
  onSell: (sku: string, soldPrice: number, fees: number) => void;
}) {
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [fees, setFees] = useState("");
  const stock = items.filter((item) => item.status !== "Vendu");
  const sold = items.filter((item) => item.status === "Vendu");
  const selected = stock.find((item) => item.sku === selectedSku);

  return (
    <div>
      <h2 className="text-4xl font-black mb-2">Ventes</h2>
      <p className="text-gray-400 mb-8">Enregistre une vente en quelques secondes.</p>
      {selected && (
        <div className="bg-[#171717] border border-[#FFC400]/20 rounded-3xl p-6 max-w-3xl mb-8">
          <h3 className="text-xl font-black mb-1">{selected.article}</h3>
          <p className="text-sm text-gray-500 mb-6">{selected.sku} • Achat {selected.purchasePrice}€</p>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <Input label="Prix vendu" value={soldPrice} onChange={setSoldPrice} />
            <Input label="Frais" value={fees} onChange={setFees} />
          </div>
          <button
            onClick={() => {
              onSell(selected.sku, Number(soldPrice || selected.expectedPrice), Number(fees || 0));
              setSelectedSku(null);
              setSoldPrice("");
              setFees("");
            }}
            className="w-full bg-[#FFC400] text-black font-bold rounded-2xl py-3"
          >
            Valider la vente
          </button>
        </div>
      )}
      <h3 className="font-bold mb-3">Articles disponibles</h3>
      <div className="space-y-3 max-w-5xl mb-10">
        {stock.map((item) => (
          <div key={item.sku} className="bg-[#171717] rounded-2xl border border-white/5 p-5 flex justify-between items-center">
            <div>
              <h3 className="font-bold">{item.article}</h3>
              <p className="text-sm text-gray-500">{item.sku} • {item.account} • prévu {item.expectedPrice}€</p>
            </div>
            <button
              onClick={() => {
                setSelectedSku(item.sku);
                setSoldPrice(String(item.expectedPrice));
                setFees("0");
              }}
              className="bg-[#FFC400] text-black px-4 py-2 rounded-xl font-bold"
            >
              Vendre
            </button>
          </div>
        ))}
        {stock.length === 0 && <p className="text-sm text-gray-500">Aucun article disponible.</p>}
      </div>
      <h3 className="font-bold mb-3">Vendus</h3>
      <div className="space-y-3 max-w-5xl">
        {sold.map((item) => {
          const profit =
            (item.soldPrice ?? item.expectedPrice) -
            item.purchasePrice -
            (item.fees ?? 0) -
            (item.shipping ?? 0);
          return (
            <div key={item.sku} className="bg-[#171717] rounded-2xl border border-white/5 p-5 flex justify-between items-center opacity-80">
              <div>
                <h3 className="font-bold">{item.article}</h3>
                <p className="text-sm text-gray-500">
                  {item.sku} • vendu {item.soldPrice ?? item.expectedPrice}€ • frais {item.fees ?? 0}€
                </p>
              </div>
              <p className="text-[#FFC400] font-black">+{profit}€</p>
            </div>
          );
        })}
        {sold.length === 0 && <p className="text-sm text-gray-500">Aucune vente pour l'instant.</p>}
      </div>
    </div>
  );
}

function NewArticle({
  nextSku,
  onAdd,
  onUpdate,
  editingItem,
  onFinishEdit,
  accounts,
}: {
  nextSku: string;
  onAdd: (form: NewItemForm) => Promise<void>;
  onUpdate: (item: Item) => Promise<void>;
  editingItem: Item | null;
  onFinishEdit: () => void;
  accounts: string[];
}) {
  const emptyForm = (): NewItemForm => ({
    account: accounts[0] ?? "Matleshop",
    location: "",
    article: "",
    brand: "",
    category: "",
    size: "",
    condition: "Bon état",
    purchasePrice: 0,
    expectedPrice: 0,
    status: "À publier",
  });

  const [form, setForm] = useState<NewItemForm>(emptyForm);

  useEffect(() => {
    if (!editingItem) {
      setForm(emptyForm());
      return;
    }
    setForm({
      account: editingItem.account,
      location: editingItem.location,
      article: editingItem.article,
      brand: editingItem.brand,
      category: editingItem.category,
      size: editingItem.size,
      condition: editingItem.condition,
      purchasePrice: editingItem.purchasePrice,
      expectedPrice: editingItem.expectedPrice,
      status: editingItem.status,
    });
  }, [editingItem, accounts]);

  const update = (key: keyof NewItemForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: key === "purchasePrice" || key === "expectedPrice" ? Number(value) : value,
    }));
  };

  const handleSubmit = async () => {
    if (editingItem) {
      await onUpdate({ ...editingItem, ...form });
      onFinishEdit();
      return;
    }
    await onAdd(form);
  };

  return (
    <div>
      <h2 className="text-4xl font-black mb-2">{editingItem ? "Modifier l'article" : "Nouvel article"}</h2>
      <p className="text-gray-400 mb-8">
        {editingItem ? "Corrige les informations de l'article." : "Ajoute un article au stock."}
      </p>
      <div className="max-w-3xl bg-[#171717] border border-white/5 rounded-3xl p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyInput label="SKU" value={editingItem ? editingItem.sku : nextSku} />
          <label className="block">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Compte</p>
            <select
              value={form.account}
              onChange={(e) => update("account", e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFC400]/60"
            >
              {accounts.map((account) => (
                <option key={account} value={account}>{account}</option>
              ))}
            </select>
          </label>
          <Input label="Emplacement" value={form.location} onChange={(v) => update("location", v)} />
          <Input label="Article" value={form.article} onChange={(v) => update("article", v)} />
          <Input label="Marque" value={form.brand} onChange={(v) => update("brand", v)} />
          <Input label="Catégorie" value={form.category} onChange={(v) => update("category", v)} />
          <Input label="Taille" value={form.size} onChange={(v) => update("size", v)} />
          <Input label="État" value={form.condition} onChange={(v) => update("condition", v)} />
          <Input label="Prix achat" value={String(form.purchasePrice)} onChange={(v) => update("purchasePrice", v)} />
          <Input label="Prix prévu" value={String(form.expectedPrice)} onChange={(v) => update("expectedPrice", v)} />
          <Input label="Statut" value={form.status} onChange={(v) => update("status", v)} />
        </div>
        <button onClick={handleSubmit} className="w-full bg-[#FFC400] text-black font-bold rounded-2xl py-3">
          {editingItem ? "Enregistrer les modifications" : "Ajouter au stock"}
        </button>
      </div>
    </div>
  );
}

function Expenses({
  expenses,
  onAdd,
  onDelete,
}: {
  expenses: {
    id: string;
    category: string;
    amount: number;
    note: string;
    expenseDate: string;
  }[];
  onAdd: (category: string, amount: number, note: string) => void;
  onDelete: (id: string) => void;
}) {
  const [category, setCategory] = useState("Friperie");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div>
      <h2 className="text-4xl font-black mb-2">Dépenses</h2>
      <p className="text-gray-400 mb-8">Suis tes achats et frais.</p>
      <div className="max-w-3xl bg-[#171717] border border-white/5 rounded-3xl p-6 mb-8 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Input label="Catégorie" value={category} onChange={setCategory} />
          <Input label="Montant" value={amount} onChange={setAmount} />
          <Input label="Note" value={note} onChange={setNote} />
        </div>
        <button
          onClick={() => {
            onAdd(category, Number(amount || 0), note);
            setAmount("");
            setNote("");
          }}
          className="w-full bg-[#FFC400] text-black font-bold rounded-2xl py-3"
        >
          Ajouter la dépense
        </button>
      </div>
      <div className="max-w-3xl bg-[#171717] border border-white/5 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5 flex justify-between">
          <span className="font-bold">Total</span>
          <span className="text-[#FFC400] font-black">{total}€</span>
        </div>
        {expenses.map((expense) => (
          <div key={expense.id} className="p-5 border-b border-white/5 flex justify-between items-center">
            <div>
              <p className="font-bold">{expense.category}</p>
              <p className="text-sm text-gray-500">{expense.note || "Sans note"} • {expense.expenseDate}</p>
            </div>
            <div className="flex items-center gap-4">
              <p className="font-black">{expense.amount}€</p>
              <button onClick={() => onDelete(expense.id)} className="text-red-400 text-xs font-bold">
                Supprimer
              </button>
            </div>
          </div>
        ))}
        {expenses.length === 0 && <p className="p-6 text-center text-gray-500">Aucune dépense.</p>}
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-4xl font-black mb-2">{title}</h2>
      <p className="text-gray-400">Page à construire.</p>
    </div>
  );
}
