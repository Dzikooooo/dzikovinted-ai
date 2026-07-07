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
    title:'Estimation IA',
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
    title: 'Multi-marketplace (Bientôt)',
    desc: 'Publiez vos annonces sur plusieurs marketplaces depuis une seule interface.'
  },
  {
    icon: Sparkles,
    title: 'Analytics',
    desc: 'Identifiez les produits les plus rentables et optimisez votre activité.'
  }
];

const testimonials = [
  {
    name: '+2400',
    role: 'annonces générées',
    avatar: '',
    text: 'Resell OS a déjà généré plus de 2400 annonces pendant la phase bêta.',
    stars: 5,
  },
  {
    name: '+500',
    role: 'CA suivi',
    avatar: '',
    text: 'Plus de 500€ de ventes ont déjà été suivies via la plateforme.',
    stars: 5,
  },
  {
    name: '+320h',
    role: 'temps économisé',
    avatar: '',
    text: 'Les premiers utilisateurs ont économisé des centaines d’heures grâce à l’automatisation.',
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
    features: ['Analyses illimitées', '10 photos par annonce', 'Tout le plan Free', 'Estimation IA des prix', 'Filtres marketplace avancés', 'Mots-clés SEO', 'Historique illimité', 'Export CSV'],
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
active:scale-[0.98] bg-[#FFC400] flex items-center justify-center shadow-[0_0_30px_rgba(255,196,0,0.25)]">
              <Zap className="w-5 h-5 text-black" />
            </div>

            <div className="flex items-end">
              <span className="text-[1.65rem] font-black tracking-tight text-white leading-none">
                RESELL
              </span>

              <span className="ml-1 text-[#FFC400] text-[1.25rem] font-black leading-none mb-[2px]">
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
              className="bg-[#FFC400] text-black font-bold px-7 py-3 rounded-2xl hover:bg-[#D89B00] hover:shadow-[0_0_35px_rgba(255,196,0,.35)] transition-all duration-300 hover:scale-[1.02]"
            >
              Commencer
            </button>

          </div>

          {/* Mobile */}

          <button
            onClick={() => setOpen(!open)}
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
              className="w-full bg-[#FFC400] text-black font-bold py-3 rounded-2xl"
            >
              Commencer
            </button>

          </div>
        )}

      </div>
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#FFC400]/5 rounded-full blur-[150px]" />
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400]/20 bg-[#FFC400]/10 px-5 py-2" >
            <Sparkles className="w-4 h-4 text-[#FFC400]" />
            <span className="text-sm font-semibold text-[#FFC400]">
Plateforme tout-en-un pour revendeurs
</span>
          </div>
    
          <h1 className="mt-8 text-6xl md:text-8xl font-black tracking-tight leading-none mb-10">
  Le système complet
  <span className="block text-[#FFC400]" style={{ textShadow: '0 0 40px rgba(255,196,0,0.22)' }}>
    du revendeur.
  </span>
</h1>
<p className="mt-8 max-w-3xl mx-auto text-xl leading-9 text-zinc-400 mb-14">
 Prenez une photo de votre article. Resell OS génère automatiquement
une annonce optimisée, estime le meilleur prix et met à jour votre stock en quelques secondes.
</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('auth')}
              className="group w-full sm:w-auto bg-[#FFC400] text-black font-bold text-lg px-10 py-5 rounded-2xl transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] hover:bg-[#FFD54A] hover:shadow-[0_20px_60px_rgba(255,196,0,.35)]"
            >
              <span className="flex items-center gap-3">
  Commencer gratuitement
  <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
</span>
            </button>
            <p className="text-sm text-gray-500">Sans carte bancaire · 10 analyses offertes</p>
          </div>
          <div className="mt-16 grid grid-cols-3 max-w-sm mx-auto gap-6">
        {[
  ['+2 400', 'annonces générées'],
  ['+500€', 'CA suivi'],
  ['+320h', 'temps économisé']
].map(([v, l]) => (
              <div key={l} className="text-center">
                <p
  className="text-2xl font-black text-[#FFC400] whitespace-nowrap"
  style={{ textShadow: "0 0 40px rgba(255,196,0,.25)" }}
>
  {v}
</p>
                <p className="text-xs text-gray-500 mt-1">{l}</p>
              </div>
            ))}
          </div>
          <div className="mt-16 max-w-5xl mx-auto bg-[#181818] border border-white/10 rounded-3xl p-6 shadow-[0_0_80px_shadow-[0_0_80px_rgba(255,196,0,0.08)]">
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

    <div className="bg-black/60 rounded-2xl p-5 border border-white/10">
      <p className="text-xs text-gray-500 mb-3"> Photo importée</p>

      <div className="aspect-square rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] bg-[#FFC400]/10 border border-[#FFC400]/20 flex items-center justify-center">
        <Camera className="w-10 h-10 text-[#FFC400]" />
      </div>

      <p className="text-sm text-gray-400 mt-4">
        Nike Hoodie • Taille M
      </p>
    </div>

    <div className="bg-black/60 rounded-2xl p-5 border border-white/10">
      <p className="text-xs text-gray-500 mb-3">
         Annonce générée
      </p>

      <h3 className="font-bold text-white mb-2">
        Sweat Nike noir oversize
      </h3>

      <p className="text-sm text-gray-400 leading-relaxed">
        Sweat Nike noir en très bon état, coupe oversize,
        idéal streetwear. Parfait pour un look casual.
      </p>

      <div className="mt-4 flex gap-2">
        <span className="text-xs bg-[#FFC400]/10 text-[#FFC400] px-3 py-1 rounded-full">
          SEO
        </span>

        <span className="text-xs bg-[#FFC400]/10 text-[#FFC400] px-3 py-1 rounded-full">
          Auto
        </span>
      </div>
    </div>

    <div className="bg-black/60 rounded-2xl p-5 border border-white/10">
      <p className="text-xs text-gray-500 mb-3">
        Dashboard
      </p>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Prix conseillé</span>
          <span className="text-[#FFC400] font-bold">
            34,90€
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Marge estimée</span>
          <span className="font-bold text-white">
            +18€
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Stock actif</span>
          <span className="font-bold text-white">
            42 articles
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">CA du mois</span>
          <span className="font-bold text-white">
            1 240€
          </span>
        </div>
      </div>
    </div>

  </div>
</div>
        </div>
            </section>

     {/* Product Preview */}
<section className="pt-24 pb-10 relative overflow-hidden">
  <div className="absolute inset-x-0 top-10 mx-auto h-72 w-[70%] bg-[#FFC400]/10 blur-[140px] pointer-events-none" />

  <div className="relative max-w-7xl mx-auto px-4">
    <div className="text-center mb-16">
      <p className="text-[#FFC400] font-bold text-sm tracking-[0.25em] mb-4">
        APERÇU DE LA PLATEFORME
      </p>

      <h2 className="text-4xl sm:text-6xl font-black tracking-tight leading-none">
        Un seul dashboard.
        <br />
        Toute votre activité.
      </h2>

      <p className="mt-6 text-gray-400 max-w-3xl mx-auto text-lg leading-8">
        Créez vos annonces, estimez vos prix, détectez les meilleures opportunités
        et pilotez votre business depuis une seule interface.
      </p>
    </div>

    <div className="relative rounded-[36px] border border-[#FFC400]/25 bg-gradient-to-b from-[#1A1A1A] to-[#0B0B0B] p-3 shadow-[0_50px_140px_rgba(0,0,0,.7),0_0_80px_rgba(255,196,0,.08)] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_60px_160px_rgba(0,0,0,.8),0_0_120px_rgba(255,196,0,.12)]">
    <div className="absolute -inset-px rounded-[36px] bg-gradient-to-r from-transparent via-[#FFC400]/30 to-transparent opacity-30 pointer-events-none" />
      <div className="rounded-[28px] border border-white/10 bg-black overflow-hidden">

        <div className="h-12 border-b border-white/10 flex items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
            <span className="w-3 h-3 rounded-full bg-[#FFC400]/80" />
          </div>

          <div className="text-xs text-gray-500">
            app.resellos.com/dashboard
          </div>

          <div className="w-16" />
        </div>

        <div className="grid lg:grid-cols-[240px_1fr] min-h-[520px]">
          <aside className="hidden lg:block border-r border-white/10 p-6">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-9 h-9 rounded-xl bg-[#FFC400] flex items-center justify-center">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div className="font-black">
                <span>Resell</span>
                <span className="text-[#FFC400] ml-1">OS</span>
              </div>
            </div>

            <div className="space-y-2">
              {["Dashboard", "Générateur IA", "Marché", "Opportunités", "Stock", "Statistiques"].map((item, index) => (
                <div
                  key={item}
                  className={`px-4 py-3 rounded-xl text-sm ${
                    index === 0
                      ? "bg-[#FFC400]/10 text-[#FFC400]"
                      : "text-gray-500"
                  }`}
                >
                  {item}
                </div>
              ))}
            </div>
          </aside>

          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
              <div>
                <h3 className="text-3xl sm:text-4xl font-black tracking-tight">
                  Bonjour, <span className="text-[#FFC400]">jean</span>
                </h3>
                <p className="text-gray-500 mt-2">
                  Voici un aperçu de votre activité Resell OS.
                </p>
              </div>

              <button className="bg-[#FFC400] text-black font-bold rounded-2xl px-5 py-3">
                Nouvelle annonce
              </button>
            </div>

            <div className="rounded-3xl bg-[#171717] border border-white/10 p-6 mb-6">
  <div className="flex items-center justify-between mb-5">
    <div className="w-full">
      <p className="font-bold mb-3">Crédits restants</p>

      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full w-[40%] bg-gradient-to-r from-[#FFC400] to-white rounded-full" />
      </div>

      <p className="mt-4 text-3xl font-black">
        4 <span className="text-gray-500 text-lg font-medium">/10 ce mois</span>
      </p>
    </div>
  </div>
</div>

<div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              {[
                ["1", "Annonces générées"],
                ["FREE", "Plan actuel"],
                ["0", "Favoris"],
                ["35 EUR", "Revenus estimés"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-[#171717] border border-white/10 p-5"
                >
                  <p className="text-2xl font-black">{value}</p>
                  <p className="text-gray-500 text-sm mt-2">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {[
                ["Générer une annonce", "Upload des photos et génère."],
                ["Mes annonces", "Retrouve tes annonces sauvegardées."],
                ["Statistiques", "Suis tes performances et revenus."],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl bg-[#171717] border border-white/10 p-5"
                >
                  <h4 className="font-bold">{title}</h4>
                  <p className="text-gray-500 text-sm mt-2">{desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#171717] border border-white/10 p-5 flex items-center justify-between">
              <div>
                <p className="font-bold">Polo Ralph Lauren homme bleu marine taille L</p>
                <p className="text-gray-500 text-sm mt-1">Ralph Lauren · 25 juin</p>
              </div>
              <p className="text-[#FFC400] font-black">35 EUR</p>
              </div> {/* dernière carte */}

</div> {/* contenu principal */}

</div> {/* grid */}

</div> {/* rounded-[28px] */}

</div> {/* rounded-[36px] */}

</div> {/* max-w-7xl */}

</section>


      {/* Features */}
      <section id="features" className="py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Tout ce dont vous avez besoin pour revendre.</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Annonce IA, gestion de stock, suivi des ventes et analyse financière dans une seule plateforme.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
        
            
            <div
              key={title}
          
              
               className="group relative overflow-hidden rounded-3xl bg-[#151515] border border-white/5 p-8 transition-all duration-500 hover:-translate-y-2 hover:border-[#FFC400]/30 hover:shadow-[0_25px_70px_rgba(255,196,0,.08)]"
            >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-[#FFC400]/5 via-transparent to-transparent" />
                <div className="w-12 h-12 bg-[#FFC400]/8 rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] flex items-center justify-center mb-4 group-hover:bg-[#FFC400]/15 transition-colors">
                  <Icon className="w-5 h-5 text-[#FFC400]" />
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
      <h2 className="text-3xl sm:text-4xl font-black mb-4">
        Les premiers résultats de la bêta
      </h2>

      <p className="text-gray-400 max-w-2xl mx-auto mb-12">
        Les premiers revendeurs utilisent déjà Resell OS.
        Les retours détaillés arriveront après la phase bêta.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {testimonials.map((t) => (
        <div
          key={t.name}
          className="bg-[#0A0A0A] border border-white/5 rounded-2xl p-6 flex flex-col"
        >
          <Quote className="w-8 h-8 text-[#FFC400]/30 mb-4" />

          <p className="text-gray-300 text-sm leading-relaxed flex-1 mb-6">
            "{t.text}"
          </p>

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FFC400]/10 border border-[#FFC400]/20 flex items-center justify-center">
              <span className="text-[#FFC400] font-black">
                {t.name}
              </span>
            </div>

            <div>
              <p className="text-sm font-semibold">{t.name}</p>
              <p className="text-xs text-gray-500">{t.role}</p>
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
              <div key={plan.name} className={`relative rounded-2xl p-8 flex flex-col border transition-all duration-300 hover:-translate-y-1 ${plan.highlighted ? 'bg-[#181818] border-[#FFC400]/30 shadow-[0_0_60px_rgba(255,196,0,0.08)] md:scale-105' : 'bg-[#181818] border-white/5'}`}>
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#FFC400] text-black text-xs font-bold px-4 py-1 rounded-full">Le plus populaire</div>
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
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-[#FFC400]' : 'text-gray-600'}`} />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onNavigate('auth')}
                  className={`w-full py-3 rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] font-semibold text-sm transition-all duration-200 ${plan.highlighted ? 'bg-[#FFC400] text-black hover:bg-[#D89B00] hover:shadow-[0_0_30px_rgba(57,255,20,0.3)]' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
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
        <div className="absolute inset-0 bg-[#FFC400]/5" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Prêt à développer votre activité ?</h2>
          <p className="text-gray-400 mb-8">Rejoins les revendeurs qui automatisent leurs annonces, suivent leurs ventes et pilotent leur activité depuis une seule plateforme.</p>
          <button
            onClick={() => onNavigate('auth')}
            className="bg-[#FFC400] text-black font-bold text-lg px-10 py-4 rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] hover:bg-[#D89B00] transition-all duration-300 hover:shadow-[0_0_40px_rgba(255,196,0,0.3)] inline-flex items-center gap-3"
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
                <div className="w-7 h-7 bg-[#FFC400] rounded-lg flex items-center justify-center"><Zap className="w-4 h-4 text-black" /></div>
                <span className="font-black">Resell<span className="text-[#FFC400]">OS</span></span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">Tout ce dont un revendeur a besoin, dans un seul système.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#features" className="hover:text-[#FFC400] transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-[#FFC400] transition-colors">Tarifs</a></li>
                <li><button onClick={() => onNavigate('auth')} className="hover:text-[#FFC400] transition-colors">Connexion</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-[#FFC400] transition-colors">CGU</a></li>
                <li><a href="#" className="hover:text-[#FFC400] transition-colors">Confidentialité</a></li>
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
              <a href="#" className="text-gray-600 hover:text-[#FFC400] transition-colors"><Twitter className="w-4 h-4" /></a>
              <a href="#" className="text-gray-600 hover:text-[#FFC400] transition-colors"><Instagram className="w-4 h-4" /></a>
              <a href="#" className="text-gray-600 hover:text-[#FFC400] transition-colors"><Github className="w-4 h-4" /></a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
