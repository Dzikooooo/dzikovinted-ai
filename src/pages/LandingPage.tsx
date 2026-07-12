import type { AppPage } from '../lib/types';
import { Navbar } from './landing/Navbar';
import { Hero } from './landing/Hero';
import { ProductPreview } from './landing/ProductPreview';
import { Features } from './landing/Features';
import { Pricing } from './landing/Pricing';
import { CTABanner } from './landing/CTABanner';
import { Footer } from './landing/Footer';

interface LandingPageProps {
  onNavigate: (page: AppPage) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-dark-400 text-white">
      <Navbar onNavigate={onNavigate} />
      <Hero onNavigate={onNavigate} />
      <ProductPreview />
      <Features />
      <Pricing onNavigate={onNavigate} />
      <CTABanner onNavigate={onNavigate} />
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
