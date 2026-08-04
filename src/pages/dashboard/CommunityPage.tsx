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
  Mail,
  type LucideIcon,
} from 'lucide-react';
import type { CommunityTab } from '../../lib/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterPill } from '../../components/ui/FilterPill';
import { ChangelogTab } from './community/ChangelogTab';
import { TutorialsTab } from './community/TutorialsTab';
import { GuidesTab } from './community/GuidesTab';
import { ResourcesTab } from './community/ResourcesTab';
import { FaqTab } from './community/FaqTab';
import { RoadmapTab } from './community/RoadmapTab';
import { PollsTab } from './community/PollsTab';
import { SuggestionsTab } from './community/SuggestionsTab';
import { SupportTab } from './community/SupportTab';
import { DiscordTab } from './community/DiscordTab';
import { ReviewsTab } from './community/ReviewsTab';
import { NewsletterTab } from './community/NewsletterTab';

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
  { key: 'newsletter', label: 'Newsletter', icon: Mail },
  // 'reviews' volontairement absent de cette liste : ReviewsTab.tsx est un
  // placeholder statique ("Bientot disponible"), aucune donnee reelle --
  // le code et la route (activeTab === 'reviews' ci-dessous) restent en
  // place pour la reprise du chantier, mais l'onglet ne doit pas apparaitre
  // dans l'experience beta.
];

// Acces rapide vers les 4 espaces les plus utiles (audit personnel
// utilisateur, 2026-08-04 : "la page parait vide") -- purement une
// navigation raccourcie vers des onglets deja reels, aucune donnee
// inventee, meme logique que QUICK_ACTIONS sur DashboardHome.tsx.
const FEATURED_TABS: { key: CommunityTab; label: string; desc: string; icon: LucideIcon }[] = [
  { key: 'news', label: 'Nouveautés', desc: 'Les derniers changements ResellOS', icon: Megaphone },
  { key: 'suggestions', label: 'Suggestions', desc: 'Propose et vote pour la suite', icon: Lightbulb },
  { key: 'roadmap', label: 'Roadmap', desc: 'Ce qui arrive prochainement', icon: Map },
  { key: 'discord', label: 'Discord', desc: 'Échange en direct', icon: MessageCircle },
];

// Meme mecanisme que SettingsPage.tsx (tab bar + rendu conditionnel
// strict d'un seul onglet a la fois -- jamais de montage cache des
// autres onglets, important une fois que certains onglets porteront un
// canal Realtime, voir le plan §Risques).
export default function CommunityPage({ initialTab }: CommunityPageProps) {
  const [activeTab, setActiveTab] = useState<CommunityTab>(initialTab ?? 'news');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Communauté" description="Nouveautés, tutoriels, roadmap et échanges avec les autres revendeurs." />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {FEATURED_TABS.map(({ key, label, desc, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`text-left bg-surface border rounded-xl p-4 transition-all hover:-translate-y-0.5 ${
              activeTab === key ? 'border-neon-500/30 bg-neon-500/5' : 'border-white/5 hover:border-white/10'
            }`}
          >
            <div className="w-8 h-8 bg-neon-500/10 rounded-lg flex items-center justify-center mb-3">
              <Icon className="w-4 h-4 text-neon-500" />
            </div>
            <p className="text-sm font-semibold text-gray-200">{label}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <FilterPill
            key={key}
            label={label}
            active={activeTab === key}
            onClick={() => setActiveTab(key)}
            icon={<Icon className="w-3.5 h-3.5" />}
          />
        ))}
      </div>

      {activeTab === 'news' && <ChangelogTab />}
      {activeTab === 'tutorials' && <TutorialsTab />}
      {activeTab === 'guides' && <GuidesTab />}
      {activeTab === 'resources' && <ResourcesTab />}
      {activeTab === 'faq' && <FaqTab />}
      {activeTab === 'roadmap' && <RoadmapTab />}
      {activeTab === 'polls' && <PollsTab />}
      {activeTab === 'suggestions' && <SuggestionsTab />}
      {activeTab === 'support' && <SupportTab />}
      {activeTab === 'discord' && <DiscordTab />}
      {activeTab === 'newsletter' && <NewsletterTab />}
      {activeTab === 'reviews' && <ReviewsTab />}
    </div>
  );
}
