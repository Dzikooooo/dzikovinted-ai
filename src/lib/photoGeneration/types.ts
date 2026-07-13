// Architecture de preparation uniquement (Partie 5, sprint extension V1) --
// aucune implementation reelle de generation IA n'existe encore derriere.
// Les 4 styles (Fond blanc/Studio/Bois/Lifestyle) restent des boutons
// desactives dans UploadStep.tsx (etat honnete depuis la Phase 8) : ce
// module ne change rien de visible, il pose juste l'interface qu'un vrai
// fournisseur pourra implementer plus tard sans toucher au Generateur ni a
// EditListingModal.
//
// Workflow futur vise : photos originales -> choix du style -> generation
// IA -> previsualisation -> validation utilisateur -> synchronisation avec
// Vinted. Chaque etape ci-dessus reste un flux ResellOS classique une fois
// le provider branche -- rien de nouveau a construire cote extension
// (l'extension ne fait toujours que preremplir/afficher, jamais de calcul).

export type PhotoStyle = 'white' | 'studio' | 'wood' | 'lifestyle';

export interface PhotoGenerationRequest {
  sourceImageUrls: string[];
  style: PhotoStyle;
}

export interface PhotoGenerationResult {
  previewUrls: string[];
}

export interface PhotoGenerationProvider {
  generate(request: PhotoGenerationRequest): Promise<PhotoGenerationResult>;
}
