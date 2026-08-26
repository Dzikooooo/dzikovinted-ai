import { useState, type ReactNode } from 'react';
import { BookOpen, LifeBuoy, Map, type LucideIcon } from 'lucide-react';
import type { CommunityTab } from '../../lib/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { DiscordIcon } from '../../components/ui/DiscordIcon';
import { ChangelogTab } from './community/ChangelogTab';
import { GuidesTab } from './community/GuidesTab';
import { FaqTab } from './community/FaqTab';
import { RoadmapTab } from './community/RoadmapTab';
import { SuggestionsTab } from './community/SuggestionsTab';
import { SupportTab } from './community/SupportTab';
import { DiscordTab } from './community/DiscordTab';

interface CommunityPageProps {
  initialTab?: CommunityTab;
}

// Refonte 2026-08-26 -- 11 onglets ramenes a 4 PILIERS.
//
// Ce que la version precedente faisait de travers : elle affichait DEUX
// navigations superposees (4 grandes cartes "acces rapide", puis une barre de
// 11 pastilles juste en dessous), dont l'une etait un sous-ensemble de
// l'autre. Le membre devait comprendre le rapport entre les deux avant de
// pouvoir cliquer. Et le decoupage refletait la structure interne du contenu
// (un onglet par CommunityContentType) plutot que ce qu'on vient y chercher.
//
// Desormais les cartes SONT la navigation -- il n'en reste qu'une seule.
//
// Certains piliers regroupent plusieurs vues existantes, empilees sous des
// intertitres plutot que derriere une seconde barre d'onglets (ce serait
// exactement le defaut qu'on retire). Les composants sont reutilises tels
// quels, aucun n'est reecrit.
const PILLARS: { key: CommunityTab; label: string; desc: string; icon: LucideIcon | typeof DiscordIcon }[] = [
  { key: 'discord', label: 'Discord', desc: 'Activité live et accès aux salons', icon: DiscordIcon },
  { key: 'news', label: 'Nouveautés & Roadmap', desc: 'Ce qui vient de sortir et ce qui arrive', icon: Map },
  { key: 'guides', label: 'Guides & FAQ', desc: 'Comment faire, et les questions fréquentes', icon: BookOpen },
  { key: 'support', label: 'Support', desc: 'Tes tickets et l\'aide directe', icon: LifeBuoy },
];

// Intertitre des sous-sections empilees. Volontairement discret : il separe,
// il ne concurrence pas le titre de page.
function PillarSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// Rendu conditionnel STRICT d'un seul pilier a la fois -- jamais de montage
// cache des autres : plusieurs de ces vues ouvrent leur propre requete au
// montage, et certaines porteront un canal Realtime.
function PillarContent({ tab }: { tab: CommunityTab }) {
  if (tab === 'discord') return <DiscordTab />;

  if (tab === 'news') {
    return (
      <div className="space-y-12">
        <PillarSection title="Nouveautés" description="Les derniers changements livrés dans ResellOS.">
          <ChangelogTab />
        </PillarSection>
        <PillarSection title="Roadmap" description="Ce qui est en cours et ce qui arrive ensuite.">
          <RoadmapTab />
        </PillarSection>
        <PillarSection title="Suggestions" description="Propose une idée et vote pour celles des autres.">
          <SuggestionsTab />
        </PillarSection>
      </div>
    );
  }

  if (tab === 'guides') {
    return (
      <div className="space-y-12">
        <PillarSection title="Guides" description="La documentation pratique du revendeur.">
          <GuidesTab />
        </PillarSection>
        <PillarSection title="Questions fréquentes">
          <FaqTab />
        </PillarSection>
      </div>
    );
  }

  return <SupportTab />;
}

export default function CommunityPage({ initialTab }: CommunityPageProps) {
  const [activeTab, setActiveTab] = useState<CommunityTab>(initialTab ?? 'discord');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Communauté"
        description="Nouveautés, roadmap, guides et échanges avec les autres revendeurs."
      />

      {/* Les cartes SONT la barre d'onglets : semantique explicite, sinon un
          lecteur d'ecran n'annonce que quatre boutons sans dire lequel est
          actif ni qu'ils pilotent la meme zone. */}
      <div
        role="tablist"
        aria-label="Espaces de la communauté"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8"
      >
        {PILLARS.map(({ key, label, desc, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(key)}
              className={`text-left bg-surface border rounded-xl p-4 transition-all hover:-translate-y-0.5 ${
                isActive
                  ? 'border-neon-500 ring-2 ring-neon-500/20 bg-neon-500/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="w-8 h-8 bg-neon-500/10 rounded-lg flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-neon-500" />
              </div>
              <p className="text-sm font-semibold text-gray-800">{label}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
            </button>
          );
        })}
      </div>

      <PillarContent tab={activeTab} />
    </div>
  );
}
