import { useGenerator } from '../../contexts/GeneratorContext';
import type { DashboardPage } from '../../lib/types';
import { UploadStep } from './generator/UploadStep';
import { LoadingStep } from './generator/LoadingStep';
import { ResultStep } from './generator/ResultStep';
import { EditStep } from './generator/EditStep';
import { GeneratorStepper } from './generator/GeneratorStepper';

interface GeneratorPageProps {
  onNavigate: (page: DashboardPage) => void;
}

// Pure vue sur GeneratorContext (2026-08-31, generation en arriere-plan) :
// tout l'etat/la logique vivait ici auparavant, deplace dans
// GeneratorContext.tsx (monte une seule fois au niveau du dashboard, voir
// App.tsx) pour survivre a un changement de page -- ce composant ne fait
// plus que lire le contexte et brancher les 4 etapes visuelles, exactement
// comme avant dans sa structure JSX.
export default function GeneratorPage({ onNavigate }: GeneratorPageProps) {
  const {
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
    credits,
    limit,
    unlimitedCredits,
    photoLimit,
    isLimitReached,
    handleGenerate,
    handleSave,
    handleEditFormChange,
    resetAll,
  } = useGenerator();

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
