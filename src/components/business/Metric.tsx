export default function Metric({ label, value }: { label: string; value: string }) {
    return (
      <div className="bg-[#171717] border border-white/5 rounded-3xl p-6">
        <p className="text-gray-500 text-sm">{label}</p>
        <h3 className="text-3xl font-black mt-2">{value}</h3>
      </div>
    );
  }