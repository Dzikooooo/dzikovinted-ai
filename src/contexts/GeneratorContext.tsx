import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { supabase } from '../lib/supabase';
import { analyzeWithAI } from '../lib/aiService';
import { uploadListingPhotos } from '../lib/storage';
import { stripSkuSuffix } from '../lib/sku';
import { translateGeneratorError } from '../lib/errorMessages';
import type { BackgroundStyle, GeneratedListing } from '../lib/types';
import { PLAN_LIMITS, PLAN_PHOTO_LIMITS } from '../lib/types';

// Generation en arriere-plan (2026-08-31, demande produit) : cet etat
// vivait jusqu'ici dans GeneratorPage.tsx lui-meme, demonte des que
// activePage quitte 'generator' (DashboardLayout.tsx rend les pages
// conditionnellement sous une div `key={activePage}`) -- une generation en
// cours ou un resultat pas encore sauvegarde etait donc REELLEMENT perdu en
// quittant l'ecran, d'ou l'ancienne modale de confirmation "Quitter le
// Generateur ?" qui bloquait la navigation. Deplace ici, monte UNE SEULE
// FOIS au niveau du dashboard (App.tsx, autour de <DashboardLayout>) donc
// hors de tout demontage lie a activePage : l'utilisateur peut desormais
// naviguer librement pendant qu'une generation tourne, le resultat
// l'attend quel que soit l'ecran ou il revient. La garde de navigation
// devient inutile POUR LA NAVIGATION INTERNE et est retiree ; seule la
// deconnexion (qui detruit la session React entiere) et beforeunload
// (fermeture reelle de l'onglet) restent proteges -- voir DashboardLayout.tsx
// et l'effet beforeunload plus bas.
export type GenStep = 'upload' | 'loading' | 'result' | 'edit';

// Pour le badge de statut sur l'item de nav "Generateur IA" (visible depuis
// n'importe quelle page du dashboard) -- derive de `step`/`saved`, jamais un
// second etat parallele a synchroniser a la main.
export type GeneratorStatus = 'idle' | 'generating' | 'done';

interface GeneratorContextValue {
  step: GenStep;
  setStep: (step: GenStep) => void;
  images: string[];
  setImages: (images: string[]) => void;
  backgroundStyle: BackgroundStyle;
  setBackgroundStyle: (style: BackgroundStyle) => void;
  loadingStep: number;
  result: GeneratedListing | null;
  setResult: (result: GeneratedListing | null) => void;
  editForm: GeneratedListing | null;
  setEditForm: (form: GeneratedListing) => void;
  saving: boolean;
  saved: boolean;
  savedAsPending: boolean;
  savingPending: boolean;
  error: string | null;
  plan: string;
  credits: number;
  limit: number | null;
  unlimitedCredits: boolean;
  photoLimit: number;
  isLimitReached: boolean;
  busy: boolean;
  status: GeneratorStatus;
  handleGenerate: () => Promise<void>;
  handleSave: (asPending?: boolean) => Promise<boolean>;
  handleEditFormChange: (updated: GeneratedListing) => void;
  resetAll: () => void;
}

const GeneratorContext = createContext<GeneratorContextValue | null>(null);

export function GeneratorProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<GenStep>('upload');
  const [images, setImages] = useState<string[]>([]);
  // photo_style/enhance_photo restent des reglages fixes, jamais branches a
  // une UI -- contrairement a backgroundStyle ci-dessous, c'est le seul des
  // deux qui produit un vrai effet (edition reelle de la photo, voir
  // analyze-clothing/backgroundStyles.ts).
  const photoStyle = 'white';
  const enhancePhoto = true;
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('original');
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<GeneratedListing | null>(null);
  const [editForm, setEditForm] = useState<GeneratedListing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // "En attente" : distingue laquelle des deux actions a produit l'etat
  // `saved` actuel, pour afficher le bon libelle de confirmation cote
  // ResultStep.tsx sans dupliquer saved/saving.
  const [savedAsPending, setSavedAsPending] = useState(false);
  const [savingPending, setSavingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cible de la mise a jour (update) plutot que d'une nouvelle insertion une
  // fois le premier enregistrement reussi -- evite la creation d'un doublon
  // si l'utilisateur modifie puis re-sauvegarde la meme annonce.
  const [savedListingId, setSavedListingId] = useState<string | null>(null);
  // URLs definitives (Supabase Storage) obtenues au premier upload --
  // reutilisees telles quelles sur les sauvegardes suivantes plutot que de
  // re-uploader les memes photos sources.
  const [durableImageUrls, setDurableImageUrls] = useState<string[] | null>(null);
  const { user, profile, refreshProfile } = useAuth();

  // Un credit est deja reserve cote serveur des le lancement de l'analyse
  // (voir analyze-clothing) ; tant que le resultat n'est pas sauvegarde,
  // fermer reellement l'onglet le perdrait silencieusement -- inchange,
  // seule la navigation INTERNE au dashboard n'est plus concernee (voir
  // commentaire d'en-tete).
  const status: GeneratorStatus =
    step === 'loading' ? 'generating' : (step === 'result' || step === 'edit') && !saved ? 'done' : 'idle';
  const busy = status !== 'idle';

  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

  const plan = profile?.plan ?? 'free';
  const credits = profile?.credits ?? 0;
  const isAdmin = useIsAdmin();
  // Programme Beta ResellOS : credits_mode='unlimited' suspend la limite de
  // credits comme un admin, sans toucher au plafond de photos (photoLimit
  // reste lie au plan/role admin uniquement -- hors perimetre de l'avantage
  // credits_mode).
  const unlimitedCredits = isAdmin || profile?.credits_mode === 'unlimited';
  const limit = unlimitedCredits ? null : PLAN_LIMITS[plan];
  const photoLimit = unlimitedCredits ? PLAN_PHOTO_LIMITS.pro : PLAN_PHOTO_LIMITS[plan];
  const isLimitReached = limit !== null && credits <= 0;

  const handleGenerate = async () => {
    if (isLimitReached) {
      setError('Tu as atteint ta limite de crédits. Passe au plan Pro pour continuer.');
      return;
    }

    setError(null);
    setStep('loading');
    setLoadingStep(0);

    const intervals = [0, 800, 1600, 2400];
    intervals.forEach((delay, i) => setTimeout(() => setLoadingStep(i), delay));

    try {
      const openaiKey = localStorage.getItem('dzikovinted_openai_key') || undefined;
      const generated = await analyzeWithAI({
        imageUrls: images,
        photoStyle,
        enhancePhoto,
        geminiKey: openaiKey,
        backgroundStyle,
      });
      // Fond de photo genere : remplace les photos LOCALES par les versions
      // reellement editees des que le serveur en renvoie -- ResultStep/
      // EditStep (via `images`) et la sauvegarde (uploadListingPhotos,
      // handleSave ci-dessous) utilisent alors directement ces nouvelles
      // photos, jamais les originales.
      if (generated.edited_image_urls && generated.edited_image_urls.length > 0) {
        setImages(generated.edited_image_urls);
      }
      setResult(generated);
      setEditForm({ ...generated });
      setStep('result');

      // Le debit du credit et l'incrementation du compteur d'usage sont
      // geres cote serveur par la fonction Edge analyze-clothing (reservation
      // atomique avant l'appel Gemini, remboursement si echec) -- le client
      // ne fait que rafraichir le solde affiche.
      if (user) await refreshProfile();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Une erreur est survenue';
      console.error('Generation failed:', raw);
      setError(translateGeneratorError(raw));
      setStep('upload');
    }
  };

  // asPending ("En attente") : true uniquement quand l'utilisateur choisit
  // explicitement "Enregistrer en attente" -- ecrit status='en_attente' a
  // l'insertion. Sur une mise a jour (savedListingId deja pose), `status` ne
  // fait PAS partie de `fields` par defaut : omettre la cle dans un
  // .update() Supabase laisse la valeur existante intacte, jamais ecrasee
  // silencieusement. asPending force malgre tout la cle sur l'UPDATE aussi :
  // re-cliquer "Enregistrer en attente" apres un premier passage doit rester
  // coherent avec ce qu'il affiche.
  //
  // Retourne le succes (true/false) -- necessaire pour onSaveAndReturn
  // (GeneratorPage.tsx), qui doit savoir si le flash de validation sur la
  // fleche Categorie (EditStep.tsx) a un sens avant de naviguer. ResultStep.tsx
  // continue d'appeler cette fonction sans lire son retour.
  const handleSave = async (asPending = false): Promise<boolean> => {
    if (!editForm || !user) return false;
    if (asPending) setSavingPending(true);
    else setSaving(true);
    setError(null);
    try {
      const imageUrls = durableImageUrls ?? (await uploadListingPhotos(user.id, images));
      if (!durableImageUrls) setDurableImageUrls(imageUrls);

      const fields = {
        // stripSkuSuffix : rien n'empeche l'utilisateur de taper lui-meme un
        // "#N" dans ce champ -- le titre stocke doit rester propre, le sku
        // vient toujours de listings.sku, jamais du texte.
        title: stripSkuSuffix(editForm.title),
        description: editForm.description,
        brand: editForm.brand,
        category: editForm.category,
        color: editForm.color,
        size: editForm.size,
        material: editForm.material,
        condition: editForm.condition,
        price: editForm.price,
        quick_price: editForm.quick_price,
        premium_price: editForm.premium_price,
        keywords: editForm.keywords,
        vinted_filters: editForm.vinted_filters,
        image_urls: imageUrls,
        ...(asPending ? { status: 'en_attente' as const } : {}),
      };

      if (savedListingId) {
        const { error: updateError } = await supabase.from('listings').update(fields).eq('id', savedListingId);
        if (updateError) {
          console.error('Listing update error:', updateError);
          setError(translateGeneratorError(updateError.message));
          return false;
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('listings')
          .insert({ user_id: user.id, ...fields })
          .select('id')
          .single();
        if (insertError) {
          console.error('Listing save error:', insertError);
          setError(translateGeneratorError(insertError.message));
          return false;
        }
        setSavedListingId(data.id);
      }
      setSaved(true);
      setSavedAsPending(asPending);
      return true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erreur lors de l'envoi des photos";
      console.error('Photo upload error:', raw);
      setError(translateGeneratorError(raw));
      return false;
    } finally {
      setSaving(false);
      setSavingPending(false);
    }
  };

  const handleEditFormChange = (updated: GeneratedListing) => {
    setEditForm(updated);
    // Le bouton de sauvegarde peut indiquer temporairement que les
    // modifications ont bien ete enregistrees, mais doit retrouver son
    // comportement normal des que de nouveaux changements sont effectues --
    // seul un vrai changement de champ via ce handler invalide l'etat
    // "sauvegarde", pas les autres interactions de l'ecran d'edition.
    setSaved(false);
    setSavedAsPending(false);
  };

  const resetAll = () => {
    setStep('upload');
    setImages([]);
    setResult(null);
    setEditForm(null);
    setSaved(false);
    setSavedAsPending(false);
    setError(null);
    setSavedListingId(null);
    setDurableImageUrls(null);
  };

  return (
    <GeneratorContext.Provider
      value={{
        step,
        setStep,
        images,
        setImages,
        backgroundStyle,
        setBackgroundStyle,
        loadingStep,
        result,
        setResult,
        editForm,
        setEditForm,
        saving,
        saved,
        savedAsPending,
        savingPending,
        error,
        plan,
        credits,
        limit,
        unlimitedCredits,
        photoLimit,
        isLimitReached,
        busy,
        status,
        handleGenerate,
        handleSave,
        handleEditFormChange,
        resetAll,
      }}
    >
      {children}
    </GeneratorContext.Provider>
  );
}

export function useGenerator() {
  const ctx = useContext(GeneratorContext);
  if (!ctx) throw new Error('useGenerator must be used within GeneratorProvider');
  return ctx;
}
