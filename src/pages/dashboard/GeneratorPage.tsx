import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { supabase } from '../../lib/supabase';
import { analyzeWithAI } from '../../lib/aiService';
import { uploadListingPhotos } from '../../lib/storage';
import { stripSkuSuffix } from '../../lib/sku';
import { translateGeneratorError } from '../../lib/errorMessages';
import type { BackgroundStyle, DashboardPage, GeneratedListing } from '../../lib/types';
import { PLAN_LIMITS, PLAN_PHOTO_LIMITS } from '../../lib/types';
import { UploadStep } from './generator/UploadStep';
import { LoadingStep } from './generator/LoadingStep';
import { ResultStep } from './generator/ResultStep';
import { EditStep } from './generator/EditStep';
import { GeneratorStepper } from './generator/GeneratorStepper';

type GenStep = 'upload' | 'loading' | 'result' | 'edit';

interface GeneratorPageProps {
  onNavigate: (page: DashboardPage) => void;
  onBusyChange: (busy: boolean) => void;
}

export default function GeneratorPage({ onNavigate, onBusyChange }: GeneratorPageProps) {
  const [step, setStep] = useState<GenStep>('upload');
  const [images, setImages] = useState<string[]>([]);
  // photo_style/enhance_photo restent des reglages fixes, jamais branches a
  // une UI -- contrairement a backgroundStyle ci-dessous (refonte
  // Generateur, 2026-08-30), c'est le seul des deux qui produit un vrai
  // effet (edition reelle de la photo, voir analyze-clothing/backgroundStyles.ts).
  const photoStyle = 'white';
  const enhancePhoto = true;
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('original');
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<GeneratedListing | null>(null);
  const [editForm, setEditForm] = useState<GeneratedListing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // "En attente" (2026-08-30) : distingue laquelle des deux actions a
  // produit l'etat `saved` actuel, pour afficher le bon libelle de
  // confirmation cote ResultStep.tsx sans dupliquer saved/saving.
  const [savedAsPending, setSavedAsPending] = useState(false);
  const [savingPending, setSavingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cible de la mise a jour (update) plutot que d'une nouvelle insertion
  // une fois le premier enregistrement reussi -- evite la creation d'un
  // doublon si l'utilisateur modifie puis re-sauvegarde la meme annonce
  // (bug confirme le 2026-07-24, audit du parcours Generateur).
  const [savedListingId, setSavedListingId] = useState<string | null>(null);
  // URLs definitives (Supabase Storage) obtenues au premier upload --
  // reutilisees telles quelles sur les sauvegardes suivantes plutot que
  // de re-uploader les memes photos sources, ce qui aurait orphelinise le
  // premier jeu de fichiers a chaque re-sauvegarde.
  const [durableImageUrls, setDurableImageUrls] = useState<string[] | null>(null);
  const { user, profile, refreshProfile } = useAuth();

  // Un credit est deja reserve cote serveur des le lancement de l'analyse
  // (voir analyze-clothing) ; tant que le resultat n'est pas sauvegarde,
  // quitter l'ecran (navigation ou fermeture d'onglet) le perdrait
  // silencieusement. DashboardLayout.tsx utilise ce signal pour confirmer
  // avant de changer de page ; l'ecouteur beforeunload ci-dessous couvre
  // le cas distinct du vrai rafraichissement/fermeture d'onglet.
  const busy = step === 'loading' || ((step === 'result' || step === 'edit') && !saved);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

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
  // Programme Beta ResellOS (Lot 4) : credits_mode='unlimited' suspend la
  // limite de credits comme un admin, sans toucher au plafond de photos
  // (photoLimit reste lie au plan/role admin uniquement -- hors perimetre
  // de l'avantage credits_mode).
  const unlimitedCredits = isAdmin || profile?.credits_mode === 'unlimited';
  const limit = unlimitedCredits ? null : PLAN_LIMITS[plan];
  // Un admin OU un compte credits_mode='unlimited' beneficie du meme plafond
  // photo que le plan Pro -- coherent avec le traitement deja applique aux
  // credits (illimite = "au moins aussi bien que Pro", pas un plan a part
  // avec ses propres regles). Revu 2026-08-11 (premier retour bêta-testeur
  // reel, Albin) : la version precedente limitait sciemment photoLimit au
  // seul plan/role admin, hors perimetre de credits_mode -- en pratique,
  // un bêta-testeur Free avec credits_mode='unlimited' restait bloque a 1
  // photo (PLAN_PHOTO_LIMITS.free) des sa premiere image, sans aucune
  // explication visible (voir UploadStep.tsx pour le message ajoute dans le
  // meme correctif). L'avantage bêta credits_mode='unlimited' est cense
  // donner une experience Pro complete, pas seulement des credits.
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
      // Fond de photo genere (2026-08-30) : remplace les photos LOCALES par
      // les versions reellement editees des que le serveur en renvoie --
      // ResultStep/EditStep (via `images`) et la sauvegarde (uploadListingPhotos,
      // handleSave ci-dessous) utilisent alors directement ces nouvelles
      // photos, jamais les originales. `durableImageUrls` reste `null` ici
      // (jamais pose avant ce point) : le premier upload ci-dessous portera
      // donc bien les photos editees, pas les originales deja affichees puis
      // remplacees.
      if (generated.edited_image_urls && generated.edited_image_urls.length > 0) {
        setImages(generated.edited_image_urls);
      }
      setResult(generated);
      setEditForm({ ...generated });
      setStep('result');

      // Le debit du credit et l'incrementation du compteur d'usage sont
      // desormais geres cote serveur par la fonction Edge analyze-clothing
      // (reservation atomique avant l'appel Gemini, remboursement si echec)
      // -- le client ne fait plus que rafraichir le solde affiche.
      if (user) await refreshProfile();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Une erreur est survenue';
      console.error('Generation failed:', raw);
      setError(translateGeneratorError(raw));
      setStep('upload');
    }
  };

  // asPending (2026-08-30, rubrique "En attente") : true uniquement quand
  // l'utilisateur choisit explicitement "Enregistrer en attente" -- ecrit
  // status='en_attente' a l'insertion. Sur une mise a jour (savedListingId
  // deja pose), `status` ne fait PAS partie de `fields` par defaut : omettre
  // la cle dans un .update() Supabase laisse la valeur existante intacte,
  // jamais ecrasee silencieusement -- une annonce deja publiee (status
  // 'en_stock') qu'on re-sauvegarde depuis l'ecran d'edition ne peut donc
  // jamais retomber en 'en_attente' par ce chemin. asPending force malgre
  // tout la cle sur l'UPDATE aussi : re-cliquer "Enregistrer en attente"
  // apres un premier passage doit rester coherent avec ce qu'il affiche.
  // Retourne desormais le succes (true/false) -- necessaire pour
  // onSaveAndReturn ci-dessous, qui doit savoir si le flash de validation
  // sur la fleche Categorie (EditStep.tsx) a un sens avant de naviguer.
  // ResultStep.tsx continue d'appeler cette fonction sans lire son retour,
  // comportement inchange pour lui.
  const handleSave = async (asPending = false): Promise<boolean> => {
    if (!editForm || !user) return false;
    if (asPending) setSavingPending(true);
    else setSaving(true);
    setError(null);
    try {
      const imageUrls = durableImageUrls ?? (await uploadListingPhotos(user.id, images));
      if (!durableImageUrls) setDurableImageUrls(imageUrls);

      const fields = {
        // stripSkuSuffix (2026-07-26, garde-fou saisie manuelle) : rien
        // n'empeche l'utilisateur de taper lui-meme un "#N" dans ce champ --
        // le titre stocke doit rester propre, le sku vient toujours de
        // listings.sku, jamais du texte (voir src/lib/sku.ts).
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
        const { error: updateError } = await supabase
          .from('listings')
          .update(fields)
          .eq('id', savedListingId);
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
      const raw = err instanceof Error ? err.message : 'Erreur lors de l\'envoi des photos';
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
    // comportement normal des que de nouveaux changements sont effectues
    // (decision produit validee le 2026-07-24) -- seul un vrai changement
    // de champ via ce handler invalide l'etat "sauvegarde", pas les autres
    // interactions de l'ecran d'edition (ex. ouvrir "Modifier" seul).
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

  if (step === 'upload') {
    return (
      <UploadStep
        images={images}
        onImagesChange={setImages}
        photoLimit={photoLimit}
        error={error}
        isLimitReached={isLimitReached}
        credits={credits}
        limit={limit}
        unlimitedCredits={unlimitedCredits}
        backgroundStyle={backgroundStyle}
        onBackgroundStyleChange={setBackgroundStyle}
        onGenerate={handleGenerate}
      />
    );
  }

  // Fil d'Ariane rendu ICI et non dans chaque etape : il doit apparaitre
  // UNIQUEMENT pendant un flux d'analyse en cours. L'etape 'upload' ci-dessus
  // en est donc volontairement exclue -- avant d'avoir lance quoi que ce soit,
  // il n'y a aucune progression a montrer.
  // LoadingStep n'a pas de conteneur propre : celui-ci lui en fournit un.
  if (step === 'loading') {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <GeneratorStepper current="analysis" className="mb-6" />
        <LoadingStep loadingStep={loadingStep} />
      </div>
    );
  }

  // ResultStep et EditStep portent DEJA leur propre `p-4 sm:p-6 lg:p-8` et
  // leur propre largeur max (4xl / 3xl) : le conteneur du fil d'Ariane ne
  // reprend donc que le padding HORIZONTAL et la meme largeur, sinon on
  // doublerait le padding et on contraindrait ResultStep a une largeur qui
  // n'est pas la sienne. Le `pt` de l'etape fournit l'ecart vertical.
  if (step === 'result' && result) {
    return (
      <>
        <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 max-w-4xl mx-auto">
          <GeneratorStepper current="listing" />
        </div>
        <ResultStep
          result={result}
          images={images}
          error={error}
          onReset={resetAll}
          onEdit={() => setStep('edit')}
          onSave={() => handleSave(false)}
          saving={saving}
          saved={saved && !savedAsPending}
          onSavePending={() => handleSave(true)}
          savingPending={savingPending}
          savedPending={saved && savedAsPending}
          onGoToStock={() => onNavigate('watchlist')}
          onCreateNew={resetAll}
        />
      </>
    );
  }

  if (step === 'edit' && editForm) {
    return (
      <>
        <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 max-w-3xl mx-auto">
          <GeneratorStepper current="listing" />
        </div>
        <EditStep
          editForm={editForm}
          onChange={handleEditFormChange}
          onBack={() => setStep('result')}
          onReset={() => result && setEditForm({ ...result })}
          onSaveAndReturn={async () => {
            if (saving) return;
            if (result) setResult({ ...editForm });
            const ok = await handleSave();
            // Laisse le temps au check de la fleche Categorie de se voir
            // (EditStep.tsx affiche son flash pendant 1400ms) avant de
            // demonter cet ecran -- sans ce delai, le check et la navigation
            // vers 'result' arriveraient dans le meme rendu et ne
            // s'afficherait jamais. Aucun delai sur un echec : rien a
            // montrer, autant revenir immediatement (comportement inchange).
            if (ok) await new Promise((resolve) => setTimeout(resolve, 700));
            setStep('result');
          }}
          saving={saving}
          saved={saved}
        />
      </>
    );
  }

  return null;
}
