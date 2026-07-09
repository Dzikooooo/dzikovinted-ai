interface AccountAvatarProps {
  label: string;
  size?: 'sm' | 'md';
  /** Force la teinte de marque (neon) au lieu de la couleur derivee du label — reserve a l'identite ResellOS de l'utilisateur, distincte des comptes Vinted qui doivent rester visuellement differenciables entre eux. */
  brand?: boolean;
}

const BRAND_COLOR = { bg: 'bg-neon-500/10', text: 'text-neon-500' };

const PALETTE = [
  BRAND_COLOR,
  { bg: 'bg-blue-400/10', text: 'text-blue-400' },
  { bg: 'bg-purple-400/10', text: 'text-purple-400' },
  { bg: 'bg-emerald-400/10', text: 'text-emerald-400' },
  { bg: 'bg-pink-400/10', text: 'text-pink-400' },
  { bg: 'bg-orange-400/10', text: 'text-orange-400' },
];

function colorFor(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function AccountAvatar({ label, size = 'sm', brand = false }: AccountAvatarProps) {
  const { bg, text } = brand ? BRAND_COLOR : colorFor(label);
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';

  return (
    <div className={`${sizeClasses} rounded-full ${bg} flex items-center justify-center font-bold ${text} flex-shrink-0`}>
      {label.charAt(0).toUpperCase()}
    </div>
  );
}
