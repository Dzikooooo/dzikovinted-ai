import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, GripVertical, ImageIcon, Plus, Sparkles, Upload, X, Zap } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { BackgroundStyle } from '../../../lib/types';

// Fond de photo genere (2026-08-30) : options exposees cote UI, memes cles
// que BACKGROUND_STYLES (supabase/functions/analyze-clothing/backgroundStyles.ts)
// -- 'original' n'existe QUE cote client (aucune edition demandee, jamais
// envoyee au serveur, voir aiService.ts).
const BACKGROUND_STYLE_OPTIONS: { value: BackgroundStyle; label: string }[] = [
  { value: 'original', label: 'Original (aucun changement)' },
  { value: 'blanc_studio', label: 'Blanc studio' },
  { value: 'lifestyle_neutre', label: 'Lifestyle neutre' },
  { value: 'beige_gres', label: 'Beige grès' },
  { value: 'marbre_clair', label: 'Marbre clair' },
];

interface UploadStepProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  photoLimit: number;
  error: string | null;
  isLimitReached: boolean;
  credits: number;
  limit: number | null;
  // Programme Beta ResellOS (Lot 4) : true pour un admin OU pour
  // credits_mode='unlimited' -- ce composant n'a besoin de savoir que "les
  // credits sont-ils a afficher comme illimites", jamais qui est
  // effectivement admin.
  unlimitedCredits: boolean;
  backgroundStyle: BackgroundStyle;
  onBackgroundStyleChange: (style: BackgroundStyle) => void;
  onGenerate: () => void;
}

export function UploadStep({
  images,
  onImagesChange,
  photoLimit,
  error,
  isLimitReached,
  credits,
  limit,
  unlimitedCredits,
  backgroundStyle,
  onBackgroundStyleChange,
  onGenerate,
}: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Fichiers rejetes silencieusement jusqu'ici (format non image, ou depassement
  // de photoLimit) -- l'utilisateur n'avait aucune indication que sa selection
  // avait ete partiellement ignoree (audit du parcours Generateur, 2026-07-24).
  const [warning, setWarning] = useState<string | null>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    const imageFiles = incoming.filter((f) => f.type.startsWith('image/'));
    const nonImageCount = incoming.length - imageFiles.length;
    const availableSlots = Math.max(0, photoLimit - images.length);
    const accepted = imageFiles.slice(0, availableSlots);
    const excessCount = imageFiles.length - accepted.length;

    const messages: string[] = [];
    if (nonImageCount > 0) {
      messages.push(`${nonImageCount} fichier${nonImageCount > 1 ? 's' : ''} ignoré${nonImageCount > 1 ? 's' : ''} (format non supporté, images uniquement)`);
    }
    if (excessCount > 0) {
      messages.push(`${excessCount} photo${excessCount > 1 ? 's' : ''} non ajoutée${excessCount > 1 ? 's' : ''} (limite de ${photoLimit} photo${photoLimit > 1 ? 's' : ''} atteinte)`);
    }
    setWarning(messages.length > 0 ? messages.join(' — ') : null);

    if (accepted.length > 0) {
      onImagesChange([...images, ...accepted.map((f) => URL.createObjectURL(f))]);
    }
  }, [images, onImagesChange, photoLimit]);

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onImagesChange(next);
  };

  const onImageDragStart = (idx: number) => setDragIdx(idx);
  const onImageDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const onImageDragEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      moveImage(dragIdx, dragOverIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // Coller une image depuis le presse-papier (Ctrl+V) -- capture d'ecran,
  // photo copiee depuis un autre onglet. Ecouteur sur `document` et non sur la
  // dropzone : un `paste` n'est delivre qu'a l'element focalise, or on ne
  // focalise pas une zone de depot avant d'y coller quelque chose.
  //
  // Sans effet quand la limite de credits est atteinte : ajouter des photos
  // qu'on ne pourra pas analyser ne ferait qu'entretenir une fausse promesse.
  useEffect(() => {
    if (isLimitReached) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleFiles, isLimitReached]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <PageHeader
          className="mb-4"
          title={<>Générateur <span className="text-neon-500">IA</span></>}
          description={`Uploade 1 à ${photoLimit} photo${photoLimit > 1 ? 's' : ''} de ton vêtement et laisse l'IA créer ton annonce Vinted parfaite.`}
          action={
            (limit !== null || unlimitedCredits) && (
              <div className="hidden sm:flex items-center gap-2 bg-surface border border-gray-200 rounded-xl px-4 py-2.5">
                <Zap className="w-4 h-4 text-neon-500" />
                <div>
                  <p className="text-xs text-gray-500">Credits restants</p>
                  <p className="text-sm font-bold text-neon-500">
                    {unlimitedCredits ? 'Illimité' : <>{credits} <span className="text-gray-500 font-normal">/ {limit}</span></>}
                  </p>
                </div>
              </div>
            )
          }
        />

        {(limit !== null || unlimitedCredits) && (
          <div className="sm:hidden flex items-center gap-2 bg-surface border border-gray-200 rounded-xl px-4 py-2.5 mt-4">
            <Zap className="w-4 h-4 text-neon-500" />
            {unlimitedCredits ? (
              <p className="text-sm font-bold text-neon-500">Illimité</p>
            ) : (
              <p className="text-sm"><span className="font-bold text-neon-500">{credits}</span> <span className="text-gray-500">credits restants sur {limit}</span></p>
            )}
          </div>
        )}
      </div>

      {/* RETIRE le 2026-08-26 : les 3 cartes "01 Upload / 02 Analyse / 03
          Annonce prete" et l'encart "Exemple de resultat" (Polo Ralph
          Lauren). Tous deux etaient statiques et occupaient le haut de page
          en permanence, repoussant la zone d'upload -- la seule chose a faire
          ici -- sous la ligne de flottaison. Le parcours est desormais
          represente par GeneratorStepper.tsx, qui n'apparait que PENDANT une
          analyse et dit ou on en est, au lieu de decrire le mode d'emploi. */}

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-red-700 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {warning && (
        <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <p className="text-sm text-amber-700">{warning}</p>
        </div>
      )}

      {isLimitReached && (
        <div className="bg-surface border border-red-500/20 rounded-2xl p-6 mb-6 text-center">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-red-700" />
          </div>
          <h3 className="font-bold text-sm mb-1 text-red-700">Limite atteinte</h3>
          <p className="text-xs text-gray-500 mb-3">Tu as utilisé tous tes crédits gratuits ce mois-ci.</p>
          <p className="text-xs text-gray-500">Passe au plan <span className="text-neon-500 font-bold">Pro</span> pour des analyses illimitées.</p>
        </div>
      )}

      <div
        className={`bg-surface border rounded-2xl transition-all duration-300 ${isDragging ? 'border-neon-500/50 shadow-[0_0_30px_rgba(124,92,255,0.15)]' : 'border-gray-200'} ${isLimitReached ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
      >
        {images.length === 0 ? (
          <label className="relative flex flex-col items-center justify-center py-20 sm:py-28 cursor-pointer group overflow-hidden">
            {/* Halo ambiant + etincelles decoratives -- purement visuel, meme
                langage que le Hero de la landing (glow flou derriere l'element
                principal) : la zone d'upload doit donner envie d'essayer,
                pas juste etre "fonctionnelle" (audit personnel utilisateur,
                2026-08-04). */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
              <div className="w-72 h-72 bg-neon-500/10 rounded-full blur-[90px] transition-all duration-200 group-hover:bg-neon-500/20" />
            </div>
            <Sparkles className="absolute top-8 left-[18%] w-4 h-4 text-neon-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-150" aria-hidden="true" />
            <Sparkles className="absolute bottom-10 right-[20%] w-3 h-3 text-yellow-400/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150" aria-hidden="true" />

            <div className="relative w-32 h-32 rounded-3xl bg-dark-400 border-2 border-dashed border-gray-700 flex items-center justify-center mb-6 transition-all duration-300 group-hover:border-neon-500/50 group-hover:bg-neon-500/5 group-hover:scale-105 group-hover:shadow-[0_0_40px_rgba(124,92,255,0.2)]">
              <span className="absolute inset-0 rounded-3xl border border-neon-500/20 animate-pulse" aria-hidden="true" />
              <Upload className="w-12 h-12 text-gray-500 group-hover:text-neon-500 transition-colors" />
            </div>
            {/* Le titre etait rendu en degrade `from-gray-100 to-gray-400`,
                herite du theme sombre : sur blanc, gray-100 plafonne a 1.10:1
                et gray-400 a 2.54:1 -- l'appel a l'action principal de la page
                etait quasiment invisible. Texte plein en gris-900. */}
            <p className="relative text-xl sm:text-2xl font-black mb-1.5 text-gray-900 group-hover:text-neon-500 transition-colors duration-300">
              Glisse tes photos ici
            </p>
            <p className="relative text-sm text-gray-500 mb-4">
              ou clique pour parcourir · <kbd className="font-mono text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">Ctrl</kbd>
              {' '}+{' '}
              <kbd className="font-mono text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">V</kbd> pour coller
            </p>
            <p className="relative text-xs text-gray-500">PNG, JPG, WEBP &middot; 1 a {photoLimit} photo{photoLimit > 1 ? 's' : ''}</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
        ) : (
          <div className="p-5 sm:p-6">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">Glisse pour réorganiser &middot; La 1ère = photo principale</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {images.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  draggable
                  onDragStart={() => onImageDragStart(i)}
                  onDragOver={(e) => onImageDragOver(e, i)}
                  onDragEnd={onImageDragEnd}
                  className={`relative group aspect-square rounded-xl overflow-hidden bg-dark-400 border transition-all cursor-grab active:cursor-grabbing ${
                    dragOverIdx === i ? 'border-neon-500 shadow-[0_0_15px_rgba(124,92,255,0.2)]' : i === 0 ? 'border-neon-500/40 ring-1 ring-neon-500/20' : 'border-gray-200'
                  } ${dragIdx === i ? 'opacity-50 scale-95' : ''}`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all" />

                  <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-all">
                    <div className="w-6 h-6 rounded-md bg-black/70 border border-gray-200 flex items-center justify-center">
                      <GripVertical className="w-3.5 h-3.5 text-white/70" />
                    </div>
                  </div>

                  <button
                    onClick={() => onImagesChange(images.filter((_, j) => j !== i))}
                    aria-label="Supprimer cette image"
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/80 border border-gray-200"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>

                  {/* Mobile up/down fallback */}
                  <div className="absolute bottom-2 right-2 flex flex-col gap-1 sm:hidden">
                    {i > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImage(i, i - 1); }}
                        aria-label="Déplacer l'image vers le haut"
                        className="w-7 h-7 rounded-md bg-black/80 border border-gray-200 flex items-center justify-center active:bg-neon-500/20"
                      >
                        <ChevronUp className="w-4 h-4 text-white" />
                      </button>
                    )}
                    {i < images.length - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImage(i, i + 1); }}
                        aria-label="Déplacer l'image vers le bas"
                        className="w-7 h-7 rounded-md bg-black/80 border border-gray-200 flex items-center justify-center active:bg-neon-500/20"
                      >
                        <ChevronDown className="w-4 h-4 text-white" />
                      </button>
                    )}
                  </div>

                  <div className="absolute bottom-2 left-2 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                      i === 0 ? 'bg-neon-500/20 text-neon-500 border-neon-500/30' : 'bg-black/60 text-white border-gray-200'
                    }`}>
                      {i === 0 ? 'Principale' : `Photo ${i + 1}`}
                    </span>
                  </div>
                </div>
              ))}
              {images.length < photoLimit ? (
                <label className="aspect-square rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center cursor-pointer hover:border-neon-500/40 hover:bg-neon-500/5 transition-all group">
                  <Plus className="w-5 h-5 text-gray-500 group-hover:text-neon-500 mb-1 transition-colors" />
                  <span className="text-xs text-gray-500 group-hover:text-neon-500 transition-colors">Ajouter</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                </label>
              ) : (
                // Retour bêta-testeur reel (Albin, 2026-08-11) : "ajouter un +
                // pour ajouter plus de photo" -- la tuile "Ajouter" existait
                // deja mais disparaissait silencieusement des la limite
                // atteinte (1 photo en Free sans credits_mode='unlimited', voir
                // GeneratorPage.tsx), sans aucune explication. Ce message
                // remplace le vide laisse par la tuile plutot que de laisser
                // une grille tronquee sans indice.
                <div className="aspect-square rounded-xl border border-gray-200 bg-dark-400/50 flex flex-col items-center justify-center text-center px-2">
                  <ImageIcon className="w-4 h-4 text-gray-700 mb-1" />
                  <span className="text-[10px] text-gray-500 leading-tight">
                    Limite de {photoLimit} photo{photoLimit > 1 ? 's' : ''} atteinte
                  </span>
                </div>
              )}
            </div>
            {/* Fond de photo genere (2026-08-30) : 'original' (par defaut)
                n'ajoute ni cout ni latence -- choisir un autre fond appelle
                reellement un modele d'edition d'image par photo avant
                l'analyse (voir backgroundStyles.ts), d'ou l'avertissement
                explicite plutot qu'un select silencieux. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-gray-200 mb-3">
              <label className="text-xs text-gray-500 flex-shrink-0" htmlFor="background-style-select">
                Fond des photos
              </label>
              <select
                id="background-style-select"
                value={backgroundStyle}
                onChange={(e) => onBackgroundStyleChange(e.target.value as BackgroundStyle)}
                className="bg-surface border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 sm:w-56 flex-shrink-0"
              >
                {BACKGROUND_STYLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {backgroundStyle !== 'original' && (
                <p className="text-[11px] text-amber-700 flex-1">
                  Le fond sera réellement généré par IA — ajoute quelques secondes par photo.
                </p>
              )}
            </div>

            {/* Compteur explicite "n / max" plutot que "n photos
                sélectionnées" : il dit d'un coup d'oeil combien il en reste,
                information que l'ancienne formulation obligeait a deduire. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-gray-200">
              <p className="text-sm text-gray-500 flex-1">
                <span className="font-bold text-gray-900 tabular-nums">{images.length}</span> / {photoLimit} photo
                {photoLimit > 1 ? 's' : ''}
              </p>
              {/* Le cout est annonce SUR le bouton : l'utilisateur doit savoir
                  ce qu'il depense avant de cliquer, pas apres. */}
              <Button
                icon={<Sparkles className="w-4 h-4" />}
                disabled={isLimitReached}
                onClick={onGenerate}
                className="w-full sm:w-auto"
              >
                {unlimitedCredits ? "Lancer la génération IA" : "Générer l'annonce (1 crédit)"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
