// Packaging bêta (2026-08-10) : produit un ZIP directement chargeable via
// "Charger l'extension non empaquetée" dans Chrome, sans que l'utilisateur
// n'ait besoin de Node/npm/git. Ne fait AUCUN build lui-même -- suppose que
// `npm run build:beta` a déjà tourné (voir package.json::package:beta) --
// et revérifie ici, de façon automatisée, les garanties que ce build est
// censé fournir (pas de localhost, pas de secret) plutôt que de faire
// confiance à la seule discipline humaine.
import { createWriteStream, existsSync } from "node:fs";
import { readFile, readdir, stat, mkdir, rm } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, "..");
const distDir = join(extensionRoot, "dist");
const releaseDir = join(extensionRoot, "release");
const zipPath = join(releaseDir, "resellos-extension-beta.zip");
const ZIP_ROOT_FOLDER = "ResellOS-Extension";

function fail(message) {
  console.error(`\n[package-beta] ÉCHEC : ${message}\n`);
  process.exit(1);
}

async function listFilesRecursive(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  if (!existsSync(distDir)) {
    fail(`${distDir} introuvable -- lance d'abord "npm run build:beta" (ou "npm run package:beta" qui le fait automatiquement).`);
  }

  const manifestPath = join(distDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail(`${manifestPath} introuvable -- le build semble incomplet.`);
  }

  const manifestRaw = await readFile(manifestPath, "utf-8");
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    fail(`manifest.json invalide (JSON non parsable).`);
  }

  // Garde-fou automatise (P0 du lot distribution beta) : le build par
  // defaut (npm run build, sans --mode beta) inclut volontairement
  // localhost:5173 pour le dev -- si ce script tourne sur un dist/ issu de
  // ce build par erreur, on doit refuser de packager plutot que d'envoyer
  // ca a un beta-testeur.
  if (manifestRaw.includes("localhost")) {
    fail(
      `"localhost" trouvé dans dist/manifest.json -- ce dist/ vient d'un "npm run build" normal, pas de "npm run build:beta". Relance "npm run package:beta" (il rebuild en mode beta automatiquement).`
    );
  }

  const allFiles = await listFilesRecursive(distDir);
  const forbidden = allFiles.filter((f) => {
    const base = f.split(/[/\\]/).pop() ?? "";
    return base === ".env" || base.startsWith(".env.") || base.endsWith(".map");
  });
  if (forbidden.length > 0) {
    fail(`Fichier(s) interdit(s) trouvé(s) dans dist/ : ${forbidden.map((f) => relative(distDir, f)).join(", ")}`);
  }

  await mkdir(releaseDir, { recursive: true });
  if (existsSync(zipPath)) await rm(zipPath);

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("warning", (err) => console.warn(`[package-beta] warning: ${err.message}`));
    archive.on("error", reject);

    archive.pipe(output);
    // Tout dist/ sous un seul dossier racine dans le zip -- garantit qu'un
    // simple double-clic de decompression produit UN dossier ResellOS-
    // Extension/ contenant directement manifest.json, jamais trois niveaux
    // a naviguer.
    archive.directory(distDir, ZIP_ROOT_FOLDER);
    archive.finalize();
  });

  const zipStat = await stat(zipPath);
  const totalUncompressed = (
    await Promise.all(allFiles.map(async (f) => (await stat(f)).size))
  ).reduce((a, b) => a + b, 0);

  console.log(`\n[package-beta] OK`);
  console.log(`  Fichiers inclus : ${allFiles.length}`);
  console.log(`  Taille non compressée : ${(totalUncompressed / 1024).toFixed(1)} Ko`);
  console.log(`  ZIP généré : ${relative(extensionRoot, zipPath)} (${(zipStat.size / 1024).toFixed(1)} Ko)`);
  console.log(`  Dossier racine dans le ZIP : ${ZIP_ROOT_FOLDER}/`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
