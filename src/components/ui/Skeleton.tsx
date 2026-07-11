export type SkeletonShape = 'text' | 'block' | 'circle';

interface SkeletonProps {
  shape?: SkeletonShape;
  className?: string;
}

// Primitif volontairement "bête" : aucune dimension par défaut au-delà de
// la forme (chaque page passe sa propre hauteur via className pour
// préserver exactement ses dimensions actuelles - remplacement 1:1 des
// pulse-blocks existants, pas une nouvelle mise en page).
const SHAPE_CLASSES: Record<SkeletonShape, string> = {
  text: 'rounded h-4',
  block: 'rounded-2xl',
  circle: 'rounded-full',
};

export function Skeleton({ shape = 'block', className = '' }: SkeletonProps) {
  return <div className={`bg-surface animate-pulse ${SHAPE_CLASSES[shape]} ${className}`} />;
}
