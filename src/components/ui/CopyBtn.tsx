import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyBtnProps {
  text: string;
  small?: boolean;
}

export function CopyBtn({ text, small }: CopyBtnProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
      title="Copier"
    >
      {copied ? (
        <Check className={small ? 'w-3 h-3 text-neon-500' : 'w-3.5 h-3.5 text-neon-500'} />
      ) : (
        <Copy className={small ? 'w-3 h-3 text-gray-500' : 'w-3.5 h-3.5 text-gray-500 hover:text-gray-300'} />
      )}
    </button>
  );
}
