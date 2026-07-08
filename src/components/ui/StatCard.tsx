interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  size?: 'sm' | 'lg';
}

export function StatCard({ label, value, highlight, size = 'sm' }: StatCardProps) {
  if (size === 'lg') {
    return (
      <div className="bg-surface-alt border border-white/10 rounded-2xl p-5">
        <p className="text-gray-500 text-sm">{label}</p>
        <h3 className="text-neon-500 text-3xl font-black mt-2">{value}</h3>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-white/5 rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className={`text-xl font-black ${highlight ? 'text-neon-500' : 'text-gray-100'}`}>
        {value}
      </p>
    </div>
  );
}
