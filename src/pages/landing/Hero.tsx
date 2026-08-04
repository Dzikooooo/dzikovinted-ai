import { ArrowRight } from 'lucide-react';
import type { AppPage } from '../../lib/types';

export function Hero({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section className="relative pt-40 pb-28 sm:pt-48 sm:pb-40 overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(124,92,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,92,255,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-neon-500/5 rounded-full blur-[150px]" />
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex items-center rounded-full border border-neon-500/20 bg-neon-500/10 px-5 py-2" >
          <span className="text-sm font-semibold text-neon-500">
Plateforme tout-en-un pour revendeurs
</span>
        </div>

        <h1 className="mt-8 text-7xl md:text-8xl font-black tracking-tight leading-none mb-10">
  Le système complet
  <span className="block text-neon-500" style={{ textShadow: '0 0 40px rgba(124,92,255,0.22)' }}>
    du revendeur.
  </span>
</h1>
<p className="mt-8 max-w-3xl mx-auto text-2xl leading-9 text-zinc-400 mb-14">
 Prenez une photo. ResellOS génère automatiquement vos photos, votre titre, votre description et le meilleur prix.
Suivez vos annonces, votre stock et votre comptabilité depuis une seule plateforme.
</p>
        <div className="flex flex-col items-center justify-center gap-3">
          <button
            onClick={() => onNavigate('auth')}
            className="group w-full sm:w-auto bg-neon-600 text-white font-bold text-lg px-10 py-5 rounded-2xl transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] hover:bg-neon-700 hover:shadow-[0_20px_60px_rgba(124,92,255,.35)]"
          >
            <span className="flex items-center gap-3">
  Créer ma première annonce
  <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
</span>
          </button>
          <p className="text-sm text-gray-500">Sans carte bancaire · 10 annonces IA offertes chaque mois · Prête en moins d'une minute</p>
        </div>
      </div>
    </section>
  );
}
