import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, ExternalLink, Check, Info } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FavouritesFollowUp } from './communication/FavouritesFollowUp';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { useMessageTemplates, type MessageTemplateInput } from '../../hooks/useMessageTemplates';
import { resolveMessageTemplate, MESSAGE_TEMPLATE_VARIABLES } from '../../lib/messageTemplate';
import type { MessageTemplate } from '../../lib/types';

// Chantier Communication, reprise 2026-08-08 (voir AUDIT_SUIVI_COMMUNICATION.md
// + le diagnostic livre avant ce code) -- perimetre volontairement etroit,
// tel que decide : modeles de message que l'utilisateur ecrit lui-meme,
// resolution de variables reelles (jamais inventees, voir
// src/lib/messageTemplate.ts), et un lien "Ouvrir sur Vinted" vers
// l'annonce concernee. Aucune automatisation : ni extraction de
// destinataire (l'API wardrobe Vinted ne retourne qu'un compteur de
// favoris, jamais une identite), ni envoi (aucun content script Vinted ne
// touche l'inbox/une conversation/une offre -- construire ca necessiterait
// une phase d'exploration DOM/reseau dediee, hors perimetre ici). Chaque
// envoi reste un copier-coller manuel de l'utilisateur sur Vinted.

interface ListingOption {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  price: number;
  vinted_url: string | null;
  // Ajoute pour la section Relance favoris (2026-08-26) -- deja synchronise
  // par l'extension, aucune nouvelle collecte cote ResellOS.
  favourites: number | null;
}

// Fermeture P0 #9 (audit pre-lancement 2026-07-10) : `error` etait jusqu'ici
// ignore ({ data } seul destructure) -- un vrai echec reseau/requete
// retombait silencieusement sur `data ?? []`, indiscernable de "aucune
// annonce eligible". FavouritesFollowUp.tsx affichait alors son EmptyState
// ("Aucun favori à relancer") meme en cas d'erreur reelle, jamais un
// message d'erreur -- exactement le defaut signale par l'audit.
function useListingOptions() {
  const { user } = useAuth();
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    (async () => {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('listings')
        .select('id, title, brand, category, size, price, vinted_url, favourites')
        .eq('user_id', user.id)
        .not('vinted_item_id', 'is', null)
        .or('vinted_status.neq.deleted,vinted_status.is.null')
        .order('title');
      if (!ignore) {
        if (loadError) {
          console.error(loadError);
          setError('Impossible de charger tes annonces. Réessaie plus tard.');
        } else {
          setError(null);
          setListings((data ?? []) as ListingOption[]);
        }
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [user]);

  return { listings, loading, error };
}

// Retour bêta-testeur reel (Albin, 2026-08-11, retour 3) : "message aux
// favoris" -- Vinted n'exposant jamais l'identite d'un favori (voir
// commentaire d'en-tete ci-dessus), la seule reponse sure est d'aider a
// PREPARER ce message plus vite, pas de le declencher automatiquement.
// Ces 2 modeles de depart reutilisent uniquement les variables existantes
// (aucune nouvelle donnee, aucun acces reseau) et pre-remplissent le
// formulaire de creation habituel -- l'utilisateur reste libre de les
// modifier ou de les ignorer completement.
const STARTER_TEMPLATES: { name: string; body: string }[] = [
  {
    name: 'Relance favoris',
    body: "Bonjour ! {titre} a l'air de t'intéresser, il est toujours disponible à {prix}. N'hésite pas si tu as des questions 🙂",
  },
  {
    name: 'Baisse de prix',
    body: 'Bonjour, je viens de baisser le prix de {titre} à {prix}. Ça peut t\'intéresser !',
  },
];

// ZERO-FRICTION (2026-08-28) : tant que l'utilisateur n'a cree AUCUN modele
// personnel, le bloc "Aucun modèle pour l'instant" ne rendait rien
// exploitable -- il fallait d'abord creer un modele avant de pouvoir
// preparer le moindre message. Le premier modele de depart (deja ecrit et
// deja teste comme "idee de modele") devient desormais le modele EFFECTIF
// par defaut : la page (et la relance favoris) reste immediatement
// utilisable, sans jamais pretendre que l'utilisateur l'a lui-meme cree
// (etiquete "Par defaut" partout ou il apparait, jamais confondu avec un
// vrai modele personnel). Des qu'un premier modele reel est cree, ce
// fallback silencieux disparait -- l'utilisateur doit alors choisir
// explicitement, jamais de bascule invisible entre deux sources differentes.
const DEFAULT_TEMPLATE_ID = '__default__';
const DEFAULT_TEMPLATE = STARTER_TEMPLATES[0];

function TemplateFormModal({
  initial,
  prefill,
  onClose,
  onSave,
}: {
  initial: MessageTemplate | null;
  prefill?: { name: string; body: string } | null;
  onClose: () => void;
  onSave: (input: MessageTemplateInput) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial?.name ?? prefill?.name ?? '');
  const [body, setBody] = useState(initial?.body ?? prefill?.body ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    const ok = await onSave({ name: name.trim(), body: body.trim() });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal onClose={onClose} size="md">
      <h2 className="text-lg font-black mb-5">{initial ? 'Modifier le modèle' : 'Nouveau modèle de message'}</h2>
      <div className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Nom du modèle</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Baisse de prix"
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Texte du message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Bonjour, {titre} est maintenant à {prix} !"
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 resize-none"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {MESSAGE_TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => setBody((b) => `${b}${v.token}`)}
                title={v.description}
                className="text-[11px] font-mono px-2 py-1 rounded-md bg-gray-100 text-gray-500 hover:text-neon-600 hover:bg-neon-500/10 transition-colors"
              >
                {v.token}
              </button>
            ))}
          </div>
        </div>
        <Button fullWidth loading={saving} disabled={!name.trim() || !body.trim()} onClick={handleSubmit}>
          {saving ? 'Enregistrement...' : initial ? 'Enregistrer' : 'Créer le modèle'}
        </Button>
      </div>
    </Modal>
  );
}

export default function CommunicationPage() {
  const { templates, loading: templatesLoading, error, createTemplate, updateTemplate, deleteTemplate } =
    useMessageTemplates();
  const { showToast } = useToast();
  const { listings, loading: listingsLoading, error: listingsError } = useListingOptions();

  const [formTemplate, setFormTemplate] = useState<MessageTemplate | 'new' | null>(null);
  const [formPrefill, setFormPrefill] = useState<{ name: string; body: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [selectedListingId, setSelectedListingId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [editedText, setEditedText] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedListing = listings.find((l) => l.id === selectedListingId) ?? null;
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const hasCustomTemplates = templates.length > 0;
  // Modele EFFECTIF : le vrai modele choisi, sinon le modele par defaut
  // UNIQUEMENT si l'utilisateur n'a encore cree aucun modele personnel (voir
  // le commentaire de DEFAULT_TEMPLATE_ID ci-dessus) -- jamais de fallback
  // silencieux des qu'un premier modele reel existe.
  const isDefaultActive = !hasCustomTemplates && (selectedTemplateId === '' || selectedTemplateId === DEFAULT_TEMPLATE_ID);
  const effectiveTemplate = selectedTemplate ?? (isDefaultActive ? DEFAULT_TEMPLATE : null);
  const effectiveTemplateId = selectedTemplateId || (isDefaultActive ? DEFAULT_TEMPLATE_ID : '');

  const resolvedText = useMemo(() => {
    if (!effectiveTemplate || !selectedListing) return '';
    return resolveMessageTemplate(effectiveTemplate.body, selectedListing);
  }, [effectiveTemplate, selectedListing]);

  useEffect(() => {
    setEditedText(resolvedText);
    setCopied(false);
  }, [resolvedText]);

  async function handleCopy() {
    if (!editedText) return;
    await navigator.clipboard.writeText(editedText);
    setCopied(true);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Communication"
        description="Prépare un message à partir d'un modèle et d'une annonce réelle — l'envoi reste toujours manuel, sur Vinted."
        action={
          <Button variant="outline" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormPrefill(null); setFormTemplate('new'); }}>
            Nouveau modèle
          </Button>
        }
      />

      {error && <ErrorBanner message={error} className="mb-6" />}
      {listingsError && <ErrorBanner message={listingsError} className="mb-6" />}

      {/* `items-start` : sans lui, les deux colonnes s'etirent a la hauteur de
          la plus haute. Le panneau de droite n'a rien a montrer tant qu'aucune
          annonce ni modele ne sont choisis, et se retrouvait etire sur ~200 px
          de blanc. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
        <div className="bg-surface border border-gray-200 rounded-2xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-4">Tes modèles</p>
          {templatesLoading ? (
            <div className="space-y-2">
              <Skeleton shape="block" className="h-14" />
              <Skeleton shape="block" className="h-14" />
            </div>
          ) : templates.length === 0 ? (
            // ZERO-FRICTION (2026-08-28) : plus d'etat vide qui bloque tout
            // -- le modele par defaut est deja actif (voir DEFAULT_TEMPLATE_ID
            // plus haut), affiche ici comme tel ("Par defaut", jamais
            // confondu avec un modele reellement cree par l'utilisateur).
            // "Personnaliser" ouvre le formulaire habituel PRE-REMPLI avec
            // son contenu -- l'enregistrer le transforme en vrai modele
            // personnel, meme mecanisme que les chips "Idees de modeles"
            // plus bas.
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{DEFAULT_TEMPLATE.name}</p>
                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      Par défaut
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{DEFAULT_TEMPLATE.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setFormPrefill(DEFAULT_TEMPLATE); setFormTemplate('new'); }}
                  aria-label="Personnaliser"
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex-shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-gray-500 px-1">
                Ce modèle par défaut est déjà actif ci-contre — personnalise-le ou crée le tien.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                    selectedTemplateId === t.id ? 'border-neon-500/50 bg-neon-500/5' : 'border-gray-200 hover:border-gray-200'
                  }`}
                >
                  <button type="button" onClick={() => setSelectedTemplateId(t.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-gray-800 truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{t.body}</p>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { setFormPrefill(null); setFormTemplate(t); }}
                      aria-label="Modifier"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(t.id)}
                      aria-label="Supprimer"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">Idées de modèles</p>
            <div className="flex flex-wrap gap-2">
              {/* Le premier modele de depart est deja affiche ci-dessus comme
                  modele PAR DEFAUT tant qu'aucun modele personnel n'existe --
                  le reproposer ici serait redondant. Des qu'un modele reel
                  existe, les deux idees redeviennent utiles a egalite. */}
              {(hasCustomTemplates ? STARTER_TEMPLATES : STARTER_TEMPLATES.slice(1)).map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => { setFormPrefill(s); setFormTemplate('new'); }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-neon-600 hover:border-neon-500/30 transition-colors"
                >
                  + {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-gray-200 rounded-2xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-4">Préparer un message</p>

          {listingsLoading ? (
            <Skeleton shape="block" className="h-11 mb-3" />
          ) : listings.length === 0 ? (
            <p className="text-xs text-gray-500">Aucune annonce publiée sur Vinted pour l'instant.</p>
          ) : (
            <select
              value={selectedListingId}
              onChange={(e) => setSelectedListingId(e.target.value)}
              className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 mb-3"
            >
              <option value="">Choisir une annonce...</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          )}

          <select
            value={effectiveTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value === DEFAULT_TEMPLATE_ID ? '' : e.target.value)}
            className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 mb-3"
          >
            {/* "" reste la valeur neutre : tant qu'aucun modele personnel
                n'existe, elle EST le defaut (il n'y a rien d'autre a
                proposer comme repli) -- des qu'un modele reel existe, elle
                redevient un vrai "aucun choix", voir isDefaultActive. */}
            <option value="">Choisir un modèle...</option>
            {!hasCustomTemplates && <option value={DEFAULT_TEMPLATE_ID}>{DEFAULT_TEMPLATE.name} (par défaut)</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {selectedListing && effectiveTemplate ? (
            <>
              <textarea
                value={editedText}
                onChange={(e) => {
                  setEditedText(e.target.value);
                  setCopied(false);
                }}
                rows={5}
                className="w-full bg-dark-400 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 resize-none mb-3"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  onClick={handleCopy}
                >
                  {copied ? 'Copié' : 'Copier le texte'}
                </Button>
                {selectedListing.vinted_url ? (
                  <a
                    href={selectedListing.vinted_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-neon-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-neon-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ouvrir sur Vinted
                  </a>
                ) : (
                  <Button variant="secondary" size="sm" fullWidth disabled>
                    Lien Vinted indisponible
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500">Choisis une annonce et un modèle pour préparer ton message.</p>
          )}
        </div>
      </div>

      {/* RELANCE FAVORIS ASSISTEE (2026-08-26).
          Pleine largeur, sous les deux panneaux : c'est une liste de travail,
          pas un reglage. Elle depend du modele choisi dans le panneau de
          droite, d'ou sa position juste en dessous. */}
      <div className="bg-surface border border-gray-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Relance favoris</p>
          <p className="text-[11px] text-gray-500">Préparé ici · envoyé par toi sur Vinted</p>
        </div>
        <FavouritesFollowUp
          listings={listings}
          loading={listingsLoading}
          templateBody={effectiveTemplate?.body ?? null}
          templateName={effectiveTemplate?.name ?? null}
        />
      </div>

      <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4">
        <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-gray-700 font-medium">Toujours manuel.</span> ResellOS ne connaît jamais l'identité
          des acheteurs intéressés (Vinted ne fournit qu'un nombre de favoris, pas de liste) et n'envoie rien à ta
          place — la relance favoris te dit quelles annonces méritent un message et le prépare, mais c'est toi qui le
          copies et l'envoies sur Vinted.
        </p>
      </div>

      {formTemplate && (
        <TemplateFormModal
          initial={formTemplate === 'new' ? null : formTemplate}
          prefill={formTemplate === 'new' ? formPrefill : null}
          onClose={() => { setFormTemplate(null); setFormPrefill(null); }}
          onSave={async (input) => {
            const ok =
              formTemplate === 'new' ? await createTemplate(input) : await updateTemplate(formTemplate.id, input);
            if (ok) showToast(formTemplate === 'new' ? 'Modèle créé !' : 'Modèle mis à jour !', 'success');
            return ok;
          }}
        />
      )}

      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} size="sm">
          <h2 className="text-lg font-black mb-2">Supprimer ce modèle ?</h2>
          <p className="text-sm text-gray-500 mb-5">Cette action est irréversible.</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" fullWidth onClick={() => setConfirmDeleteId(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={async () => {
                const id = confirmDeleteId;
                setConfirmDeleteId(null);
                if (selectedTemplateId === id) setSelectedTemplateId('');
                const ok = await deleteTemplate(id);
                if (ok) showToast('Modèle supprimé.', 'success');
              }}
            >
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
