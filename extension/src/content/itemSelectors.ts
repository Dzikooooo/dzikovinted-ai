// Selecteurs DOM Vinted verifies en direct (navigateur reel, deux annonces
// publiques distinctes) le 2026-07-13, page https://www.vinted.fr/items/{id}.
// Complementaires du bloc <script type="application/ld+json"> (voir
// extractLdJsonProduct ci-dessous) qui couvre deja titre/description/prix/
// marque/categorie/couleur de facon structuree et fiable -- ces selecteurs
// DOM ne couvrent que ce que le ld+json n'expose pas : galerie photo
// complete (le ld+json n'en donne qu'une), taille, etat exact (libelle
// Vinted, pas le itemCondition generique schema.org), matiere.

export interface LdJsonProduct {
  title: string | null;
  description: string | null;
  price: number | null;
  brand: string | null;
  category: string | null;
  color: string | null;
}

// Le bloc contient un seul <script type="application/ld+json"> par page
// item (verifie en direct), de type schema.org Product.
export function extractLdJsonProduct(): LdJsonProduct {
  const script = document.querySelector('script[type="application/ld+json"]');
  const empty: LdJsonProduct = { title: null, description: null, price: null, brand: null, category: null, color: null };
  if (!script?.textContent) return empty;

  try {
    const data = JSON.parse(script.textContent) as {
      name?: string;
      description?: string;
      brand?: { name?: string };
      offers?: { price?: number };
      category?: string;
      color?: string;
    };
    return {
      title: data.name ?? null,
      description: data.description ?? null,
      price: typeof data.offers?.price === 'number' ? data.offers.price : null,
      brand: data.brand?.name ?? null,
      category: data.category ?? null,
      color: data.color ?? null,
    };
  } catch {
    return empty;
  }
}

// Les valeurs taille/etat sont portees par un <span itemprop="..."> dont le
// premier noeud est le texte utile, suivi d'un bouton "infos" imbrique
// (ex: <span>S<button>...</button></span>) -- .textContent inclurait a tort
// le contenu du bouton, d'ou cette lecture du seul premier noeud texte.
function firstTextNodeContent(container: Element | null): string | null {
  if (!container) return null;
  const span = container.querySelector('span');
  const node = span?.childNodes[0];
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent?.trim();
  return text ? text : null;
}

export function extractSize(): string | null {
  return firstTextNodeContent(document.querySelector('[data-testid="item-attributes-size"] [itemprop="size"]'));
}

export function extractCondition(): string | null {
  return firstTextNodeContent(document.querySelector('[data-testid="item-attributes-status"] [itemprop="status"]'));
}

// Non confirme en direct (aucun des deux articles testes n'affichait de
// matiere) -- selecteur construit par symetrie avec size/status, a
// reconfirmer lors du premier import reel d'un article qui en affiche une.
export function extractMaterial(): string | null {
  return firstTextNodeContent(document.querySelector('[data-testid="item-attributes-material"] [itemprop="material"]'));
}

// Chaque vignette apparait plusieurs fois dans le DOM (versions
// mobile/desktop dupliquees, verifie en direct) -- dedoublonnage par URL.
export function extractPhotoUrls(): string[] {
  const imgs = Array.from(
    document.querySelectorAll<HTMLImageElement>('img[data-testid^="item-photo-"][data-testid$="--img"]')
  );
  const urls = imgs.map((img) => img.getAttribute('src')).filter((src): src is string => !!src);
  return [...new Set(urls)];
}

export function extractVintedItemId(url: string): string | null {
  const match = url.match(/\/items\/(\d+)/);
  return match ? match[1] : null;
}
