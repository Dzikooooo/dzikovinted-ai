import { useState } from 'react';
import { X, Package, AlertTriangle, Info, CalendarClock } from 'lucide-react';
import AccountAvatar from '../ui/AccountAvatar';
import { Modal } from '../ui/Modal';
import { SegmentedControl } from '../ui/SegmentedControl';
import { DatePicker, TimePicker } from '../ui/DatePicker';
import type { Listing, VintedAccount } from '../../lib/types';
import { formatEUR } from '../../lib/currency';
import { formatScheduleLabel, isDateInPast, isScheduleValid, isTimeInPastToday, type RepublishSchedule } from '../../lib/republishSchedule';

export type PackageSize = 'small' | 'medium' | 'large';

const PACKAGE_SIZE_OPTIONS: { value: PackageSize; label: string; hint: string }[] = [
  { value: 'small', label: 'Petit', hint: 'Accessoires, chaussures légères' },
  { value: 'medium', label: 'Moyen', hint: 'Vêtements, chaussures' },
  { value: 'large', label: 'Grand', hint: 'Manteaux, articles volumineux' },
];

// Heuristique de pre-remplissage uniquement (jamais soumise sans revue
// utilisateur, voir l'ecran de confirmation) : la taille de colis n'a pas
// d'equivalent dans le modele Listing, decision utilisateur explicite
// (voir plan) de toujours la demander en confirmation avec une valeur par
// defaut ajustable plutot que de la deviner silencieusement.
// Accepte null (Listing.category peut reellement l'etre, voir types.ts) --
// bug confirme le 2026-07-23 : category.toLowerCase() plantait sans garde
// pour toute annonce importee/synchronisee sans categorie jamais capturee.
// Aucun check ne bloque plus publish_listing/republish_listing sur une
// categorie manquante (retire le 2026-08-11, voir publishListing.ts) --
// cette fonction reste defensive independamment de cette garde.
function defaultPackageSize(category: string | null): PackageSize {
  const normalized = (category ?? '').toLowerCase();
  if (/(chaussure|sac|accessoire|bijou|montre)/.test(normalized)) return 'small';
  if (/(manteau|veste|doudoune|canapé|meuble)/.test(normalized)) return 'large';
  return 'medium';
}

interface PublishConfirmationModalProps {
  listing: Listing;
  account: VintedAccount;
  onCancel: () => void;
  onConfirm: (packageSize: PackageSize) => void;
  // Mission "UI DE PROGRAMMATION DES REPUBLICATIONS" (2026-08-20) : optionnel
  // et UNIQUEMENT utilise quand isRepublish -- une publication fraiche
  // (isRepublish=false) ne propose jamais le choix Maintenant/Programmer,
  // comportement strictement inchange (voir plus bas, `showScheduleChoice`).
  // Appele UNIQUEMENT avec une date/heure deja validees (voir
  // isScheduleValid) -- ne declenche jamais onConfirm ni aucune action
  // Vinted reelle. Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) :
  // asynchrone et retourne desormais un resultat explicite -- l'appelant
  // (ListingsManagementSection) ecrit reellement dans Supabase
  // (republish_schedules) et peut echouer (ex. conflit 23505, erreur
  // reseau). Cette modale attend la reponse REELLE avant de se considerer
  // fermee : jamais de fermeture/badge optimiste avant que Supabase ait
  // confirme.
  onSchedule?: (date: string, time: string, packageSize: PackageSize) => Promise<{ ok: true } | { ok: false; error: string }>;
  // Prefill pour "Modifier" une programmation existante -- reouvre cette
  // meme modale avec le mode et la date/heure deja choisies plutot que de
  // repartir de zero.
  initialSchedule?: RepublishSchedule;
  // true quand l'annonce a deja un vinted_item_id (deja publiee, en ligne ou
  // non -- voir checks.ts::checkListingRepublishEligible). Le formulaire de
  // confirmation reste identique (memes champs a valider),
  // seul le libelle change pour ne jamais laisser croire a une
  // "reactivation" de l'ancienne fiche Vinted -- il s'agit toujours d'une
  // creation.
  isRepublish?: boolean;
}

export default function PublishConfirmationModal({
  listing,
  account,
  onCancel,
  onConfirm,
  onSchedule,
  initialSchedule,
  isRepublish = false,
}: PublishConfirmationModalProps) {
  // Mission "ROUND 2" : "Modifier" reouvre cette modale sur une programmation
  // existante -- si la ligne DB porte deja un package_size (toujours le cas
  // pour une vraie ligne republish_schedules, colonne not null), on part de
  // CETTE valeur plutot que de re-deviner via defaultPackageSize(), qui
  // ecraserait silencieusement un choix deja explicitement fait.
  const [packageSize, setPackageSize] = useState<PackageSize>(
    initialSchedule?.mode === 'scheduled' && initialSchedule.packageSize
      ? (initialSchedule.packageSize as PackageSize)
      : defaultPackageSize(listing.category)
  );
  // Choix Maintenant/Programmer -- n'existe visuellement que pour une
  // republication (voir showScheduleChoice ci-dessous). `initialSchedule`
  // permet a "Modifier" (ListingsManagementSection) de reouvrir cette modale
  // deja positionnee sur "Programmer" avec la date/heure existantes.
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>(
    initialSchedule?.mode === 'scheduled' ? 'scheduled' : 'now'
  );
  const [scheduleDate, setScheduleDate] = useState<string | null>(
    initialSchedule?.mode === 'scheduled' ? initialSchedule.date : null
  );
  const [scheduleTime, setScheduleTime] = useState<string | null>(
    initialSchedule?.mode === 'scheduled' ? initialSchedule.time : null
  );
  // Mission "ROUND 2" : etats explicites de la soumission Supabase --
  // jamais de fermeture ni de badge avant une reponse REELLE. scheduleError
  // porte le message deja traduit par le service (voir
  // republishSchedules.ts::toActionError, ex. conflit 23505) tel quel,
  // jamais reinterprete ici.
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const showScheduleChoice = isRepublish && !!onSchedule;
  const now = new Date();
  const scheduleValid = isScheduleValid(scheduleDate, scheduleTime, now);
  // Message d'aide uniquement quand une date+heure COMPLETES sont deja
  // choisies mais invalides (heure deja passee pour aujourd'hui) -- jamais
  // affiche tant que le choix est simplement incomplet (pas encore une
  // erreur, juste pas fini).
  const scheduleTimeInPast =
    !!scheduleDate && !!scheduleTime && !isDateInPast(scheduleDate, now) && isTimeInPastToday(scheduleDate, scheduleTime, now);

  async function handleScheduleSubmit(): Promise<void> {
    if (!scheduleValid || !scheduleDate || !scheduleTime || !onSchedule || scheduleSubmitting) return;
    setScheduleSubmitting(true);
    setScheduleError(null);
    const result = await onSchedule(scheduleDate, scheduleTime, packageSize);
    if (!result.ok) {
      setScheduleSubmitting(false);
      setScheduleError(result.error);
      return;
    }
    // Succes : l'appelant (ListingsManagementSection) a deja ferme la
    // modale (retire publishingItem) -- ce composant est sur le point
    // d'etre demonte, rien de plus a faire ici (pas de setState apres coup).
  }

  return (
    <Modal onClose={onCancel} size="md">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-black">{isRepublish ? 'Republier sur Vinted' : 'Publier sur Vinted'}</h2>
          <p className="text-xs text-gray-500 mt-1">{listing.title}</p>
        </div>
        <button onClick={onCancel} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Republication assistee (2026-08-11) : jamais de coche ici -- ce
            n'est qu'une annonce de ce que ResellOS VA TENTER, pas encore une
            confirmation (voir PublishProgressModal pour l'etat des lieux reel,
            rapporte apres coup). Purement informatif, identique pour publier
            et republier.
            Texte corrige le 2026-08-27 (retour beta) : l'ancienne version
            annoncait categorie/etat/attributs "a choisir toi-meme sur
            Vinted" alors que vinted-publish.ts tente reellement de les
            preremplir (categorie, marque, taille, couleur, matiere, etat --
            voir attemptCategoryPrefill/attemptColorPrefill/etc.) depuis
            plusieurs semaines. Ce texte est une promesse GENERALE avant
            tentative (ecran de confirmation, pas de resultat encore connu) --
            le vrai bilan champ par champ (confirme/a completer) arrive apres
            coup dans PublishProgressModal, jamais ici.
            Derniere phrase reformulee (2026-08-29, positionnement "bouclier
            anti-bannissement") : le fait etait deja correct ("c'est toujours
            toi qui cliques"), seul le cadrage manquait -- ce n'est pas une
            limite qu'on subit, c'est une protection deliberee contre les
            controles anti-bot Vinted qui ciblent les outils 100%
            automatiques (voir l'analyse concurrentielle de ce round). */}
        <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">
            ResellOS ouvre Vinted et tente de préremplir titre, description, prix, photos, catégorie, marque, taille,
            couleur et état. Si un champ ne peut pas être prérempli automatiquement, tu devras le compléter
            toi-même sur Vinted. Et c'est volontaire : c'est toujours toi qui cliques sur le bouton final, jamais
            ResellOS à ta place — la meilleure protection contre un compte signalé pour activité suspecte.
          </p>
        </div>
        {isRepublish && (
          <div className="flex items-start gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Cette annonce a déjà été publiée mais n'est plus en ligne sur Vinted (masquée, supprimée ou introuvable).
              Une <strong>nouvelle</strong> fiche Vinted va être créée avec ces informations — l'ancienne n'est jamais
              modifiée ni supprimée.
            </p>
          </div>
        )}
        {listing.image_urls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {listing.image_urls.slice(0, 5).map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-gray-200 flex-shrink-0"
              />
            ))}
          </div>
        )}

        <div className="bg-dark-400 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
          <Row label="Prix" value={formatEUR(listing.price)} />
          <Row label="Catégorie" value={listing.category || '—'} />
          <Row label="Marque" value={listing.brand || '—'} />
          <Row label="Taille" value={listing.size || '—'} />
          <Row label="État" value={listing.condition || '—'} />
          <div className="flex items-center justify-between pt-1">
            <span className="text-gray-500">Compte Vinted</span>
            <span className="flex items-center gap-2 font-semibold text-gray-800">
              <AccountAvatar label={account.label} size="sm" />
              {account.label}
            </span>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-2">
            <Package className="w-3 h-3" /> Taille du colis
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PACKAGE_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPackageSize(option.value)}
                title={option.hint}
                className={`text-xs font-semibold py-2.5 rounded-xl border transition-all ${
                  packageSize === option.value
                    ? 'bg-neon-600 text-white border-neon-500'
                    : 'bg-dark-400 text-gray-500 border-gray-200 hover:border-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {showScheduleChoice && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-2">
              <CalendarClock className="w-3 h-3" /> Quand ?
            </label>
            <SegmentedControl
              options={[
                { value: 'now' as const, label: 'Maintenant' },
                { value: 'scheduled' as const, label: 'Programmer' },
              ]}
              value={scheduleMode}
              onChange={setScheduleMode}
              fullWidth
            />
          </div>
        )}

        {showScheduleChoice && scheduleMode === 'scheduled' ? (
          <div className="space-y-3">
            <DatePicker value={scheduleDate} onChange={setScheduleDate} />
            {scheduleDate && <TimePicker value={scheduleTime} onChange={setScheduleTime} />}
            {scheduleTimeInPast && (
              <p className="text-xs text-amber-400">Choisis une heure à venir — celle-ci est déjà passée aujourd'hui.</p>
            )}
            {scheduleValid && scheduleDate && scheduleTime && (
              <p className="text-xs text-gray-500">→ Republication programmée le {formatScheduleLabel(scheduleDate, scheduleTime)}</p>
            )}
            {scheduleError && (
              <p className="text-xs text-red-700" role="alert">
                {scheduleError}
              </p>
            )}
            {/* Etat desactive : fond neutre + texte gris (6.87:1) au lieu de
                `opacity-40` sur un bouton violet a texte blanc, qui delavait
                les DEUX couches et tombait a 1.29:1 — le libelle etait
                illisible au moment precis ou il explique quoi faire. */}
            <button
              disabled={!scheduleValid || scheduleSubmitting}
              onClick={handleScheduleSubmit}
              className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 transition-all disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed disabled:hover:bg-gray-100"
            >
              {scheduleSubmitting ? 'Programmation...' : 'Programmer la republication'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onConfirm(packageSize)}
            className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 transition-all"
          >
            {isRepublish ? 'Republier' : 'Publier'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}
