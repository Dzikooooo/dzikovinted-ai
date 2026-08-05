import { Logo } from './Logo';

// Ecran de demarrage -- affiche a chaque ouverture/lancement/refresh tant
// que la session Supabase n'est pas encore resolue (voir App.tsx::loading),
// avec une duree minimale imposee pour ne jamais flasher en dessous de ce
// qui est perceptible (demande produit 2026-08-04).
export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-7">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-neon-500/20 animate-spin" style={{ animationDuration: '2.4s' }} />
        <div className="absolute inset-3 rounded-full border-2 border-dashed border-neon-500/50 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        <Logo variant="square" size={46} />
      </div>
      <p className="text-[11px] text-gray-600 font-mono uppercase tracking-wider">by Dziko</p>
    </div>
  );
}
