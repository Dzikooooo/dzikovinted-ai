import { Quote } from 'lucide-react';

const testimonials = [
  {
    name: '+2400',
    role: 'annonces générées',
    text: 'Resell OS a déjà généré plus de 2400 annonces pendant la phase bêta.',
  },
  {
    name: '+500',
    role: 'CA suivi',
    text: 'Plus de 500€ de ventes ont déjà été suivies via la plateforme.',
  },
  {
    name: '+320h',
    role: 'temps économisé',
    text: 'Les premiers utilisateurs ont économisé des centaines d’heures grâce à l’automatisation.',
  },
];

export function Testimonials() {
  return (
    <section className="py-24 bg-surface/40">
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
              className="bg-dark-400 border border-white/5 rounded-2xl p-6 flex flex-col"
            >
              <Quote className="w-8 h-8 text-neon-500/30 mb-4" />

              <p className="text-gray-300 text-sm leading-relaxed flex-1 mb-6">
                "{t.text}"
              </p>

              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-neon-500/10 border border-neon-500/20 flex items-center justify-center">
                  <span className="text-neon-500 font-black">
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
  );
}
