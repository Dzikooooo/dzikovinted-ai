import { Mail, Instagram } from 'lucide-react';
import type { AppPage } from '../../lib/types';
import { Logo } from '../../components/ui/Logo';

// Meme discipline que DiscordTab.tsx/Features.tsx : pas de lien invente,
// simplement absent tant que la variable d'env n'est pas configuree.
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;

export function Footer({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  // Meme bug que Navbar.tsx avant le 2026-07-31 : un simple <a href="#..">
  // ne mene nulle part depuis une page qui n'est pas la landing (l'id
  // n'existe pas dans le DOM courant). On navigue d'abord vers la landing
  // puis on scrolle -- jamais corrige ici a l'epoque, propage maintenant.
  const goToSection = (id: string) => {
    onNavigate('landing');
    requestAnimationFrame(() => {
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  };

  const openChangelog = () => {
    sessionStorage.setItem('resellos:blogSection', 'mises-a-jour');
    onNavigate('blog');
  };

  return (
    <footer className="border-t border-white/5 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div>
            <div className="flex items-center gap-1.5 mb-4">
              <Logo variant="transparent" size={32} />
              <span className="font-black text-lg">esell<span className="text-neon-500">OS</span></span>
            </div>
            <p className="text-base text-gray-500 leading-relaxed">Tout ce dont un revendeur a besoin, dans un seul système.</p>
          </div>
          <div>
            <h4 className="text-base font-bold mb-4">Produit</h4>
            <ul className="space-y-2.5 text-[15px] text-gray-500">
              <li><button onClick={() => onNavigate('blog')} className="hover:text-neon-500 transition-colors">À propos</button></li>
              <li><button onClick={() => goToSection('features')} className="hover:text-neon-500 transition-colors">Fonctionnalités</button></li>
              <li><button onClick={() => goToSection('pricing')} className="hover:text-neon-500 transition-colors">Tarifs</button></li>
              <li><button onClick={() => onNavigate('newsletter')} className="hover:text-neon-500 transition-colors">Newsletter</button></li>
              <li><button onClick={() => onNavigate('auth')} className="hover:text-neon-500 transition-colors">Connexion</button></li>
            </ul>
          </div>
          <div>
            <h4 className="text-base font-bold mb-4">Légal</h4>
            <ul className="space-y-2.5 text-[15px] text-gray-500">
              <li><button onClick={() => onNavigate('cgu')} className="hover:text-neon-500 transition-colors">CGU</button></li>
              <li><button onClick={() => onNavigate('confidentialite')} className="hover:text-neon-500 transition-colors">Confidentialité</button></li>
            </ul>
          </div>
          <div>
            <h4 className="text-base font-bold mb-4">Contact</h4>
            <ul className="space-y-2.5 text-[15px] text-gray-500">
              <li>
                <a href="mailto:resellosapp@gmail.com" className="flex items-center gap-2 text-neon-500 hover:text-neon-400 transition-colors">
                  <Mail className="w-4 h-4" /> resellosapp@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="https://www.instagram.com/dzkbeatbox"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-neon-500 transition-colors"
                >
                  <Instagram className="w-4 h-4" /> @dzkbeatbox
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-gray-600">
            <p>© 2026 Resell OS. Tous droits réservés.</p>
            <span className="hidden sm:inline text-gray-800">·</span>
            <button onClick={openChangelog} className="text-neon-500/70 font-mono hover:text-neon-400 transition-colors">
              Version bêta
            </button>
            {DISCORD_INVITE_URL && (
              <>
                <span className="hidden sm:inline text-gray-800">·</span>
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-neon-500 transition-colors">
                  Discord
                </a>
              </>
            )}
            <span className="hidden sm:inline text-gray-800">·</span>
            <span>Made in France</span>
          </div>
          <div className="flex gap-4">
            <a
              href="https://www.instagram.com/dzkbeatbox"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Resell OS sur Instagram (@dzkbeatbox)"
              className="text-gray-600 hover:text-neon-500 transition-colors"
            >
              <Instagram className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
