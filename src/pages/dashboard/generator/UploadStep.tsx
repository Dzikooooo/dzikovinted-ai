import { useCallback, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, GripVertical, ImageIcon, Sparkles, Upload, X, Zap } from 'lucide-react';

interface UploadStepProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  photoStyle: string;
  onPhotoStyleChange: (style: string) => void;
  platform: string;
  onPlatformChange: (platform: string) => void;
  enhancePhoto: boolean;
  onEnhancePhotoChange: (value: boolean) => void;
  error: string | null;
  isLimitReached: boolean;
  credits: number;
  limit: number | null;
  onGenerate: () => void;
}

const PHOTO_STYLES = [
  { id: 'white', label: 'Fond blanc' },
  { id: 'studio', label: 'Studio' },
  { id: 'wood', label: 'Bois' },
  { id: 'lifestyle', label: 'Lifestyle' },
];

const PLATFORMS = [
  { id: 'vinted', label: 'Vinted' },
  { id: 'leboncoin', label: 'Leboncoin' },
  { id: 'ebay', label: 'eBay' },
  { id: 'depop', label: 'Depop' },
];

export function UploadStep({
  images,
  onImagesChange,
  photoStyle,
  onPhotoStyleChange,
  platform,
  onPlatformChange,
  enhancePhoto,
  onEnhancePhotoChange,
  error,
  isLimitReached,
  credits,
  limit,
  onGenerate,
}: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newUrls: string[] = [];
    Array.from(files).slice(0, 4 - images.length).forEach((f) => {
      if (f.type.startsWith('image/')) newUrls.push(URL.createObjectURL(f));
    });
    onImagesChange([...images, ...newUrls].slice(0, 4));
  }, [images, onImagesChange]);

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black mb-2">Generateur <span className="text-neon-500">IA</span></h1>
            <p className="text-gray-400 text-sm">Uploade 1 a 4 photos de ton vetement et laisse l'IA creer ton annonce Vinted parfaite.</p>
          </div>
          {limit !== null && (
            <div className="hidden sm:flex items-center gap-2 bg-surface border border-white/5 rounded-xl px-4 py-2.5">
              <Zap className="w-4 h-4 text-neon-500" />
              <div>
                <p className="text-xs text-gray-500">Credits restants</p>
                <p className="text-sm font-bold text-neon-500">{credits} <span className="text-gray-600 font-normal">/ {limit}</span></p>
              </div>
            </div>
          )}
        </div>

        {limit !== null && (
          <div className="sm:hidden flex items-center gap-2 bg-surface border border-white/5 rounded-xl px-4 py-2.5 mt-4">
            <Zap className="w-4 h-4 text-neon-500" />
            <p className="text-sm"><span className="font-bold text-neon-500">{credits}</span> <span className="text-gray-500">credits restants sur {limit}</span></p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isLimitReached && (
        <div className="bg-surface border border-orange-400/20 rounded-2xl p-6 mb-6 text-center">
          <div className="w-12 h-12 bg-orange-400/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-orange-400" />
          </div>
          <h3 className="font-bold text-sm mb-1 text-orange-400">Limite atteinte</h3>
          <p className="text-xs text-gray-500 mb-3">Tu as utilise tous tes credits gratuits ce mois-ci.</p>
          <p className="text-xs text-gray-400">Passe au plan <span className="text-neon-500 font-bold">Pro</span> pour des analyses illimitees.</p>
        </div>
      )}

      <div
        className={`bg-surface border rounded-2xl transition-all duration-300 ${isDragging ? 'border-neon-500/50 shadow-[0_0_30px_rgba(255,196,0,0.15)]' : 'border-white/5'} ${isLimitReached ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
      >
        {images.length === 0 ? (
          <label className="flex flex-col items-center justify-center py-20 sm:py-24 cursor-pointer group">
            <div className="w-20 h-20 rounded-2xl bg-dark-400 border-2 border-dashed border-gray-700 flex items-center justify-center mb-6 group-hover:border-neon-500/40 group-hover:bg-neon-500/5 transition-all duration-300">
              <Upload className="w-8 h-8 text-gray-600 group-hover:text-neon-500 transition-colors" />
            </div>
            <p className="text-base font-semibold mb-1">Glisse tes photos ici</p>
            <p className="text-sm text-gray-500 mb-4">ou clique pour parcourir</p>
            <p className="text-xs text-gray-600">PNG, JPG, WEBP &middot; 1 a 4 photos</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
        ) : (
          <div className="p-5 sm:p-6">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">Glisse pour reorganiser &middot; La 1ere = photo principale</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {images.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  draggable
                  onDragStart={() => onImageDragStart(i)}
                  onDragOver={(e) => onImageDragOver(e, i)}
                  onDragEnd={onImageDragEnd}
                  className={`relative group aspect-square rounded-xl overflow-hidden bg-dark-400 border transition-all cursor-grab active:cursor-grabbing ${
                    dragOverIdx === i ? 'border-neon-500 shadow-[0_0_15px_rgba(255,196,0,0.2)]' : i === 0 ? 'border-neon-500/40 ring-1 ring-neon-500/20' : 'border-white/5'
                  } ${dragIdx === i ? 'opacity-50 scale-95' : ''}`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all" />

                  <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-all">
                    <div className="w-6 h-6 rounded-md bg-black/70 border border-white/10 flex items-center justify-center">
                      <GripVertical className="w-3.5 h-3.5 text-white/70" />
                    </div>
                  </div>

                  <button
                    onClick={() => onImagesChange(images.filter((_, j) => j !== i))}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/80 border border-white/10"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>

                  {/* Mobile up/down fallback */}
                  <div className="absolute bottom-2 right-2 flex flex-col gap-1 sm:hidden">
                    {i > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImage(i, i - 1); }}
                        className="w-7 h-7 rounded-md bg-black/80 border border-white/10 flex items-center justify-center active:bg-neon-500/20"
                      >
                        <ChevronUp className="w-4 h-4 text-white" />
                      </button>
                    )}
                    {i < images.length - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImage(i, i + 1); }}
                        className="w-7 h-7 rounded-md bg-black/80 border border-white/10 flex items-center justify-center active:bg-neon-500/20"
                      >
                        <ChevronDown className="w-4 h-4 text-white" />
                      </button>
                    )}
                  </div>

                  <div className="absolute bottom-2 left-2 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                      i === 0 ? 'bg-neon-500/20 text-neon-500 border-neon-500/30' : 'bg-black/60 text-white border-white/10'
                    }`}>
                      {i === 0 ? 'Principale' : `Photo ${i + 1}`}
                    </span>
                  </div>
                </div>
              ))}
              {images.length < 4 && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center cursor-pointer hover:border-neon-500/40 hover:bg-neon-500/5 transition-all group">
                  <ImageIcon className="w-5 h-5 text-gray-600 group-hover:text-neon-500 mb-1 transition-colors" />
                  <span className="text-xs text-gray-600 group-hover:text-neon-500 transition-colors">Ajouter</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                </label>
              )}
            </div>
            <div className="mb-5 bg-dark-400 border border-white/5 rounded-xl p-4">
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">
                Options IA Photo
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {PHOTO_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => onPhotoStyleChange(style.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold border transition ${
                      photoStyle === style.id
                        ? "bg-neon-500 text-black border-neon-500"
                        : "bg-surface text-gray-400 border-white/10"
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={enhancePhoto}
                  onChange={(e) => onEnhancePhotoChange(e.target.checked)}
                  className="accent-neon-500"
                />
                Améliorer automatiquement la qualité
              </label>
            </div>
            <div className="mb-5 bg-dark-400 border border-white/5 rounded-xl p-4">
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">
                Plateforme
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PLATFORMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onPlatformChange(item.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold border transition ${
                      platform === item.id
                        ? "bg-neon-500 text-black border-neon-500"
                        : "bg-surface text-gray-400 border-white/10"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <p className="text-sm text-gray-500">{images.length} photo{images.length > 1 ? 's' : ''} selectionnee{images.length > 1 ? 's' : ''}</p>
              <button
                onClick={onGenerate}
                disabled={isLimitReached}
                className="flex items-center gap-2 bg-neon-500 text-black font-bold px-6 py-2.5 rounded-xl hover:bg-neon-600 transition-all hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] text-sm disabled:opacity-40 disabled:hover:shadow-none"
              >
                <Sparkles className="w-4 h-4" />
                Generer mon annonce
              </button>
            </div>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { step: '01', title: 'Upload', desc: 'Ajoute 1 a 4 photos de ton vetement' },
          { step: '02', title: 'Analyse IA', desc: 'L\'IA detecte marque, couleur, etat...' },
          { step: '03', title: 'Annonce prete', desc: 'Copie le titre et la description optimises' },
        ].map(({ step: s, title, desc }) => (
          <div key={s} className="flex items-start gap-3 bg-surface/50 border border-white/3 rounded-xl px-4 py-3">
            <span className="text-[10px] font-mono text-neon-500 bg-neon-500/10 px-2 py-0.5 rounded-md flex-shrink-0 mt-0.5">{s}</span>
            <div>
              <p className="text-xs font-semibold text-gray-200">{title}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
