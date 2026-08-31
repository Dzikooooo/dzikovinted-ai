import type { AppPage } from '../lib/types';
import { Navbar } from './landing/Navbar';
import { Hero } from './landing/Hero';
import { HeroComparison } from './landing/HeroComparison';
import { Features } from './landing/Features';
import { Pricing } from './landing/Pricing';
import { FAQ } from './landing/FAQ';
import { Founder } from './landing/Founder';
import { CTABanner } from './landing/CTABanner';
import { Footer } from './landing/Footer';

interface LandingPageProps {
  onNavigate: (page: AppPage) => void;
}

// Structure classique, volontairement (2026-08-23) : le concept "Dressing
// ResellOS" est GELE, voir docs/DRESSING_EXPERIENCE.md -- rien n'y est
// perdu, mais la landing revient a un enchainement de sections lisible en
// attendant.
//
// ProductPreview retire (2026-08-29, retour d'un pro du design web) :
// dupliquait ~80% du contenu de Features juste en dessous -- meme 5-6
// modules, deux emballages visuels differents, l'un derriere l'autre.
// Features porte desormais seule la preuve detaillee, avec de vrais
// ecrans (voir son propre commentaire d'en-tete).
export default function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar onNavigate={onNavigate} />
      <Hero onNavigate={onNavigate} />
      <HeroComparison />
      <Features />
      <Founder />
      <FAQ />
      <Pricing onNavigate={onNavigate} />
      <CTABanner onNavigate={onNavigate} />
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
