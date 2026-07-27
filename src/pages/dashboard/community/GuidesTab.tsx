import { BookOpen } from 'lucide-react';
import { GroupedContentTab } from './GroupedContentTab';

export function GuidesTab() {
  return (
    <GroupedContentTab
      type="guide"
      icon={BookOpen}
      introText="La documentation de référence de ResellOS."
      createLabel="Publier un guide"
      emptyTitle="Aucun guide pour l'instant"
      emptyDescription="La documentation ResellOS apparaîtra ici."
    />
  );
}
