// Logique pure (aucun DOM, aucun chrome.*) extraite de vinted-publish.ts
// pour rester testable en isolation, meme discipline que domWait.ts/
// matchOption.ts/publishFieldSummary.ts -- vinted-publish.ts porte des effets
// de bord au niveau du module (chrome.runtime.onMessage.addListener,
// MutationObserver), qui empechent de l'importer tel quel dans un test
// unitaire sans mock global de `chrome`/DOM.
//
// Mission "CRASH INJECTION PHOTOS" (2026-08-11) : extrait au moment
// d'instrumenter injectPhotosWithConfirmation() (audit du crash Vinted
// pendant l'upload photo) -- reconstruit chaque FetchedPhoto (ArrayBuffer
// deja recupere en arriere-plan, voir handlePublishListing.ts::fetchPhoto)
// en File, avec un sniff LEGER des magic bytes (diagnostic uniquement,
// jamais bloquant) : un fetch HTTP 200 ne garantit pas un contenu image
// valide (page d'erreur HTML, reponse tronquee...).
//
// Mission "5 photos non reconnues comme images" (2026-08-11) : le sniffer
// jpeg/png/webp initial rapportait 5/5 "unknown" en test live -- sniffImageFormat()
// vit desormais dans lib/imageSniff.ts (partage avec le background, aucune
// dependance DOM/chrome) et reconnait aussi AVIF/HEIC/HEIF (conteneur ISOBMFF,
// formats modernes plausibles cote CDN Vinted). Reexporte ici pour ne rien
// casser cote appelants existants (vinted-publish.ts).

import type { FetchedPhoto } from "../lib/messages";
import { errorMessage } from "../lib/errorMessage";
import { sniffImageFormat, bytesToHex, type SniffedImageFormat } from "../lib/imageSniff";

export type { SniffedImageFormat };
export { sniffImageFormat, bytesToHex };

// Format sniffe -> MIME canonique. Un CDN peut declarer un Content-Type qui
// ne correspond pas au contenu reel (mislabeling) -- si le sniff des magic
// bytes identifie un format CONNU different du mimeType declare, ce MIME
// canonique est utilise pour le File plutot que la valeur potentiellement
// fausse recue du fetch background (demande explicite : "conserve le MIME
// reel"). "unknown" n'a pas d'entree ici -- gere separement (rejet).
const CANONICAL_MIME: Record<Exclude<SniffedImageFormat, "unknown">, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

export interface PhotoReconstructionResult {
  url: string;
  file: File | null;
  fileCreated: boolean;
  byteLength: number | null;
  sniffedFormat: SniffedImageFormat | null;
  magicBytesHex: string | null;
  declaredMimeType: string | null;
  error: string | null;
}

// Ordre des photos TOUJOURS conserve (aucun tri/filtre implicite) -- l'ordre
// choisi par le vendeur sur l'annonce d'origine doit rester l'ordre sur la
// nouvelle annonce. Une photo dont le fetch background a echoue (ou dont la
// reconstruction locale echoue, cas quasi jamais observe) produit une entree
// avec file:null -- jamais une exception qui interromprait les autres.
//
// Mission "5 photos non reconnues" (2026-08-11), item 8 : une photo dont le
// contenu reel ne correspond a AUCUN format image connu (sniffedFormat ===
// "unknown" -- ni jpeg/png/webp/avif/heic/heif) n'est PLUS transformee en
// File injectable : produire un File a partir d'une page d'erreur HTML/JSON
// serait injecter un fichier garanti invalide dans le formulaire Vinted.
// Un format CONNU mais different du mimeType declare (CDN mislabeling)
// utilise desormais le MIME canonique reel plutot que la valeur recue.
export function reconstructPhotoFiles(photos: FetchedPhoto[]): PhotoReconstructionResult[] {
  return photos.map((photo): PhotoReconstructionResult => {
    if (!photo.arrayBuffer || !photo.mimeType) {
      return {
        url: photo.url,
        file: null,
        fileCreated: false,
        byteLength: null,
        sniffedFormat: null,
        magicBytesHex: null,
        declaredMimeType: photo.mimeType,
        error: photo.error ?? "arrayBuffer/mimeType absents",
      };
    }
    const bytes = new Uint8Array(photo.arrayBuffer);
    const magicBytesHex = bytesToHex(bytes);
    const sniffedFormat = sniffImageFormat(bytes);
    if (sniffedFormat === "unknown") {
      return {
        url: photo.url,
        file: null,
        fileCreated: false,
        byteLength: photo.arrayBuffer.byteLength,
        sniffedFormat,
        magicBytesHex,
        declaredMimeType: photo.mimeType,
        error: "Contenu non reconnu comme une image valide (magic bytes ne correspondent a aucun format connu)",
      };
    }
    try {
      const mimeType = CANONICAL_MIME[sniffedFormat];
      const file = new File([photo.arrayBuffer], photo.fileName, { type: mimeType });
      return {
        url: photo.url,
        file,
        fileCreated: true,
        byteLength: photo.arrayBuffer.byteLength,
        sniffedFormat,
        magicBytesHex,
        declaredMimeType: photo.mimeType,
        error: null,
      };
    } catch (err) {
      return {
        url: photo.url,
        file: null,
        fileCreated: false,
        byteLength: photo.arrayBuffer.byteLength,
        sniffedFormat,
        magicBytesHex,
        declaredMimeType: photo.mimeType,
        error: errorMessage(err),
      };
    }
  });
}
