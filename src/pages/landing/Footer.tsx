import { Zap, Mail, Twitter, Github, Instagram } from 'lucide-react';
import type { AppPage } from '../../lib/types';

export function Footer({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <footer className="border-t border-white/5 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-neon-500 rounded-lg flex items-center justify-center"><Zap className="w-4 h-4 text-black" /></div>
              <span className="font-black">Resell<span className="text-neon-500">OS</span></span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">Tout ce dont un revendeur a besoin, dans un seul système.</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-4">Produit</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#features" className="hover:text-neon-500 transition-colors">Fonctionnalités</a></li>
              <li><a href="#pricing" className="hover:text-neon-500 transition-colors">Tarifs</a></li>
              <li><button onClick={() => onNavigate('auth')} className="hover:text-neon-500 transition-colors">Connexion</button></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-4">Légal</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#" className="hover:text-neon-500 transition-colors">CGU</a></li>
              <li><a href="#" className="hover:text-neon-500 transition-colors">Confidentialité</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-4">Contact</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> alexisdzikowski14@gmail.com</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">© 2026 Resell OS. Tous droits réservés.</p>
          <div className="flex gap-4">
            <a href="#" className="text-gray-600 hover:text-neon-500 transition-colors"><Twitter className="w-4 h-4" /></a>
            <a href="#" className="text-gray-600 hover:text-neon-500 transition-colors"><Instagram className="w-4 h-4" /></a>
            <a href="#" className="text-gray-600 hover:text-neon-500 transition-colors"><Github className="w-4 h-4" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
