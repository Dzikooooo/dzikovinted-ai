// Point d'entree MINIMAL declare dans manifest.config.ts comme content script
// MONDE MAIN. Fichier separe de la logique pour que celle-ci reste testable
// sans dependre d'etre chargee comme content script -- meme decoupage que
// publishCreateResponseCaptureBoot.ts.
import { installPriceMainWorldWriter } from "./priceMainWorldWriter";

installPriceMainWorldWriter();
