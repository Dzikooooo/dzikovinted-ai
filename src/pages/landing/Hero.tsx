import { ArrowRight, Camera, Sparkles } from 'lucide-react';
import type { AppPage } from '../../lib/types';

export function Hero({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,196,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,196,0,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-neon-500/5 rounded-full blur-[150px]" />
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-neon-500/20 bg-neon-500/10 px-5 py-2" >
          <Sparkles className="w-4 h-4 text-neon-500" />
          <span className="text-sm font-semibold text-neon-500">
Plateforme tout-en-un pour revendeurs
</span>
        </div>

        <h1 className="mt-8 text-6xl md:text-8xl font-black tracking-tight leading-none mb-10">
  Le système complet
  <span className="block text-neon-500" style={{ textShadow: '0 0 40px rgba(255,196,0,0.22)' }}>
    du revendeur.
  </span>
</h1>
<p className="mt-8 max-w-3xl mx-auto text-xl leading-9 text-zinc-400 mb-14">
 Prenez une photo de votre article. Resell OS génère automatiquement
une annonce optimisée, estime le meilleur prix et met à jour votre stock en quelques secondes.
</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => onNavigate('auth')}
            className="group w-full sm:w-auto bg-neon-500 text-black font-bold text-lg px-10 py-5 rounded-2xl transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] hover:bg-[#FFD54A] hover:shadow-[0_20px_60px_rgba(255,196,0,.35)]"
          >
            <span className="flex items-center gap-3">
  Commencer gratuitement
  <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
</span>
          </button>
          <p className="text-sm text-gray-500">Sans carte bancaire · 10 analyses offertes</p>
        </div>
        <div className="mt-16 max-w-5xl mx-auto bg-surface border border-white/10 rounded-3xl p-6 shadow-[0_0_80px_shadow-[0_0_80px_rgba(255,196,0,0.08)]">
  <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-gray-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md mb-4">
    Aperçu — exemple
  </span>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

    <div className="bg-black/60 rounded-2xl p-5 border border-white/10">
      <p className="text-xs text-gray-500 mb-3"> Photo importée</p>

      <div className="aspect-square rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] bg-neon-500/10 border border-neon-500/20 flex items-center justify-center">
        <Camera className="w-10 h-10 text-neon-500" />
      </div>

      <p className="text-sm text-gray-400 mt-4">
        Nike Hoodie • Taille M
      </p>
    </div>

    <div className="bg-black/60 rounded-2xl p-5 border border-white/10">
      <p className="text-xs text-gray-500 mb-3">
         Annonce générée
      </p>

      <h3 className="font-bold text-white mb-2">
        Sweat Nike noir oversize
      </h3>

      <p className="text-sm text-gray-400 leading-relaxed">
        Sweat Nike noir en très bon état, coupe oversize,
        idéal streetwear. Parfait pour un look casual.
      </p>

      <div className="mt-4 flex gap-2">
        <span className="text-xs bg-neon-500/10 text-neon-500 px-3 py-1 rounded-full">
          SEO
        </span>

        <span className="text-xs bg-neon-500/10 text-neon-500 px-3 py-1 rounded-full">
          Auto
        </span>
      </div>
    </div>

    <div className="bg-black/60 rounded-2xl p-5 border border-white/10">
      <p className="text-xs text-gray-500 mb-3">
        Dashboard
      </p>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Prix conseillé</span>
          <span className="text-neon-500 font-bold">
            34,90€
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Marge estimée</span>
          <span className="font-bold text-white">
            +18€
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Stock actif</span>
          <span className="font-bold text-white">
            42 articles
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">CA du mois</span>
          <span className="font-bold text-white">
            1 240€
          </span>
        </div>
      </div>
    </div>

  </div>
</div>
      </div>
          </section>
  );
}
