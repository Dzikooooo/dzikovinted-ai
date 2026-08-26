import { useMemo, useState } from 'react';
import { ChevronDown, Layers, Search, Settings } from 'lucide-react';
import AccountAvatar from './AccountAvatar';
import { useVintedAccountFilter } from '../../contexts/VintedAccountFilterContext';
import { formatRelativeSync } from '../../lib/formatRelativeTime';

interface AccountSwitcherProps {
  onManageAccounts: () => void;
}

// Marqueur de selection : une pastille violette a DROITE, pas un libelle
// colore. Le libelle reste en gris fonce -- du violet clair sur le fond
// violet clair de la ligne selectionnee tombait sous le seuil de contraste,
// et la selection etait alors portee par la seule couleur du texte.
// L'information reste doublee par aria-selected sur chaque option.
function SelectedDot() {
  return <span className="w-2 h-2 rounded-full bg-neon-500 flex-shrink-0" aria-hidden="true" />;
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
    <div className="relative px-3 py-3 border-b border-gray-200">
      {/* Declencheur : il ne se lisait pas comme un controle -- aucun fond,
          aucune bordure, un pseudo en 12px et un sous-texte en 10px. Il avait
          l'apparence d'un simple en-tete de sidebar alors que c'est le
          selecteur qui pilote le filtrage de TOUT le dashboard. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors text-left"
      >
        {selectedAccountId === 'all' ? (
          <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-gray-500" />
          </div>
        ) : (
          <AccountAvatar label={selectedAccount?.label ?? '?'} />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">
            {selectedAccountId === 'all' ? 'Tous les comptes' : selectedAccount?.label}
          </p>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {selectedAccountId === 'all'
              ? `${accounts.length} compte${accounts.length > 1 ? 's' : ''} · Vue globale`
              : `${selectedAccount?.connected ? 'Connecté' : 'Déconnecté'} · ${formatRelativeSync(selectedAccount?.last_synced_at ?? null)}`}
          </p>
        </div>

        <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />

          {/* Fond OPAQUE plutot que `glass-card` (blanc a 80% + flou) : sur une
              sidebar deja claire, un panneau translucide se confondait avec ce
              qu'il recouvre. Ombre franche + bordure nette pour le detacher.
              role="listbox" : ce popover se comporte comme un select, et
              l'etat selectionne doit etre annonce autrement que par une
              couleur (voir CLAUDE.md, tokens & accessibilite). */}
          <div
            role="listbox"
            aria-label="Compte Vinted actif"
            className="absolute left-3 right-3 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2 animate-slide-down"
          >
            {accounts.length > 6 && (
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un compte..."
                  className="w-full bg-dark-400 border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
                />
              </div>
            )}

            <button
              role="option"
              aria-selected={selectedAccountId === 'all'}
              onClick={() => {
                selectAccount('all');
                close();
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                selectedAccountId === 'all' ? 'bg-neon-500/10' : 'hover:bg-gray-100'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Layers className="w-3 h-3 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                {/* Le libelle selectionne reste en gris FONCE : du violet clair
                    sur un fond violet clair perdait tout contraste. C'est la
                    pastille a droite qui marque la selection. */}
                <p className="text-xs font-semibold text-gray-900">Tous les comptes</p>
                <p className="text-[11px] text-gray-500">Vue globale de l'activité</p>
              </div>
              {selectedAccountId === 'all' && <SelectedDot />}
            </button>

            <div className="my-2 border-t border-gray-200" />

            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {filteredAccounts.length === 0 ? (
                <p className="text-[11px] text-gray-500 text-center py-3">Aucun compte trouvé.</p>
              ) : (
                filteredAccounts.map((account) => (
                  <button
                    key={account.id}
                    role="option"
                    aria-selected={selectedAccountId === account.id}
                    onClick={() => {
                      selectAccount(account.id);
                      close();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      selectedAccountId === account.id ? 'bg-neon-500/10' : 'hover:bg-gray-100'
                    }`}
                  >
                    <AccountAvatar label={account.label} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{account.label}</p>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${account.connected ? 'bg-green-500' : 'bg-gray-400'}`}
                          aria-hidden="true"
                        />
                        {account.connected ? 'Connecté' : 'Déconnecté'} · {formatRelativeSync(account.last_synced_at)}
                      </p>
                    </div>
                    {selectedAccountId === account.id && <SelectedDot />}
                  </button>
                ))
              )}
            </div>

            <div className="my-2 border-t border-gray-200" />

            <button
              onClick={() => {
                close();
                onManageAccounts();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Settings className="w-3 h-3 text-gray-500" />
              </div>
              <span className="text-xs font-medium text-gray-500">Gérer les comptes</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
