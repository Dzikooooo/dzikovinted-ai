import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { WaitlistSignup } from '../../../lib/types';
import { SearchInput } from '../../../components/ui/SearchInput';
import { SectionLabel } from '../../../components/ui/SectionLabel';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';

const STATUS_BADGE: Record<WaitlistSignup['status'], { label: string; tone: 'warning' | 'positive' | 'neutral' }> = {
  pending: { label: 'En attente', tone: 'warning' },
  approved: { label: 'Approuvé', tone: 'positive' },
  rejected: { label: 'Rejeté', tone: 'neutral' },
};

// Onglet "Liste d'attente" (2026-08-30, beta privee) -- lit waitlist_signups
// (migration 20260830110000_add_waitlist_beta_gating.sql), agit via les 2 RPC
// SECURITY DEFINER dediees (admin_approve_waitlist_email/
// admin_reject_waitlist_email) -- jamais un update direct sur cette table
// depuis le client (RLS ne l'autorise de toute facon qu'a l'insert public).
// Approuver un email fonctionne AUSSI pour un email jamais inscrit sur cette
// liste (allowlist directe, voir le champ dedie en haut) -- couvre "je veux
// autoriser cette personne avant meme qu'elle ne s'inscrive".
export function AdminWaitlistTab() {
  const [rows, setRows] = useState<WaitlistSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [workingEmail, setWorkingEmail] = useState<string | null>(null);

  const [allowlistEmail, setAllowlistEmail] = useState('');
  const [allowlistWorking, setAllowlistWorking] = useState(false);
  const [allowlistError, setAllowlistError] = useState<string | null>(null);
  const [allowlistDone, setAllowlistDone] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('waitlist_signups')
      .select('*')
      .order('created_at', { ascending: false });
    if (loadError) {
      console.error(loadError);
      setError("Impossible de charger la liste d'attente. Réessaie plus tard.");
    } else {
      setError(null);
    }
    setRows((data ?? []) as WaitlistSignup[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => !search || r.email.toLowerCase().includes(search.toLowerCase()));
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const approve = async (email: string) => {
    setWorkingEmail(email);
    const { error: rpcError } = await supabase.rpc('admin_approve_waitlist_email', { p_email: email });
    setWorkingEmail(null);
    if (rpcError) {
      console.error(rpcError);
      setError("Impossible d'approuver cette demande. Réessaie plus tard.");
      return;
    }
    await load();
  };

  const reject = async (email: string) => {
    setWorkingEmail(email);
    const { error: rpcError } = await supabase.rpc('admin_reject_waitlist_email', { p_email: email });
    setWorkingEmail(null);
    if (rpcError) {
      console.error(rpcError);
      setError('Impossible de rejeter cette demande. Réessaie plus tard.');
      return;
    }
    await load();
  };

  const approveAllowlistEmail = async () => {
    const trimmed = allowlistEmail.trim();
    if (!trimmed) return;
    setAllowlistWorking(true);
    setAllowlistError(null);
    setAllowlistDone(false);
    const { error: rpcError } = await supabase.rpc('admin_approve_waitlist_email', { p_email: trimmed });
    setAllowlistWorking(false);
    if (rpcError) {
      console.error(rpcError);
      setAllowlistError("Impossible d'approuver cet email. Réessaie plus tard.");
      return;
    }
    setAllowlistEmail('');
    setAllowlistDone(true);
    setTimeout(() => setAllowlistDone(false), 3000);
    await load();
  };

  return (
    <div>
      {error && <ErrorBanner message={error} className="mb-6" />}

      <div className="bg-surface border border-gray-200 rounded-2xl p-6 max-w-2xl mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4 text-neon-500" />
          <h2 className="font-bold text-sm">Autoriser un email directement</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Donne l'accès à une adresse avant même qu'elle rejoigne la liste — dès qu'un compte est créé (ou existe déjà)
          avec cet email, il est immédiatement débloqué.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={allowlistEmail}
            onChange={(e) => setAllowlistEmail(e.target.value)}
            placeholder="email@exemple.com"
            className="flex-1 bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
          />
          <Button loading={allowlistWorking} disabled={!allowlistEmail.trim()} onClick={approveAllowlistEmail}>
            Autoriser
          </Button>
        </div>
        {allowlistError && <p className="text-sm text-red-700 mt-2">{allowlistError}</p>}
        {allowlistDone && <p className="text-sm text-neon-500 mt-2">Email autorisé.</p>}
      </div>

      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Demandes reçues</SectionLabel>
        <span className="text-xs text-gray-500">
          {pendingCount} en attente · {rows.length} au total
        </span>
      </div>
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un email..."
        className="mb-4"
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} shape="block" className="h-14" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-500">Aucune demande pour le moment.</p>
        </div>
      ) : (
        <div className="bg-surface border border-gray-200 rounded-2xl divide-y divide-gray-200">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800 truncate">{r.email}</p>
                  <Badge label={STATUS_BADGE[r.status].label} tone={STATUS_BADGE[r.status].tone} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.status !== 'approved' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    loading={workingEmail === r.email}
                    onClick={() => approve(r.email)}
                  >
                    Approuver
                  </Button>
                )}
                {r.status !== 'rejected' && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<XCircle className="w-3.5 h-3.5" />}
                    loading={workingEmail === r.email}
                    onClick={() => reject(r.email)}
                  >
                    Rejeter
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
