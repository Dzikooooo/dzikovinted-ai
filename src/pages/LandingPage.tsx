import type { AppPage } from '../lib/types';
import { Navbar } from './landing/Navbar';
import { Hero } from './landing/Hero';
import { HeroComparison } from './landing/HeroComparison';
import { ProductPreview } from './landing/ProductPreview';
import { Features } from './landing/Features';
import { Pricing } from './landing/Pricing';
import { FAQ } from './landing/FAQ';
import { CTABanner } from './landing/CTABanner';
import { Footer } from './landing/Footer';

interface LandingPageProps {
  onNavigate: (page: AppPage) => void;
}

// Structure classique, volontairement (2026-08-23) : le concept "Dressing
// ResellOS" est GELE, voir docs/DRESSING_EXPERIENCE.md -- rien n'y est
// perdu, mais la landing revient a un enchainement de sections lisible en
// attendant.
export default function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar onNavigate={onNavigate} />
      <Hero onNavigate={onNavigate} />
      <HeroComparison />
      <ProductPreview />
      <Features />
      <Pricing onNavigate={onNavigate} />
      <FAQ />
      <CTABanner onNavigate={onNavigate} />
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
