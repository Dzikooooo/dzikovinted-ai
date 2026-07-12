import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { analyzeWithAI } from '../../lib/aiService';
import { uploadListingPhotos } from '../../lib/storage';
import type { GeneratedListing } from '../../lib/types';
import { PLAN_LIMITS, PLAN_PHOTO_LIMITS } from '../../lib/types';
import { UploadStep } from './generator/UploadStep';
import { LoadingStep } from './generator/LoadingStep';
import { ResultStep } from './generator/ResultStep';
import { EditStep } from './generator/EditStep';

type GenStep = 'upload' | 'loading' | 'result' | 'edit';

export default function GeneratorPage() {
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
  const { user, profile, refreshProfile } = useAuth();

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
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue';
      console.error('Generation failed:', msg);
      setError(msg);
      setStep('upload');
    }
  };

  const handleSave = async () => {
    if (!editForm || !user) return;
    setSaving(true);
    setError(null);
    try {
      const durableImageUrls = await uploadListingPhotos(user.id, images);
      const { error: insertError } = await supabase.from('listings').insert({
        user_id: user.id,
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
        image_urls: durableImageUrls,
      });
      if (insertError) {
        console.error('Listing save error:', insertError);
        setError('Erreur lors de la sauvegarde: ' + insertError.message);
      } else {
        setSaved(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'envoi des photos';
      console.error('Photo upload error:', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setImages([]);
    setResult(null);
    setEditForm(null);
    setSaved(false);
    setError(null);
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
      />
    );
  }

  if (step === 'edit' && editForm) {
    return (
      <EditStep
        editForm={editForm}
        onChange={setEditForm}
        onBack={() => setStep('result')}
        onReset={() => result && setEditForm({ ...result })}
        onSaveAndReturn={async () => {
          if (result) setResult({ ...editForm });
          await handleSave();
          setStep('result');
        }}
      />
    );
  }

  return null;
}
