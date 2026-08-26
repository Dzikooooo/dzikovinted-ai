import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logo } from './Logo';
import { devError } from '../../lib/devLog';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// P-05 (audit pre-beta 2026-08-03) : sans ce composant, AUCUNE erreur de
// rendu React n'etait rattrapable nulle part dans l'app -- la moindre
// exception dans un composant produisait un ecran blanc/noir total, sans
// message ni recours, meme pour un bug mineur et local a une seule page.
// Place a la racine (App.tsx) : rattrape tout ce qui echappe aux Suspense
// (qui ne couvrent que le chargement des chunks lazy, pas les erreurs de
// rendu elles-memes).
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    devError('[ResellOS][ErrorBoundary] erreur de rendu non rattrapee', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-dark-400 text-gray-900 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <Logo variant="square" size={44} className="mx-auto mb-6" />
          <h1 className="text-xl font-black mb-3">Une erreur est survenue</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            Quelque chose s'est mal passé. Recharge la page pour continuer — si le problème persiste, écris-nous à{' '}
            <a href="mailto:resellosapp@gmail.com" className="text-neon-500 hover:underline">resellosapp@gmail.com</a>.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-neon-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-neon-700 transition-all"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
