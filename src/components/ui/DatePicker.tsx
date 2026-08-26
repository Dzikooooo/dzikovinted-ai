import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalDateString } from '../../lib/date';
import { MONTH_NAMES_FR } from '../../lib/republishSchedule';

const WEEKDAY_LABELS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface DatePickerProps {
  value: string | null; // YYYY-MM-DD
  onChange: (date: string) => void;
  // Toute date strictement anterieure est desactivee (non cliquable) --
  // defaut : aujourd'hui (jour calendaire LOCAL, voir lib/date.ts), jamais
  // le jour calendaire UTC.
  minDate?: string;
  className?: string;
}

// Calendrier jour/mois/annee maison -- aucune dependance ajoutee (voir
// l'audit prealable : aucun date-picker n'existait dans le projet).
// Comparaisons de dates en chaine "YYYY-MM-DD" (largeur fixe, zero-paddee) :
// l'ordre lexicographique suit exactement l'ordre chronologique, jamais
// besoin de reparser en Date pour comparer.
export function DatePicker({ value, onChange, minDate, className = '' }: DatePickerProps) {
  const today = new Date();
  const effectiveMinDate = minDate ?? toLocalDateString(today);

  const initialView = value ? new Date(`${value}T00:00:00`) : today;
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const todayStr = toLocalDateString(today);

  return (
    <div className={`bg-dark-400 border border-gray-200 rounded-xl p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label="Mois précédent"
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold text-gray-800 capitalize">
          {MONTH_NAMES_FR[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="Mois suivant"
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS_FR.map((label, i) => (
          <span key={i} className="text-[10px] text-gray-500 text-center font-semibold">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`empty-${i}`} />;
          const dateStr = toLocalDateString(new Date(viewYear, viewMonth, day));
          const disabled = dateStr < effectiveMinDate;
          const isSelected = dateStr === value;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => onChange(dateStr)}
              aria-label={dateStr}
              aria-pressed={isSelected}
              className={`w-8 h-8 text-xs rounded-lg transition-all ${
                isSelected
                  ? 'bg-neon-600 text-white font-bold'
                  : disabled
                  ? 'text-gray-700 cursor-not-allowed'
                  : `text-gray-700 hover:bg-gray-100 ${isToday ? 'ring-1 ring-neon-500/50' : ''}`
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

interface TimePickerProps {
  value: string | null; // HH:mm
  onChange: (time: string) => void;
  className?: string;
}

interface TimeUnitSelectProps {
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

// POURQUOI CE N'EST PLUS UN <select> NATIF (2026-08-26).
//
// C'en etait un, et le menu debordait par-dessus les photos de la modale.
// La correction demandee -- `max-h-40 overflow-y-auto` sur le champ -- ne
// pouvait PAS marcher : la liste deroulante d'un <select> natif est dessinee
// par le navigateur/l'OS, hors du document. Aucune regle CSS de la page ne la
// dimensionne, ne la positionne ni ne la rogne. Appliquer ces classes aurait
// produit un no-op silencieux.
//
// La liste est donc reconstruite DANS le document : un bouton + un
// `role="listbox"` positionne en absolu, plafonne a max-h-40 et defilant.
// C'est la seule facon d'obtenir le comportement demande.
//
// Ce qu'il ne faut pas perdre en repassant par du custom : le clavier et
// l'annonce vocale, gratuits avec un select natif. D'ou les roles ARIA,
// Echap, les fleches, Debut/Fin, et le retour du focus sur le declencheur.
function TimeUnitSelect({ label, placeholder, options, value, onChange }: TimeUnitSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Fermeture au clic exterieur : un menu natif se ferme seul, celui-ci non.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // A l'ouverture, amener la valeur courante sous les yeux : avec 24 heures
  // pour ~5 lignes visibles, une liste ouverte en haut cacherait le choix
  // deja fait.
  useEffect(() => {
    if (!open) return;
    // Appel OPTIONNEL : scrollIntoView n'existe pas dans jsdom, et sans ce
    // garde-fou le composant levait a chaque ouverture dans les tests -- un
    // confort d'affichage ne doit jamais casser le rendu.
    const selected = listRef.current?.querySelector('[aria-selected="true"]');
    if (selected instanceof HTMLElement) selected.scrollIntoView?.({ block: 'center' });
  }, [open]);

  function select(option: string) {
    onChange(option);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const index = options.indexOf(value);
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      if (next >= 0 && next < options.length) onChange(options[next]);
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      onChange(options[0]);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      onChange(options[options.length - 1]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={`flex items-center gap-1.5 bg-dark-400 border border-gray-200 rounded-xl px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 ${
          value ? 'text-gray-800' : 'text-gray-600'
        }`}
      >
        {value || placeholder}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // `bottom-full mb-1` : le menu s'ouvre VERS LE HAUT. Le selecteur
        // d'heure est le dernier bloc avant le bouton de validation, en bas
        // d'une modale deja haute -- s'ouvrir vers le bas le ferait sortir du
        // panneau, qui est en overflow-y-auto (Modal.tsx). Vers le haut, il
        // se deploie sur le calendrier, deja renseigne a ce stade.
        <ul
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="absolute bottom-full mb-1 left-0 z-10 min-w-full max-h-40 overflow-y-auto bg-surface border border-gray-200 rounded-xl shadow-lg py-1"
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => select(option)}
                  className={`w-full text-left px-4 py-1.5 text-sm tabular-nums transition-colors ${
                    selected ? 'bg-neon-500/10 text-neon-600 font-bold' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Heures / minutes, jamais un champ texte libre -- demande explicite "UI
// simple et propre... pas un champ texte libre fragile". Minutes par pas de 5
// (12 options) : suffisant pour programmer une republication, evite une liste
// de 60 options.
export function TimePicker({ value, onChange, className = '' }: TimePickerProps) {
  const [hour, minute] = value ? value.split(':') : ['', ''];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TimeUnitSelect
        label="Heure"
        placeholder="HH"
        options={HOUR_OPTIONS}
        value={hour}
        onChange={(h) => onChange(`${h}:${minute || '00'}`)}
      />
      <span className="text-gray-600 font-bold">:</span>
      <TimeUnitSelect
        label="Minutes"
        placeholder="MM"
        options={MINUTE_OPTIONS}
        value={minute}
        onChange={(m) => onChange(`${hour || '00'}:${m}`)}
      />
    </div>
  );
}
