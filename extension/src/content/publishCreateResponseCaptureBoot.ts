// Point d'entree MINIMAL declare dans manifest.config.ts comme content
// script MONDE MAIN, run_at "document_start" -- SEUL point d'injection
// assez tot pour patcher window.fetch/XMLHttpRequest avant que le bundle
// JS de Vinted n'ait la moindre chance d'en capturer sa propre reference
// native (cause racine confirmee le 2026-08-17 du premier echec de
// capture, voir publishCreateResponseCapture.ts). Fichier separe du reste
// de la logique de capture pour que ce dernier reste testable/reutilisable
// sans dependre d'etre charge comme content script.
import { installPublishCreateResponseCapture } from "./publishCreateResponseCapture";

installPublishCreateResponseCapture();
