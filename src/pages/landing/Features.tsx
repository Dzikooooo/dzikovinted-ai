import { Camera, TrendingUp, Shield, Star, Users, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Camera,
    title: 'Annonce IA',
    desc: 'Titre, description, catégorie, taille et état générés automatiquement depuis vos photos.'
  },
  {
    icon: TrendingUp,
    title: 'Estimation IA',
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

export function Features() {
  return (
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
             className="group relative overflow-hidden rounded-3xl bg-[#151515] border border-white/5 p-8 transition-all duration-500 hover:-translate-y-2 hover:border-neon-500/30 hover:shadow-[0_25px_70px_rgba(255,196,0,.08)]"
          >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-neon-500/5 via-transparent to-transparent" />
              <div className="w-12 h-12 bg-neon-500/8 rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] flex items-center justify-center mb-4 group-hover:bg-neon-500/15 transition-colors">
                <Icon className="w-5 h-5 text-neon-500" />
              </div>
              <h3 className="font-bold mb-2">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
