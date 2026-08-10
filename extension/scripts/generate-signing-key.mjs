// Utilitaire MANUEL, a lancer UNE SEULE FOIS (2026-08-10, correctif ID
// d'extension instable pour la distribution beta). N'est PAS branche sur
// build/package:beta -- le relancer regenererait une nouvelle paire de cles
// et donc un NOUVEL ID, exactement le bug que ce script sert a corriger.
// Ne l'execute que pour une rotation deliberee de la cle (cle privee
// compromise, par exemple), jamais en routine.
//
// Cle publique -> PAS un secret : elle finit de toute facon visible dans le
// manifest.json de chaque copie distribuee de l'extension (c'est precisement
// ce qui rend l'ID stable et verifiable par n'importe qui). Copiee a la main
// dans manifest.config.ts (BETA_SIGNING_PUBLIC_KEY), commitee normalement.
//
// Cle privee -> jamais commitee (extension/.beta-signing-key.pem, deja
// dans .gitignore). Necessaire seulement si on veut plus tard signer un
// .crx auto-heberge ; PAS necessaire pour "Charger l'extension non
// empaquetee" (l'ID est calcule a partir de la cle publique seule) ni pour
// la premiere publication Chrome Web Store (Google assigne alors son propre
// ID independant de cette cle -- voir BETA_INSTALL.md / rapport du lot).
import { generateKeyPairSync, createHash } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, "..");
const privateKeyPath = join(extensionRoot, ".beta-signing-key.pem");

if (existsSync(privateKeyPath)) {
  console.error(
    `\n[generate-signing-key] ${privateKeyPath} existe déjà -- refus de l'écraser (ça changerait l'ID de l'extension pour tout le monde). Supprime-le explicitement d'abord si une rotation est vraiment voulue.\n`
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });

const publicKeyBase64 = publicKey.toString("base64");

// Algorithme Chrome (Chromium extensions/common/crx_file/id_util.cc) :
// SHA-256 des octets DER de la cle publique, 16 premiers octets, chaque
// nibble hexa (0-15) mappe sur une lettre a-p.
const hash = createHash("sha256").update(publicKey).digest();
const idBytes = hash.subarray(0, 16);
let extensionId = "";
for (const byte of idBytes) {
  extensionId += String.fromCharCode(97 + (byte >> 4));
  extensionId += String.fromCharCode(97 + (byte & 0x0f));
}

console.log(`\n[generate-signing-key] Clé privée écrite : ${privateKeyPath} (ne jamais committer)`);
console.log(`\nID d'extension résultant (stable, indépendant du chemin/machine) :\n  ${extensionId}`);
console.log(`\nClé publique à coller dans manifest.config.ts (BETA_SIGNING_PUBLIC_KEY) :\n  ${publicKeyBase64}\n`);
