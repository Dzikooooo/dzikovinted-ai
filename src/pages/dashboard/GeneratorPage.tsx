import { useState, useCallback, useRef } from 'react';
import { Upload, X, ImageIcon, Sparkles, ArrowLeft, Copy, Check, Tag, DollarSign, Layers, Palette, Ruler, Star, Filter, Pencil, Save, Zap, AlertCircle, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { analyzeWithAI } from '../../lib/aiService';
import type { GeneratedListing, VintedFilter } from '../../lib/types';
import { PLAN_LIMITS } from '../../lib/types';

type GenStep = 'upload' | 'loading' | 'result' | 'edit';

const LOADING_MESSAGES = [
  { text: 'Analyse du vetement...', sub: 'Detection des caracteristiques visuelles' },
  { text: 'Detection de la marque...', sub: 'Identification du logo et des etiquettes' },
  { text: 'Estimation du prix...', sub: 'Comparaison avec le marche Vinted' },
  { text: 'Generation SEO...', sub: 'Optimisation titre, description et mots-cles' },
];

function CopyBtn({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
      title="Copier"
    >
      {copied
        ? <Check className={small ? 'w-3 h-3 text-neon-500' : 'w-3.5 h-3.5 text-neon-500'} />
        : <Copy className={small ? 'w-3 h-3 text-gray-500' : 'w-3.5 h-3.5 text-gray-500 hover:text-gray-300'} />}
    </button>
  );
}

function FieldCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="bg-dark-400 border border-white/5 rounded-xl p-4 hover:border-neon-500/20 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-neon-500/60" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">{label}</span>
        </div>
        <CopyBtn text={value} small />
      </div>
      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}

export default function GeneratorPage() {
  const [step, setStep] = useState<GenStep>('upload');
  const [images, setImages] = useState<string[]>([]);
  const [photoStyle, setPhotoStyle] = useState("white");
  const [platform, setPlatform] = useState("vinted");
const [enhancePhoto, setEnhancePhoto] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<GeneratedListing | null>(null);
  const [editForm, setEditForm] = useState<GeneratedListing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, profile, refreshProfile } = useAuth();

  const plan = profile?.plan ?? 'free';
  const credits = profile?.credits ?? 0;
  const limit = PLAN_LIMITS[plan];
  const isLimitReached = limit !== null && credits <= 0;

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newUrls: string[] = [];
    Array.from(files).slice(0, 4 - images.length).forEach((f) => {
      if (f.type.startsWith('image/')) newUrls.push(URL.createObjectURL(f));
    });
    setImages((prev) => [...prev, ...newUrls].slice(0, 4));
  }, [images.length]);

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
      console.log('Credits before:', credits);
      const openaiKey = localStorage.getItem('dzikovinted_openai_key') || undefined;
      console.log('OpenAI key from localStorage:', openaiKey ? `${openaiKey.slice(0, 8)}...` : 'none (will use server key or mock)');
      console.log('Uploaded images:', images.length, 'blob URLs');
      console.log("Options génération:", {
        platform,
        photoStyle,
        enhancePhoto,
      });
      const generated = await analyzeWithAI({
        imageUrls: images,
        platform,
        photoStyle,
        enhancePhoto,
        geminiKey: openaiKey,
      });
      setResult(generated);
      setEditForm({ ...generated });
      setStep('result');

      if (user) {
        const month = new Date().toISOString().slice(0, 7);
        const { error: usageErr } = await supabase.rpc('increment_usage', { p_user_id: user.id, p_month: month });
        if (usageErr) console.error('increment_usage error:', usageErr);

        if (limit !== null) {
          const { data: creditData, error: creditErr } = await supabase.rpc('decrement_credit', { p_user_id: user.id });
          if (creditErr) {
            console.error('decrement_credit error:', creditErr);
          } else {
            console.log('Credits after:', creditData);
          }
          await refreshProfile();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue';
      console.error('Generation failed (credits NOT decremented):', msg);
      setError(msg);
      setStep('upload');
    }
  };

  const handleSave = async () => {
    if (!editForm || !user) return;
    setSaving(true);
    console.log('Saving listing for user:', user.id);
    console.log('Image URLs being saved:', images.length, 'images');
    const { data: insertData, error: insertError } = await supabase.from('listings').insert({
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
      image_urls: images,
    }).select();
    setSaving(false);
    if (insertError) {
      console.error('Listing save error:', insertError);
      setError('Erreur lors de la sauvegarde: ' + insertError.message);
    } else {
      console.log('Listing saved successfully:', insertData);
      setSaved(true);
    }
  };

  const handleCopyAll = () => {
    if (!result) return;
    const t = [
      result.title, '',
      result.description, '',
      `Prix recommande: ${result.price} EUR`,
      `Vente rapide: ${result.quick_price} EUR`,
      `Premium: ${result.premium_price} EUR`,
      `Marque: ${result.brand}`,
      `Categorie: ${result.category}`,
      `Taille: ${result.size}`,
      `Couleur: ${result.color}`,
      `Matiere: ${result.material}`,
      `Etat: ${result.condition}`,
      `Mots-cles: ${result.keywords.join(', ')}`,
    ].join('\n');
    navigator.clipboard.writeText(t);
  };

  const updateEdit = (key: keyof GeneratedListing, value: string | number | string[] | VintedFilter[]) => {
    setEditForm((prev) => prev ? { ...prev, [key]: value } : null);
  };

  const resetAll = () => {
    setStep('upload');
    setImages([]);
    setResult(null);
    setEditForm(null);
    setSaved(false);
    setError(null);
  };

  // Upload step
  if (step === 'upload') {
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
                      onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
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
    {[
      { id: "white", label: "Fond blanc" },
      { id: "studio", label: "Studio" },
      { id: "wood", label: "Bois" },
      { id: "lifestyle", label: "Lifestyle" },
    ].map((style) => (
      <button
        key={style.id}
        onClick={() => setPhotoStyle(style.id)}
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
      onChange={(e) => setEnhancePhoto(e.target.checked)}
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
    {[
      { id: "vinted", label: "Vinted" },
      { id: "leboncoin", label: "Leboncoin" },
      { id: "ebay", label: "eBay" },
      { id: "depop", label: "Depop" },
    ].map((item) => (
      <button
        key={item.id}
        onClick={() => setPlatform(item.id)}
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
                  onClick={handleGenerate}
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

  // Loading step
  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-8">
        <div className="text-center max-w-sm w-full">
          <div className="relative w-28 h-28 mx-auto mb-10">
            <div className="absolute inset-0 rounded-full border-2 border-neon-500/20 animate-spin" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-3 rounded-full border-2 border-dashed border-neon-500/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '2s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-neon-500 animate-pulse" />
            </div>
          </div>
          <h2 className="text-xl font-black mb-2">L'IA analyse ton vetement</h2>
          <p className="text-gray-500 text-sm mb-8">Quelques secondes...</p>
          <div className="space-y-3">
            {LOADING_MESSAGES.map(({ text, sub }, i) => {
              const isActive = i === loadingStep;
              const isDone = i < loadingStep;
              return (
                <div key={text} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500 ${isActive ? 'bg-neon-500/10 border-neon-500/30 shadow-[0_0_20px_rgba(255,196,0,0.1)]' : isDone ? 'bg-neon-500/5 border-neon-500/10' : 'bg-surface border-white/5'}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-neon-500 animate-pulse' : isDone ? 'bg-neon-500/60' : 'bg-gray-700'}`} />
                  <div className="flex-1 text-left">
                    <span className={`text-sm block ${isActive ? 'text-neon-500 font-medium' : isDone ? 'text-gray-400' : 'text-gray-600'}`}>{text}</span>
                    {isActive && <span className="text-[10px] text-neon-500/50 block mt-0.5">{sub}</span>}
                  </div>
                  {isDone && <Check className="w-4 h-4 text-neon-500/70 ml-auto" />}
                  {isActive && (
                    <div className="ml-auto flex gap-1">
                      {[0, 200, 400].map((d) => <div key={d} className="w-1 h-1 rounded-full bg-neon-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Result step
  if (step === 'result' && result) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <button onClick={resetAll} className="flex items-center gap-2 text-sm text-gray-400 hover:text-neon-500 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Nouvelle annonce
        </button>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
  <h1 className="text-2xl sm:text-3xl font-black mb-1">
    Annonce <span className="text-neon-500">prête</span>
  </h1>
  <p className="text-gray-400 text-sm">Optimisée pour Vinted</p>
</div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleCopyAll} className="flex items-center gap-2 border border-white/10 text-gray-300 font-medium px-4 py-2 rounded-xl hover:bg-white/5 transition-all text-sm">
              <Copy className="w-4 h-4" /> Copier tout
            </button>
            <button onClick={() => setStep('edit')} className="flex items-center gap-2 border border-neon-500/30 text-neon-500 font-medium px-4 py-2 rounded-xl hover:bg-neon-500/10 transition-all text-sm">
              <Pencil className="w-4 h-4" /> Modifier
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`flex items-center gap-2 font-medium px-4 py-2 rounded-xl transition-all text-sm ${saved ? 'bg-neon-500/20 text-neon-500 border border-neon-500/30' : 'bg-neon-500 text-black hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] disabled:opacity-60'}`}
            >
              <Save className="w-4 h-4" />
              {saved ? 'Sauvegarde !' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>

        {/* Image preview strip */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
            {images.map((src, i) => (
              <div key={i} className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="bg-surface border border-white/5 rounded-2xl p-5 sm:p-7 space-y-4">
          <FieldCard label="Titre SEO" value={result.title} icon={Tag} />
          <FieldCard label="Description" value={result.description} icon={Layers} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Prix recommande', val: `${result.price} EUR`, color: 'text-neon-500', border: 'border-neon-500/20', bg: 'bg-neon-500/5' },
              { label: 'Vente rapide', val: `${result.quick_price} EUR`, color: 'text-orange-400', border: 'border-orange-400/20', bg: 'bg-orange-400/5' },
              { label: 'Prix premium', val: `${result.premium_price} EUR`, color: 'text-blue-400', border: 'border-blue-400/20', bg: 'bg-blue-400/5' },
            ].map(({ label, val, color, border, bg }) => (
              <div key={label} className={`${bg} border ${border} rounded-xl p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className={`w-3.5 h-3.5 ${color}`} />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
                  </div>
                  <CopyBtn text={val} />
                </div>
                <p className={`text-2xl font-black ${color}`}>{val}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FieldCard label="Marque" value={result.brand} icon={Star} />
            <FieldCard label="Categorie" value={result.category} icon={Layers} />
            <FieldCard label="Taille" value={result.size} icon={Ruler} />
            <FieldCard label="Couleur" value={result.color} icon={Palette} />
            <FieldCard label="Matiere" value={result.material} icon={Tag} />
            <FieldCard label="Etat" value={result.condition} icon={Tag} />
          </div>

          <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-neon-500/60" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">Hashtags / Mots-cles</span>
              </div>
              <CopyBtn text={result.keywords.map(k => `#${k.replace(/\s+/g, '')}`).join(' ')} />
            </div>
            <div className="flex flex-wrap gap-2">
              {result.keywords.map((kw) => (
                <span key={kw} onClick={() => navigator.clipboard.writeText(`#${kw.replace(/\s+/g, '')}`)} className="px-3 py-1 text-xs font-mono bg-neon-500/10 text-neon-500 rounded-full border border-neon-500/20 cursor-pointer hover:bg-neon-500/20 transition-colors">
                  #{kw.replace(/\s+/g, '')}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-dark-400 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-neon-500/60" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">Filtres Vinted</span>
              </div>
              <CopyBtn text={result.vinted_filters.map((f) => `${f.label}: ${f.value}`).join('\n')} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {result.vinted_filters.map((f) => (
                <div key={f.label} onClick={() => navigator.clipboard.writeText(f.value)} className="bg-surface rounded-lg px-3 py-2 border border-white/5 cursor-pointer hover:border-neon-500/20 transition-colors">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-gray-600 mb-0.5">{f.label}</p>
                  <p className="text-xs text-gray-200">{f.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit step
  if (step === 'edit' && editForm) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <button onClick={() => setStep('result')} className="flex items-center gap-2 text-sm text-gray-400 hover:text-neon-500 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Retour au resultat
        </button>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-black">Modifier l'<span className="text-neon-500">annonce</span></h1>
          <div className="flex gap-2">
            <button onClick={() => editForm && setEditForm({ ...result! })} className="flex items-center gap-2 border border-white/10 text-gray-300 font-medium px-4 py-2 rounded-xl hover:bg-white/5 transition-all text-sm">
              Reinitialiser
            </button>
            <button
              onClick={async () => { if (result) { setResult({ ...editForm }); } await handleSave(); setStep('result'); }}
              className="flex items-center gap-2 bg-neon-500 text-black font-bold px-4 py-2 rounded-xl hover:bg-neon-600 transition-all text-sm"
            >
              <Save className="w-4 h-4" /> Sauvegarder
            </button>
          </div>
        </div>

        <div className="bg-surface border border-white/5 rounded-2xl p-5 sm:p-7 space-y-5">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Titre SEO</label>
            <input type="text" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 transition-all" value={editForm.title} onChange={(e) => updateEdit('title', e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Description</label>
            <textarea className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 transition-all min-h-[120px] resize-y" value={editForm.description} onChange={(e) => updateEdit('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { k: 'price', label: 'Prix recommande' },
              { k: 'quick_price', label: 'Vente rapide' },
              { k: 'premium_price', label: 'Prix premium' },
            ].map(({ k, label }) => (
              <div key={k}>
                <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
                <input type="number" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 transition-all" value={(editForm as unknown as Record<string, number>)[k]} onChange={(e) => updateEdit(k as keyof GeneratedListing, parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { k: 'brand', label: 'Marque' },
              { k: 'category', label: 'Categorie' },
              { k: 'size', label: 'Taille' },
              { k: 'color', label: 'Couleur' },
              { k: 'material', label: 'Matiere' },
            ].map(({ k, label }) => (
              <div key={k}>
                <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{label}</label>
                <input type="text" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 transition-all" value={(editForm as unknown as Record<string, string>)[k]} onChange={(e) => updateEdit(k as keyof GeneratedListing, e.target.value)} />
              </div>
            ))}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Etat</label>
              <select className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 transition-all" value={editForm.condition} onChange={(e) => updateEdit('condition', e.target.value)}>
                <option>Neuf avec etiquette</option>
                <option>Neuf sans etiquette</option>
                <option>Tres bon etat</option>
                <option>Bon etat</option>
                <option>Etat satisfaisant</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60 block mb-2">Mots-cles / Hashtags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {editForm.keywords.map((kw, i) => (
                <span key={i} className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-neon-500/10 text-neon-500 rounded-full border border-neon-500/20">
                  #{kw.replace(/\s+/g, '')}
                  <button onClick={() => updateEdit('keywords', editForm.keywords.filter((_, j) => j !== i))} className="text-neon-500/40 hover:text-red-400 transition-colors ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input type="text" placeholder="Ajouter un mot-cle (Entree)" className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 transition-all"
              onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v && !editForm.keywords.includes(v)) { updateEdit('keywords', [...editForm.keywords, v]); (e.target as HTMLInputElement).value = ''; } } }} />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
