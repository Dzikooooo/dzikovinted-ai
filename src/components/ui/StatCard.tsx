interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  size?: 'sm' | 'lg';
}

export function StatCard({ label, value, highlight, size = 'sm' }: StatCardProps) {
  if (size === 'lg') {
    return (
      <div
        className={`bg-surface-alt border rounded-2xl p-5 transition-all hover:border-white/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${highlight ? 'border-neon-500/30 shadow-[0_0_25px_rgba(255,196,0,0.1)]' : 'border-white/10'}`}
      >
        <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</p>
        <h3 className="text-neon-500 text-3xl font-black mt-2">{value}</h3>
      </div>
    );
  }

  return (
    <div
      className={`bg-surface border rounded-2xl p-4 transition-all hover:border-white/10 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] ${highlight ? 'border-neon-500/20 shadow-[0_0_20px_rgba(255,196,0,0.08)]' : 'border-white/5'}`}
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className={`text-xl font-black ${highlight ? 'text-neon-500' : 'text-gray-100'}`}>
        {value}
      </p>
    </div>
  );
}
