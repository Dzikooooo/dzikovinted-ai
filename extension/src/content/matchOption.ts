// Correspondance texte entre un champ libre ResellOS (brand/size/condition/
// color) et les options reelles listees par un picker Vinted. Ne devine
// jamais : renvoie null si aucune correspondance fiable, plutot que de
// choisir une option arbitraire (coherent avec la discipline "aucune
// donnee inventee" deja appliquee dans src/lib/insights/).

const COMBINING_DIACRITICS_REGEX = /[̀-ͯ]/g;

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS_REGEX, "");
}

export function matchOption(freeText: string | null | undefined, options: string[]): string | null {
  if (!freeText || !freeText.trim() || options.length === 0) return null;

  const normalizedText = normalize(freeText);

  const exact = options.find((option) => normalize(option) === normalizedText);
  if (exact) return exact;

  const partial = options.find((option) => {
    const normalizedOption = normalize(option);
    return normalizedOption.includes(normalizedText) || normalizedText.includes(normalizedOption);
  });
  return partial ?? null;
}
