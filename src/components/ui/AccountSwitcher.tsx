import { useMemo, useState } from 'react';
import { ChevronDown, Layers, Search, Settings } from 'lucide-react';
import AccountAvatar from './AccountAvatar';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';

function relativeSync(iso: string | null): string {
  if (!iso) return 'Jamais synchronisé';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

interface AccountSwitcherProps {
  onManageAccounts: () => void;
}

export default function AccountSwitcher({ onManageAccounts }: AccountSwitcherProps) {
  const { accounts, selectedAccountId, selectedAccount, selectAccount } = useVintedAccountFilter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => a.label.toLowerCase().includes(q));
  }, [accounts, search]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  if (accounts.length === 0) return null;

  return (
    <div className="relative px-3 py-3 border-b border-white/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors text-left"
      >
        {selectedAccountId === 'all' ? (
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-gray-400" />
          </div>
        ) : (
          <AccountAvatar label={selectedAccount?.label ?? '?'} />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-200 truncate">
            {selectedAccountId === 'all' ? 'Tous les comptes' : selectedAccount?.label}
          </p>
          <p className="text-[10px] text-gray-500">
            {selectedAccountId === 'all' ? `${accounts.length} compte${accounts.length > 1 ? 's' : ''}` : selectedAccount?.connected ? 'Connecté' : 'Déconnecté'}
          </p>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />

          <div className="absolute left-3 right-3 top-full mt-1 z-50 glass-card shadow-2xl p-2 animate-slide-down">
            {accounts.length > 6 && (
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un compte..."
                  className="w-full bg-dark-400 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>
            )}

            <button
              onClick={() => {
                selectAccount('all');
                close();
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                selectedAccountId === 'all' ? 'bg-neon-500/10' : 'hover:bg-white/5'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                <Layers className="w-3 h-3 text-gray-400" />
              </div>
              <span className={`text-xs font-medium ${selectedAccountId === 'all' ? 'text-neon-500' : 'text-gray-300'}`}>
                Tous les comptes
              </span>
            </button>

            <div className="my-2 border-t border-white/5" />

            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {filteredAccounts.length === 0 ? (
                <p className="text-[11px] text-gray-600 text-center py-3">Aucun compte trouvé.</p>
              ) : (
                filteredAccounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => {
                      selectAccount(account.id);
                      close();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      selectedAccountId === account.id ? 'bg-neon-500/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <AccountAvatar label={account.label} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${selectedAccountId === account.id ? 'text-neon-500' : 'text-gray-200'}`}>
                        {account.label}
                      </p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${account.connected ? 'bg-neon-500' : 'bg-gray-600'}`} />
                        {relativeSync(account.last_synced_at)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="my-2 border-t border-white/5" />

            <button
              onClick={() => {
                close();
                onManageAccounts();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-white/5 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                <Settings className="w-3 h-3 text-gray-400" />
              </div>
              <span className="text-xs font-medium text-gray-400">Gérer les comptes</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
