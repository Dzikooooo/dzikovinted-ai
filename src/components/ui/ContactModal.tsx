import { useState } from 'react';
import { Mail, X } from 'lucide-react';
import { Modal } from './Modal';

// Validation minimale (pas de RFC5322 complet) : suffisant pour attraper
// les fautes de frappe evidentes ("pasunemail") sans bloquer de vraies
// adresses valides -- meme niveau d'exigence que le reste du produit,
// jamais une regex trop stricte qui rejette des cas reels.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactModalProps {
  onClose: () => void;
  title?: string;
  description?: string;
  subject?: string;
  emailLabel?: string;
  showNameField?: boolean;
  showUserCountField?: boolean;
}

// Extrait de BlogPage.tsx (audit personnel utilisateur, 2026-08-02) pour
// etre reutilise par le CTA "Contacter l'equipe" du plan Team -- meme
// composant, contenu adapte par props plutot qu'une copie dupliquee.
export function ContactModal({
  onClose,
  title = 'Envoyer un message',
  description,
  subject = 'Message depuis Resell OS',
  emailLabel = 'Ton email',
  showNameField = false,
  showUserCountField = false,
}: ContactModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [userCount, setUserCount] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const emailTouched = email.trim().length > 0;
  const emailValid = EMAIL_PATTERN.test(email.trim());
  const canSend = emailValid && message.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const encodedSubject = encodeURIComponent(subject);
    const lines = [
      'Message envoyé depuis Resell OS.',
      '',
      ...(showNameField ? [`Nom : ${name.trim() || '-'}`] : []),
      `Email : ${email.trim()}`,
      ...(showUserCountField ? [`Nombre d'utilisateurs envisagé : ${userCount.trim() || '-'}`] : []),
      '',
      message.trim(),
    ];
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href = `mailto:resellosapp@gmail.com?subject=${encodedSubject}&body=${body}`;
    // Ne ferme pas la modale immediatement (2026-08-01, audit beta-testeur) :
    // si l'appareil n'a aucun client mail par defaut associe, rien ne se
    // passe visiblement -- l'utilisateur doit voir une confirmation de son
    // cote plutot qu'une modale qui se referme sans explication, et garder
    // son message sous les yeux au cas ou il doive le recopier a la main.
    setSent(true);
  };

  if (sent) {
    return (
      <Modal onClose={onClose} size="md">
        <div className="text-center py-4">
          <div className="w-12 h-12 bg-neon-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-5 h-5 text-neon-500" />
          </div>
          <h2 className="font-bold text-lg mb-2">Ton client mail s'est ouvert</h2>
          <p className="text-sm text-gray-400 mb-6">
            Vérifie qu'un nouveau message est bien prêt à être envoyé vers resellosapp@gmail.com. Si rien ne s'est
            ouvert, écris-nous directement à cette adresse.
          </p>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300 transition-colors py-2">
            Fermer
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black">{title}</h2>
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/5">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {description && <p className="text-sm text-gray-400 mb-5 leading-relaxed">{description}</p>}

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Destinataire</label>
          <p className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-400">resellosapp@gmail.com</p>
        </div>

        {showNameField && (
          <div>
            <label htmlFor="contact-name" className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Nom</label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ton nom"
              className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
            />
          </div>
        )}

        <div>
          <label htmlFor="contact-email" className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">{emailLabel}</label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            className={`w-full bg-dark-400 border rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:ring-2 transition-all ${
              emailTouched && !emailValid
                ? 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20'
                : 'border-white/10 focus:border-neon-500/40 focus:ring-neon-500/20'
            }`}
          />
          {emailTouched && !emailValid && (
            <p className="text-xs text-red-400 mt-1.5">Cette adresse ne ressemble pas à un email valide.</p>
          )}
        </div>

        {showUserCountField && (
          <div>
            <label htmlFor="contact-user-count" className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">
              Nombre d'utilisateurs envisagé
            </label>
            <input
              id="contact-user-count"
              type="number"
              min={1}
              value={userCount}
              onChange={(e) => setUserCount(e.target.value)}
              placeholder="Ex. 4"
              className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
            />
          </div>
        )}

        <div>
          <label htmlFor="contact-message" className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-2">Message</label>
          <textarea
            id="contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-dark-400 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all min-h-[120px] resize-y"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full bg-neon-600 text-white font-bold py-3 rounded-xl hover:bg-neon-700 hover:shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
        >
          Envoyer
        </button>
        <p className="text-[11px] text-gray-500 text-center">
          Ouvre ton application mail avec le message déjà rempli.
        </p>
      </div>
    </Modal>
  );
}
