import { CopyBtn } from './CopyBtn';

interface FieldCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
}

export function FieldCard({ label, value, icon: Icon }: FieldCardProps) {
  return (
    <div className="bg-dark-400 border border-white/5 rounded-xl p-4 hover:border-neon-500/20 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-neon-500/60" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-neon-500/60">{label}</span>
        </div>
        <CopyBtn text={value} small />
      </div>
      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}
