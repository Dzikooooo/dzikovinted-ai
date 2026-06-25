import { useState } from 'react';
import { ArrowRight, ArrowLeft, Upload, Check } from 'lucide-react';

type Step = 1 | 2 | 3;

export default function NewItemPage() {
  const [step, setStep] = useState<Step>(1);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseLocation, setPurchaseLocation] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [images, setImages] = useState<string[]>([]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    const urls = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, 4 - images.length)
      .map((file) => URL.createObjectURL(file));

    setImages((prev) => [...prev, ...urls].slice(0, 4));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-2">Nouvel article</h1>
        <p className="text-gray-400 text-sm">
          Ajoute un article à ton stock, puis génère son annonce.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StepCard number={1} label="Achat" active={step === 1} done={step > 1} />
        <StepCard number={2} label="Photos" active={step === 2} done={step > 2} />
        <StepCard number={3} label="Analyse" active={step === 3} done={false} />
      </div>

      <div className="bg-[#181818] border border-white/5 rounded-2xl p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                Prix d'achat
              </label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Ex : 8"
                className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#39FF14]/40"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                Lieu d'achat
              </label>
              <input
                value={purchaseLocation}
                onChange={(e) => setPurchaseLocation(e.target.value)}
                placeholder="Ex : Emmaüs, friperie, vide-grenier..."
                className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#39FF14]/40"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">
                Date d'achat
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-[#39FF14]/40"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                disabled={!purchasePrice}
                className="flex items-center gap-2 bg-[#39FF14] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#50ff30] transition-all disabled:opacity-40"
              >
                Suivant
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-black mb-1">Photos</h2>
              <p className="text-sm text-gray-500">
                Ajoute jusqu'à 4 photos de l'article.
              </p>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl py-12 cursor-pointer hover:border-[#39FF14]/40 hover:bg-[#39FF14]/5 transition-all">
              <Upload className="w-8 h-8 text-gray-600 mb-3" />
              <p className="text-sm font-semibold text-gray-300">Ajouter des photos</p>
              <p className="text-xs text-gray-600 mt-1">PNG, JPG, WEBP · maximum 4</p>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>

            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mt-5">
                {images.map((src, i) => (
                  <div key={src} className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-[#0A0A0A]">
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-6">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              <button
                onClick={() => setStep(3)}
                disabled={images.length === 0}
                className="flex items-center gap-2 bg-[#39FF14] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#50ff30] transition-all disabled:opacity-40"
              >
                Lancer l'analyse
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-[#39FF14]" />
            </div>

            <h2 className="text-xl font-black mb-2">Prêt pour l'analyse</h2>
            <p className="text-sm text-gray-500 mb-6">
              Les informations d'achat et les photos sont prêtes.
            </p>

            <div className="bg-[#0A0A0A] border border-white/5 rounded-xl p-4 text-left max-w-md mx-auto mb-6">
              <p className="text-xs text-gray-500">Prix d'achat</p>
              <p className="text-sm font-bold mb-3">{purchasePrice} €</p>

              <p className="text-xs text-gray-500">Lieu</p>
              <p className="text-sm font-bold mb-3">{purchaseLocation || 'Non renseigné'}</p>

              <p className="text-xs text-gray-500">Date</p>
              <p className="text-sm font-bold">{purchaseDate}</p>
            </div>

            <button
              disabled
              className="bg-[#39FF14] text-black font-bold px-6 py-3 rounded-xl opacity-40"
            >
              Analyse IA bientôt connectée
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  number,
  label,
  active,
  done,
}: {
  number: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${active ? 'bg-[#39FF14]/10 border-[#39FF14]/30' : done ? 'bg-[#181818] border-[#39FF14]/20' : 'bg-[#181818] border-white/5'}`}>
      <p className={`text-[10px] uppercase tracking-wider mb-1 ${active || done ? 'text-[#39FF14]' : 'text-gray-600'}`}>
        Étape {number}
      </p>
      <p className="text-sm font-bold text-gray-200">{label}</p>
    </div>
  );
}
