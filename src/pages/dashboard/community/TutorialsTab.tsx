import { GraduationCap } from 'lucide-react';
import { GroupedContentTab } from './GroupedContentTab';

export function TutorialsTab() {
  return (
    <GroupedContentTab
      type="tutorial"
      icon={GraduationCap}
      introText="Apprends à tirer le meilleur de ResellOS, étape par étape."
      createLabel="Publier un tutoriel"
      emptyTitle="Aucun tutoriel pour l'instant"
      emptyDescription="Les prochains tutoriels ResellOS apparaîtront ici."
    />
  );
}
