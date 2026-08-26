import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { AppPage } from '../../lib/types';
import { Wordmark } from '../../components/ui/Wordmark';

export function Navbar({ onNavigate, currentPage }: { onNavigate: (page: AppPage) => void; currentPage?: AppPage }) {
  const [open, setOpen] = useState(false);
  const linkClass = (page: AppPage) =>
    `transition duration-300 ${currentPage === page ? 'text-[#007782] font-semibold' : 'text-gray-600 hover:text-gray-900'}`;

  // Fonctionnalites/Tarifs sont des ancres vers des sections qui n'existent
  // que sur la page d'accueil (Features.tsx/Pricing.tsx) -- depuis une autre
  // page (A propos, Newsletter...) un simple <a href="#..."> ne menait nulle
  // part puisque ces id n'existent pas dans le DOM courant (bug reel signale
  // le 2026-07-31 : impossible de quitter "A propos"). On navigue d'abord
  // vers la page d'accueil, puis on scrolle une fois qu'elle est montee.
  const goToSection = (id: string) => {
    setOpen(false);
    onNavigate('landing');
    requestAnimationFrame(() => {
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  };

  return (
    <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl">
      <div className="bg-white/95 backdrop-blur-3xl border border-gray-200 rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,.08)]">

        <div className="h-16 px-6 flex items-center justify-between">

          {/* Logo */}

          <button
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-1"
          >
            <Wordmark size="xl" logoClassName="transition-transform duration-300 hover:scale-[1.02]" />
          </button>

          {/* Desktop */}

          <div className="hidden lg:flex items-center gap-8 text-[15px] font-medium">

            <button
              onClick={() => onNavigate("blog")}
              className={linkClass('blog')}
            >
              À propos
            </button>

            <button
              onClick={() => goToSection('features')}
              className="text-gray-600 hover:text-gray-900 transition duration-300"
            >
              Fonctionnalités
            </button>

            <button
              onClick={() => goToSection('pricing')}
              className="text-gray-600 hover:text-gray-900 transition duration-300"
            >
              Tarifs
            </button>

            <button
              onClick={() => onNavigate("newsletter")}
              className={linkClass('newsletter')}
            >
              Newsletter
            </button>

            <button
              onClick={() => onNavigate("auth")}
              className={linkClass('auth')}
            >
              Connexion
            </button>

            <button
              onClick={() => {
                sessionStorage.setItem('resellos:authMode', 'register');
                onNavigate("auth");
              }}
              className="text-gray-600 hover:text-gray-900 font-semibold transition duration-300"
            >
              Commencer
            </button>

          </div>

          {/* Mobile */}

          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="lg:hidden"
          >
            {open ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>

        </div>

        {open && (
          <div className="lg:hidden border-t border-gray-200 px-6 py-5 space-y-5">

            <button
              onClick={() => onNavigate("blog")}
              className={`block ${linkClass('blog')}`}
            >
              À propos
            </button>

            <button
              onClick={() => goToSection('features')}
              className="block text-gray-600"
            >
              Fonctionnalités
            </button>

            <button
              onClick={() => goToSection('pricing')}
              className="block text-gray-600"
            >
              Tarifs
            </button>

            <button
              onClick={() => onNavigate("newsletter")}
              className={`block ${linkClass('newsletter')}`}
            >
              Newsletter
            </button>

            <button
              onClick={() => onNavigate("auth")}
              className={`block ${linkClass('auth')}`}
            >
              Connexion
            </button>

            <button
              onClick={() => {
                sessionStorage.setItem('resellos:authMode', 'register');
                onNavigate("auth");
              }}
              className="block text-gray-600 hover:text-gray-900 font-semibold"
            >
              Commencer
            </button>

          </div>
        )}

      </div>
    </nav>
  );
}
