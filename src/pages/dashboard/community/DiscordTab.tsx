import { Bell, ExternalLink, Link2, Loader2, Lock, Map, Unlink, Users } from 'lucide-react';
import { DiscordIcon } from '../../../components/ui/DiscordIcon';
import { useDiscordAccount } from '../../../hooks/useDiscordAccount';
import { discordInviteUrl } from '../../../services/discordAccount';
import type { Plan } from '../../../lib/types';

// Onglet Communaute > Discord.
//
// Remplace la tuile statique precedente, qui n'affichait qu'un lien -- ou, si
// VITE_DISCORD_INVITE_URL manquait, la phrase "Lien Discord pas encore
// configure" et rien d'autre.
//
// REGLE TENUE DANS TOUT CE FICHIER : aucun chiffre, aucun statut et aucun
// avantage n'est affiche s'il n'est pas reel. Le compteur de membres vient de
// l'endpoint public widget.json de Discord ; quand il n'est pas disponible, le
// bloc le dit au lieu d'afficher un nombre plausible. Les acces marques
// "Pro/Business" sont annonces comme ce qu'ils sont -- une contrepartie
// d'abonnement -- et l'etat de synchronisation des roles n'est jamais affirme
// tant que la fonction serveur qui les attribue n'est pas branchee.

const PERKS: Array<{ icon: typeof Bell; title: string; description: string; requiresPaidPlan: boolean }> = [
  {
    icon: Bell,
    title: 'Alertes opportunités',
    description: 'Les bons plans repérés par la communauté, en direct.',
    requiresPaidPlan: false,
  },
  {
    icon: Users,
    title: 'Entraide revendeurs',
    description: 'Questions prix, sourcing, litiges : quelqu\'un a déjà eu le cas.',
    requiresPaidPlan: false,
  },
  {
    icon: Lock,
    title: 'Canaux privés Pro',
    description: 'Salons réservés aux abonnés, avec accès direct à l\'équipe.',
    requiresPaidPlan: true,
  },
  {
    icon: Map,
    title: 'Roadmap & votes',
    description: 'Pèse sur ce qui est construit ensuite.',
    requiresPaidPlan: true,
  },
];

type DiscordAccountState = ReturnType<typeof useDiscordAccount>;

function ActivityBlock({ activity }: { activity: DiscordAccountState['activity'] }) {

  return (
    <div className="bg-surface border border-gray-200 rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <DiscordIcon className="w-6 h-6 text-neon-500" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-900">Discord ResellOS</h3>
          {activity === null && <p className="text-sm text-gray-500 mt-1">Vérification de l'activité…</p>}

          {activity?.status === 'ok' && (
            <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" aria-hidden="true" />
              <span>
                <span className="font-bold text-gray-900">{activity.presenceCount}</span> membre
                {activity.presenceCount > 1 ? 's' : ''} en ligne
              </span>
            </p>
          )}

          {/* Trois etats de NON-disponibilite distincts : ils n'appellent pas
              la meme action (activer le widget cote Discord / renseigner une
              variable d'env / reessayer). Les confondre en un seul message
              rendrait le probleme indebuggable. */}
          {activity?.status === 'widget_disabled' && (
            <p className="text-sm text-gray-500 mt-1">
              Le compteur en direct nécessite l'activation du widget sur le serveur Discord.
            </p>
          )}
          {activity?.status === 'not_configured' && (
            <p className="text-sm text-gray-500 mt-1">Compteur en direct pas encore configuré.</p>
          )}
          {activity?.status === 'error' && (
            <p className="text-sm text-gray-500 mt-1">Activité indisponible pour le moment.</p>
          )}
        </div>
      </div>

      {(() => {
        const href = (activity?.status === 'ok' && activity.inviteUrl) || discordInviteUrl;
        return href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-neon-600 text-white font-bold px-5 py-3 rounded-xl hover:bg-neon-700 transition-colors"
          >
            Rejoindre le Discord <ExternalLink className="w-4 h-4" />
          </a>
        ) : (
          <p className="mt-5 text-xs text-gray-500">
            Lien d'invitation pas encore configuré — il apparaîtra ici dès qu'il le sera.
          </p>
        );
      })()}
    </div>
  );
}

function planLabel(plan: Plan): string {
  if (plan === 'free') return 'Gratuit';
  if (plan === 'pro') return 'Pro';
  return 'Business';
}

function AccountBlock({
  profile,
  isLinked,
  state,
  error,
  roleSync,
  link,
  unlink,
}: Pick<DiscordAccountState, 'profile' | 'isLinked' | 'state' | 'error' | 'roleSync' | 'link' | 'unlink'>) {
  const busy = state !== 'idle';

  return (
    <div className="bg-surface border border-gray-200 rounded-2xl p-6">
      <h3 className="font-bold text-gray-900 mb-1">Compte Discord</h3>

      {!isLinked && (
        <>
          <p className="text-sm text-gray-500 mb-5">
            Relie ton compte pour débloquer automatiquement tes rôles et accès exclusifs selon ton plan.
          </p>
          <button
            onClick={link}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-neon-600 text-white font-bold px-5 py-3 rounded-xl hover:bg-neon-700 transition-colors disabled:opacity-60"
          >
            {state === 'linking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Lier mon compte Discord
          </button>
        </>
      )}

      {isLinked && profile && (
        <>
          <div className="flex items-center gap-3 mt-4 p-4 rounded-xl bg-surface-alt border border-gray-200">
            <div className="w-11 h-11 rounded-full bg-neon-500/10 flex items-center justify-center flex-shrink-0">
              <DiscordIcon className="w-5 h-5 text-neon-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-900 truncate">
                {profile.discord_username ? `@${profile.discord_username}` : 'Compte Discord relié'}
              </p>
              <p className="text-xs text-green-600 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" aria-hidden="true" />
                Synchronisé
              </p>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-md bg-neon-500/10 text-neon-500 flex-shrink-0">
              {planLabel(profile.plan)}
            </span>
          </div>

          {/* "Synchronise" ci-dessus ne parle QUE de la liaison du compte.
              L'attribution reelle des roles sur le serveur depend d'une
              fonction serveur distincte -- tant qu'elle n'est pas branchee, on
              le dit, plutot que de laisser deduire qu'un role a ete accorde. */}
          {roleSync?.status === 'not_configured' && (
            <p className="text-xs text-gray-500 mt-3">
              L'attribution automatique des rôles n'est pas encore active : ton accès est pour l'instant accordé
              manuellement par l'équipe.
            </p>
          )}
          {roleSync?.status === 'error' && (
            <p className="text-xs text-gray-500 mt-3">
              La synchronisation du rôle n'a pas abouti ({roleSync.message}).
            </p>
          )}

          <button
            onClick={unlink}
            disabled={busy}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-600 font-semibold px-5 py-2.5 rounded-xl hover:border-gray-300 hover:text-gray-900 transition-colors disabled:opacity-60"
          >
            {state === 'unlinking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            Dissocier
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </div>
  );
}

function PerksGrid({ plan }: { plan: Plan }) {
  const hasPaidPlan = plan !== 'free';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {PERKS.map(({ icon: Icon, title, description, requiresPaidPlan }) => {
        const locked = requiresPaidPlan && !hasPaidPlan;
        return (
          <div
            key={title}
            className="bg-surface border border-gray-200 rounded-2xl p-5 flex items-start gap-4"
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${locked ? 'text-gray-400' : 'text-neon-500'}`} />
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-sm flex items-center gap-2">
                {title}
                {/* Un acces reserve est marque comme tel plutot que masque :
                    l'utilisateur doit savoir ce qu'il n'a pas encore. */}
                {locked && (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    Pro
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// UN SEUL appel a useDiscordAccount() pour tout l'onglet (2026-08-26). Il
// etait appele dans les trois composants, et le hook porte deux effets a
// declenchement automatique : widget.json etait donc interroge trois fois a
// chaque ouverture, et au retour du flux OAuth jusqu'a trois
// sync_discord_identity() partaient en parallele. Sans consequence
// fonctionnelle (la RPC est idempotente et exclut le compte courant de son
// test d'unicite), mais du gaspillage visible et un diagnostic brouille.
export function DiscordTab() {
  const discord = useDiscordAccount();
  const { profile } = discord;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActivityBlock activity={discord.activity} />
        <AccountBlock
          profile={discord.profile}
          isLinked={discord.isLinked}
          state={discord.state}
          error={discord.error}
          roleSync={discord.roleSync}
          link={discord.link}
          unlink={discord.unlink}
        />
      </div>
      <PerksGrid plan={profile?.plan ?? 'free'} />
    </div>
  );
}
