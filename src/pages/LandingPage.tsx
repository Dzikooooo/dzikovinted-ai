import { useState } from 'react';
import { Zap, Menu, X, ArrowRight, Star, Users, TrendingUp, Shield, Camera, Sparkles, Check, Quote, Mail, Twitter, Github, Instagram } from 'lucide-react';
import type { AppPage } from '../lib/types';

interface LandingPageProps {
  onNavigate: (page: AppPage) => void;
}

const features = [
  {
    icon: Camera,
    title: 'Annonce IA',
    desc: 'Titre, description, catégorie, taille et état générés automatiquement depuis vos photos.'
  },
  {
    icon: TrendingUp,
    title: 'Pricing Engine',
    desc: 'Estimation intelligente du meilleur prix selon le marché et la demande.'
  },
  {
    icon: Shield,
    title: 'Gestion de stock',
    desc: 'Centralisez tous vos articles et gardez une vue claire de votre inventaire.'
  },
  {
    icon: Star,
    title: 'Dashboard financier',
    desc: 'Suivez votre chiffre d’affaires, vos bénéfices, vos marges et vos performances.'
  },
  {
    icon: Users,
    title: 'Multi-marketplace',
    desc: 'Préparez vos annonces pour Vinted, Leboncoin, eBay et d’autres plateformes.'
  },
  {
    icon: Sparkles,
    title: 'Analytics',
    desc: 'Identifiez les produits les plus rentables et optimisez votre activité.'
  }
];

const testimonials = [
  {
    name: 'Léa Moreau',
    role: 'Revendeuse Vinted × 2 ans',
    avatar: 'LM',
    text: "DzikoVinted m'a fait gagner 3h par semaine. Avant je passais une éternité à rédiger mes annonces. Maintenant c'est 10 secondes, les annonces sont meilleures et je vends plus vite.",
    stars: 5,
  },
  {
    name: 'Maxime Durand',
    role: 'Reseller streetwear',
    avatar: 'MD',
    text: "L'estimation des prix est bluffante. J'utilise la stratégie \"vente rapide\" pour liquider rapidement et le \"prix premium\" pour les pièces rares. Mon CA a augmenté de 40%.",
    stars: 5,
  },
  {
    name: 'Sarah K.',
    role: 'Side hustle vestiaire',
    avatar: 'SK',
    text: "Interface ultra propre, résultats en quelques secondes. Le titre SEO est souvent meilleur que ce que j'aurais écrit moi-même. Je recommande à tous mes amis.",
    stars: 5,
  },
];

const plans = [
  {
    name: 'Free',
    price: '0',
    period: '/mois',
    desc: 'Pour découvrir',
    features: ['10 analyses par mois', '1 photo par annonce', 'Titre + description', 'Prix recommandé', 'Historique 7 jours'],
    cta: 'Commencer gratuitement',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '9,99',
    period: '/mois',
    desc: 'Pour les revendeurs actifs',
    features: ['Analyses illimitées', '10 photos par annonce', 'Tout le plan Free', '3 niveaux de prix', 'Filtres Vinted complets', 'Mots-clés SEO', 'Historique illimité', 'Export CSV'],
    cta: 'Démarrer le Pro',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '29,99',
    period: '/mois',
    desc: 'Pour les équipes',
    features: ['Tout le plan Pro', 'Jusqu\'à 5 utilisateurs', 'Analytiques avancées', 'Mode batch', 'API access', 'Support prioritaire'],
    cta: 'Contacter l\'équipe',
    highlighted: false,
  },
];

function Navbar({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#39FF14] rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black" />
          </div>
         <span className="text-xl font-black tracking-tight">
  Dziko <span className="text-[#39FF14]">Resell OS</span>
</span>
        </button>
        <div className="hidden sm:flex items-center gap-6">
          <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Fonctionnalités</a>
          <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Tarifs</a>
          <button onClick={() => onNavigate('auth')} className="text-sm text-gray-300 hover:text-white transition-colors">Connexion</button>
          <button onClick={() => onNavigate('auth')} className="bg-[#39FF14] text-black text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#50ff30] transition-all duration-200 hover:shadow-[0_0_20px_rgba(57,255,20,0.4)]">
            Essayer gratuitement
          </button>
        </div>
        <button onClick={() => setOpen(!open)} className="sm:hidden p-2 rounded-lg hover:bg-white/5">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="sm:hidden bg-black/95 border-b border-white/5 px-4 py-4 space-y-3">
          <a href="#features" onClick={() => setOpen(false)} className="block text-sm text-gray-400 py-2">Fonctionnalités</a>
          <a href="#pricing" onClick={() => setOpen(false)} className="block text-sm text-gray-400 py-2">Tarifs</a>
          <button onClick={() => { setOpen(false); onNavigate('auth'); }} className="block text-sm text-gray-300 py-2">Connexion</button>
          <button onClick={() => { setOpen(false); onNavigate('auth'); }} className="w-full bg-[#39FF14] text-black text-sm font-bold px-5 py-3 rounded-xl">
            Essayer gratuitement
          </button>
        </div>
      )}
    </nav>
  );
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <Navbar onNavigate={onNavigate} />

      {/* Hero */}
      <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#39FF14]/5 rounded-full blur-[150px]" />
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#39FF14]/10 border border-[#39FF14]/20 rounded-full px-4 py-1.5 mb-8">
            <Sparkles className="w-4 h-4 text-[#39FF14]" />
            <span className="text-sm font-medium text-[#39FF14]">Annonce IA • Stock • Ventes • Analytics</span>
          </div>
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black leading-[1.05] tracking-tight mb-8">
  Le système complet
  <span className="block text-[#39FF14]" style={{ textShadow: '0 0 40px rgba(57,255,20,0.3)' }}>
    du revendeur.
  </span>
</h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
  Photographiez un article. Dziko Resell OS génère votre annonce, estime le meilleur prix,
  gère votre stock, suit vos ventes et analyse vos bénéfices depuis un tableau de bord intelligent.
</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('auth')}
              className="w-full sm:w-auto bg-[#39FF14] text-black font-bold text-lg px-10 py-4 rounded-xl hover:bg-[#50ff30] transition-all duration-300 hover:shadow-[0_0_40px_rgba(57,255,20,0.4)] active:scale-[0.98] flex items-center justify-center gap-3"
            >
              Essayer gratuitement
              <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-sm text-gray-500">Sans carte bancaire · 10 analyses offertes</p>
          </div>
          <div className="mt-16 grid grid-cols-3 max-w-sm mx-auto gap-6">
            {[
  ['+2 400', 'annonces créées'],
  ['+15 000€', 'CA suivi'],
  ['+320h', 'temps économisé']
]].map(([v, l]) => (
              <div key={l} className="text-center">
                <p className="text-2xl font-black text-[#39FF14]" style={{ textShadow: '0 0 20px rgba(57,255,20,0.4)' }}>{v}</p>
                <p className="text-xs text-gray-500 mt-1">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Les modules de Dziko Resell OS</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Annonce IA, gestion de stock, suivi des ventes et analyse financière dans une seule plateforme.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-[#181818] border border-white/5 rounded-2xl p-6 hover:border-[#39FF14]/20 hover:-translate-y-1 transition-all duration-300 group">
                <div className="w-10 h-10 bg-[#39FF14]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#39FF14]/20 transition-colors">
                  <Icon className="w-5 h-5 text-[#39FF14]" />
                </div>
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-[#181818]/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Ils vendent plus vite avec DzikoVinted</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-[#0A0A0A] border border-white/5 rounded-2xl p-6 flex flex-col">
                <Quote className="w-8 h-8 text-[#39FF14]/30 mb-4" />
                <p className="text-gray-300 text-sm leading-relaxed flex-1 mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#39FF14]/10 flex items-center justify-center text-xs font-bold text-[#39FF14]">{t.avatar}</div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {Array.from({ length: t.stars }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-[#39FF14] text-[#39FF14]" />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Des tarifs simples et transparents</h2>
            <p className="text-gray-400">Commence gratuitement. Évolue quand tu veux. Pas de surprise.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div key={plan.name} className={`relative rounded-2xl p-8 flex flex-col border transition-all duration-300 hover:-translate-y-1 ${plan.highlighted ? 'bg-[#181818] border-[#39FF14]/30 shadow-[0_0_60px_rgba(57,255,20,0.1)] md:scale-105' : 'bg-[#181818] border-white/5'}`}>
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#39FF14] text-black text-xs font-bold px-4 py-1 rounded-full">Le plus populaire</div>
                )}
                <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                <p className="text-xs text-gray-500 mb-4">{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-black">{plan.price} €</span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-[#39FF14]' : 'text-gray-600'}`} />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onNavigate('auth')}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${plan.highlighted ? 'bg-[#39FF14] text-black hover:bg-[#50ff30] hover:shadow-[0_0_30px_rgba(57,255,20,0.3)]' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#39FF14]/5" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Prêt à vendre plus vite ?</h2>
          <p className="text-gray-400 mb-8">Rejoins 2 400+ revendeurs qui génèrent leurs annonces en 10 secondes.</p>
          <button
            onClick={() => onNavigate('auth')}
            className="bg-[#39FF14] text-black font-bold text-lg px-10 py-4 rounded-xl hover:bg-[#50ff30] transition-all duration-300 hover:shadow-[0_0_40px_rgba(57,255,20,0.4)] inline-flex items-center gap-3"
          >
            Créer mon compte gratuitement <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-[#39FF14] rounded-lg flex items-center justify-center"><Zap className="w-4 h-4 text-black" /></div>
                <span className="font-black">Dziko<span className="text-[#39FF14]">Resell OS</span></span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">IA spécialisée pour générer vos annonces Vinted en quelques secondes.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#features" className="hover:text-[#39FF14] transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-[#39FF14] transition-colors">Tarifs</a></li>
                <li><button onClick={() => onNavigate('auth')} className="hover:text-[#39FF14] transition-colors">Connexion</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-[#39FF14] transition-colors">CGU</a></li>
                <li><a href="#" className="hover:text-[#39FF14] transition-colors">Confidentialité</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> hello@dzikovinted.fr</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">© 2026 DzikoVinted. Tous droits réservés.</p>
            <div className="flex gap-4">
              <a href="#" className="text-gray-600 hover:text-[#39FF14] transition-colors"><Twitter className="w-4 h-4" /></a>
              <a href="#" className="text-gray-600 hover:text-[#39FF14] transition-colors"><Instagram className="w-4 h-4" /></a>
              <a href="#" className="text-gray-600 hover:text-[#39FF14] transition-colors"><Github className="w-4 h-4" /></a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
