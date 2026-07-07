export function Input({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) {
    return (
      <label className="block">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</p>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FFC400]/60"
        />
      </label>
    );
  }
  
  export function ReadOnlyInput({ label, value }: { label: string; value: string }) {
    return (
      <label className="block">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</p>
        <input
          value={value}
          readOnly
          className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none text-[#FFC400]"
        />
      </label>
    );
  }