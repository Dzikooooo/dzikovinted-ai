import { useState } from 'react';
import {
  Megaphone,
  GraduationCap,
  BookOpen,
  FolderDown,
  Map,
  BarChart2,
  Lightbulb,
  HelpCircle,
  LifeBuoy,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import type { CommunityTab } from '../../lib/types';
import { EmptyState } from '../../components/ui/EmptyState';
import { ChangelogTab } from './community/ChangelogTab';
import { TutorialsTab } from './community/TutorialsTab';
import { GuidesTab } from './community/GuidesTab';
import { ResourcesTab } from './community/ResourcesTab';
import { FaqTab } from './community/FaqTab';
import { DiscordTab } from './community/DiscordTab';

interface CommunityPageProps {
  initialTab?: CommunityTab;
}

const TABS: { key: CommunityTab; label: string; icon: LucideIcon }[] = [
  { key: 'news', label: 'Nouveautés', icon: Megaphone },
  { key: 'tutorials', label: 'Tutoriels', icon: GraduationCap },
  { key: 'guides', label: 'Guides', icon: BookOpen },
  { key: 'resources', label: 'Ressources', icon: FolderDown },
  { key: 'roadmap', label: 'Roadmap', icon: Map },
  { key: 'polls', label: 'Sondages', icon: BarChart2 },
  { key: 'suggestions', label: 'Suggestions', icon: Lightbulb },
  { key: 'faq', label: 'FAQ', icon: HelpCircle },
  { key: 'support', label: 'Support', icon: LifeBuoy },
  { key: 'discord', label: 'Discord', icon: MessageCircle },
];

// Onglets pas encore construits (Lots 2 a 6 du chantier Communaute, voir
// le plan) -- EmptyState honnete plutot qu'un lien mort ou une page
// cassee. Retire de cette liste au fur et a mesure des lots.
const COMING_SOON: Partial<Record<CommunityTab, string>> = {
  roadmap: 'La roadmap publique arrivera bientôt ici.',
  polls: 'Les sondages arriveront bientôt ici.',
  suggestions: 'Les suggestions de la communauté arriveront bientôt ici.',
  support: 'Le support par tickets arrivera bientôt ici.',
};

// Meme mecanisme que SettingsPage.tsx (tab bar + rendu conditionnel
// strict d'un seul onglet a la fois -- jamais de montage cache des
// autres onglets, important une fois que certains onglets porteront un
// canal Realtime, voir le plan §Risques).
export default function CommunityPage({ initialTab }: CommunityPageProps) {
  const [activeTab, setActiveTab] = useState<CommunityTab>(initialTab ?? 'news');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-2">Communauté</h1>
        <p className="text-gray-400 text-sm">Nouveautés, tutoriels, roadmap et échanges avec les autres revendeurs.</p>
      </div>

      <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
              activeTab === key ? 'bg-neon-500/10 text-neon-500 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'news' && <ChangelogTab />}
      {activeTab === 'tutorials' && <TutorialsTab />}
      {activeTab === 'guides' && <GuidesTab />}
      {activeTab === 'resources' && <ResourcesTab />}
      {activeTab === 'faq' && <FaqTab />}
      {activeTab === 'discord' && <DiscordTab />}
      {COMING_SOON[activeTab] && (
        <EmptyState
          icon={TABS.find((t) => t.key === activeTab)?.icon ?? Megaphone}
          title="Bientôt disponible"
          description={COMING_SOON[activeTab]}
        />
      )}
    </div>
  );
}
