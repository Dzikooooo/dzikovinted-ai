import { useState } from 'react';
import { Zap, Menu, X } from 'lucide-react';
import type { AppPage } from '../../lib/types';

export function Navbar({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl">
      <div className="bg-black/75 backdrop-blur-3xl border border-[#2B2B2B] rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,.45)]">

        <div className="h-14 px-6 flex items-center justify-between">

          {/* Logo */}

          <button
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
            className="flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] bg-neon-500 flex items-center justify-center shadow-[0_0_30px_rgba(255,196,0,0.25)]">
              <Zap className="w-5 h-5 text-black" />
            </div>

            <div className="flex items-end">
              <span className="text-[1.65rem] font-black tracking-tight text-white leading-none">
                RESELL
              </span>

              <span className="ml-1 text-neon-500 text-[1.25rem] font-black leading-none mb-[2px]">
                OS
              </span>
            </div>
          </button>

          {/* Desktop */}

          <div className="hidden md:flex items-center gap-10">

            <a
              href="#features"
              className="text-gray-400 hover:text-white transition duration-300"
            >
              Fonctionnalités
            </a>

            <a
              href="#pricing"
              className="text-gray-400 hover:text-white transition duration-300"
            >
              Tarifs
            </a>

            <button
              onClick={() => onNavigate("auth")}
              className="text-gray-400 hover:text-white transition duration-300"
            >
              Connexion
            </button>

            <button
              onClick={() => onNavigate("auth")}
              className="bg-neon-500 text-black font-bold px-7 py-3 rounded-2xl hover:bg-neon-600 hover:shadow-[0_0_35px_rgba(255,196,0,.35)] transition-all duration-300 hover:scale-[1.02]"
            >
              Commencer
            </button>

          </div>

          {/* Mobile */}

          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="md:hidden"
          >
            {open ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>

        </div>

        {open && (
          <div className="md:hidden border-t border-[#2B2B2B] px-6 py-5 space-y-5">

            <a
              href="#features"
              className="block text-gray-400"
            >
              Fonctionnalités
            </a>

            <a
              href="#pricing"
              className="block text-gray-400"
            >
              Tarifs
            </a>

            <button
              onClick={() => onNavigate("auth")}
              className="block text-gray-400"
            >
              Connexion
            </button>

            <button
              onClick={() => onNavigate("auth")}
              className="w-full bg-neon-500 text-black font-bold py-3 rounded-2xl"
            >
              Commencer
            </button>

          </div>
        )}

      </div>
    </nav>
  );
}
