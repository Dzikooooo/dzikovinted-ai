import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { analyzeWithAI } from '../../lib/aiService';
import { uploadListingPhotos } from '../../lib/storage';
import { translateGeneratorError } from '../../lib/errorMessages';
import type { DashboardPage, GeneratedListing } from '../../lib/types';
import { PLAN_LIMITS, PLAN_PHOTO_LIMITS } from '../../lib/types';
import { UploadStep } from './generator/UploadStep';
import { LoadingStep } from './generator/LoadingStep';
import { ResultStep } from './generator/ResultStep';
import { EditStep } from './generator/EditStep';

type GenStep = 'upload' | 'loading' | 'result' | 'edit';

interface GeneratorPageProps {
  onNavigate: (page: DashboardPage) => void;
  onBusyChange: (busy: boolean) => void;
}

export default function GeneratorPage({ onNavigate, onBusyChange }: GeneratorPageProps) {
  const [step, setStep] = useState<GenStep>('upload');
  const [images, setImages] = useState<string[]>([]);
  // Reglages non encore branches cote backend (voir UploadStep.tsx) --
  // valeurs fixes plutot que du state editable tant qu'ils n'ont aucun
  // effet reel sur la generation.
  const photoStyle = 'white';
  const enhancePhoto = true;
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<GeneratedListing | null>(null);
  const [editForm, setEditForm] = useState<GeneratedListing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
  const isAdmin = profile?.role === 'admin';
  const limit = isAdmin ? null : PLAN_LIMITS[plan];
  // Un admin beneficie du meme plafond photo que le plan Pro -- coherent
  // avec le traitement deja applique aux credits (illimite = "au moins
  // aussi bien que Pro", pas un plan a part avec ses propres regles).
  const photoLimit = isAdmin ? PLAN_PHOTO_LIMITS.pro : PLAN_PHOTO_LIMITS[plan];
  const isLimitReached = limit !== null && credits <= 0;

  const handleGenerate = async () => {
    if (isLimitReached) {
      setError('Tu as atteint ta limite de credits. Passe au plan Pro pour continuer.');
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
      });
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

  const handleSave = async () => {
    if (!editForm || !user) return;
    setSaving(true);
    setError(null);
    try {
      const imageUrls = durableImageUrls ?? (await uploadListingPhotos(user.id, images));
      if (!durableImageUrls) setDurableImageUrls(imageUrls);

      const fields = {
        title: editForm.title,
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
      };

      if (savedListingId) {
        const { error: updateError } = await supabase
          .from('listings')
          .update(fields)
          .eq('id', savedListingId);
        if (updateError) {
          console.error('Listing update error:', updateError);
          setError(translateGeneratorError(updateError.message));
          return;
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
          return;
        }
        setSavedListingId(data.id);
      }
      setSaved(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Erreur lors de l\'envoi des photos';
      console.error('Photo upload error:', raw);
      setError(translateGeneratorError(raw));
    } finally {
      setSaving(false);
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
  };

  const resetAll = () => {
    setStep('upload');
    setImages([]);
    setResult(null);
    setEditForm(null);
    setSaved(false);
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
        isAdmin={isAdmin}
        onGenerate={handleGenerate}
      />
    );
  }

  if (step === 'loading') {
    return <LoadingStep loadingStep={loadingStep} />;
  }

  if (step === 'result' && result) {
    return (
      <ResultStep
        result={result}
        images={images}
        error={error}
        onReset={resetAll}
        onEdit={() => setStep('edit')}
        onSave={handleSave}
        saving={saving}
        saved={saved}
        onGoToStock={() => onNavigate('stock')}
        onCreateNew={resetAll}
      />
    );
  }

  if (step === 'edit' && editForm) {
    return (
      <EditStep
        editForm={editForm}
        onChange={handleEditFormChange}
        onBack={() => setStep('result')}
        onReset={() => result && setEditForm({ ...result })}
        onSaveAndReturn={async () => {
          if (saving) return;
          if (result) setResult({ ...editForm });
          await handleSave();
          setStep('result');
        }}
        saving={saving}
      />
    );
  }

  return null;
}
