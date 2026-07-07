#!/usr/bin/env node
/**
 * Audit maison : cohérence schéma SQL <-> code, doublons de migrations.
 * Heuristique par regex (pas un vrai parseur SQL/TS) : sert de repérage rapide,
 * pas de source de vérité. Toujours relire le détail avant d'agir dessus.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const CODE_DIRS = ["src", "scripts"];

const IGNORED_FIRST_TOKENS = new Set([
  "constraint",
  "primary",
  "foreign",
  "unique",
  "check",
]);

function listFiles(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

function extractBalancedParens(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const tables = new Map(); // name -> { definedIn: [], alteredIn: [], columns: Set }

  function getTable(name) {
    if (!tables.has(name)) {
      tables.set(name, { definedIn: [], alteredIn: [], columns: new Set() });
    }
    return tables.get(name);
  }

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    const createRe = /create\s+table\s+(?:if not exists\s+)?"?(\w+)"?\s*\(/gi;
    let m;
    while ((m = createRe.exec(content))) {
      const tableName = m[1].toLowerCase();
      const openIndex = m.index + m[0].length - 1;
      const body = extractBalancedParens(content, openIndex);
      const entry = getTable(tableName);
      entry.definedIn.push(file);
      if (body) {
        for (const part of splitTopLevel(body)) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const firstToken = trimmed.split(/\s+/)[0].replace(/"/g, "").toLowerCase();
          if (IGNORED_FIRST_TOKENS.has(firstToken)) continue;
          entry.columns.add(firstToken);
        }
      }
    }

    const alterAddRe = /alter\s+table\s+"?(\w+)"?\s+add\s+column\s+(?:if not exists\s+)?"?(\w+)"?/gi;
    while ((m = alterAddRe.exec(content))) {
      const tableName = m[1].toLowerCase();
      const columnName = m[2].toLowerCase();
      const entry = getTable(tableName);
      entry.alteredIn.push(file);
      entry.columns.add(columnName);
    }

    const alterBareRe = /alter\s+table\s+"?(\w+)"?\s+add\s+"?(\w+)"?\s+\w/gi;
    while ((m = alterBareRe.exec(content))) {
      const tableName = m[1].toLowerCase();
      const columnName = m[2].toLowerCase();
      if (["column", "constraint"].includes(columnName)) continue;
      const entry = getTable(tableName);
      entry.columns.add(columnName);
    }
  }

  return { tables, files };
}

function scanCodeUsage() {
  const usage = new Map(); // table -> { refs: [{file, line}], columns: Set }

  function record(tableName, file, line, columns) {
    if (!usage.has(tableName)) usage.set(tableName, { refs: [], columns: new Set() });
    const entry = usage.get(tableName);
    entry.refs.push(`${relative(ROOT, file)}:${line}`);
    for (const c of columns) entry.columns.add(c);
  }

  const files = CODE_DIRS.flatMap((dir) => listFiles(join(ROOT, dir), [".ts", ".tsx"]));

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const fromRe = /\.from\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]\s*\)/g;
    let m;
    while ((m = fromRe.exec(content))) {
      const tableName = m[1].toLowerCase();
      const lineNumber = content.slice(0, m.index).split("\n").length;

      const windowEnd = content.indexOf(";", m.index);
      const window = content.slice(m.index, windowEnd === -1 ? m.index + 400 : Math.min(windowEnd, m.index + 400));
      const selectMatch = window.match(/\.select\(\s*["'`]([^"'`]*)["'`]\s*\)/);
      const columns = [];
      if (selectMatch && selectMatch[1].trim() !== "*") {
        for (const col of selectMatch[1].split(",")) {
          const clean = col.trim().split(":").pop().trim();
          if (clean) columns.push(clean.toLowerCase());
        }
      }

      record(tableName, file, lineNumber, columns);
    }
  }

  return usage;
}

function main() {
  const { tables, files: migrationFiles } = parseMigrations();
  const usage = scanCodeUsage();

  const lines = [];
  lines.push("# Audit schéma <-> code\n");
  lines.push(`Migrations analysées : ${migrationFiles.length}\n`);

  lines.push("## Doublons de définition de table (même table créée dans plusieurs migrations)\n");
  let dupCount = 0;
  for (const [name, info] of tables) {
    if (info.definedIn.length > 1) {
      dupCount++;
      lines.push(`- \`${name}\` : défini dans ${info.definedIn.join(", ")}`);
    }
  }
  if (dupCount === 0) lines.push("(aucun)");

  lines.push("\n## Tables utilisées dans le code mais absentes des migrations\n");
  let missing = 0;
  for (const [name, info] of usage) {
    if (!tables.has(name)) {
      missing++;
      lines.push(`- \`${name}\` référencée dans : ${info.refs.join(", ")}`);
    }
  }
  if (missing === 0) lines.push("(aucune)");

  lines.push("\n## Tables définies en base mais jamais référencées dans le code (src/, scripts/)\n");
  let unused = 0;
  for (const [name, info] of tables) {
    if (!usage.has(name)) {
      unused++;
      lines.push(`- \`${name}\` (définie dans ${info.definedIn.join(", ")})`);
    }
  }
  if (unused === 0) lines.push("(aucune)");

  lines.push("\n## Colonnes utilisées via .select(\"...\") introuvables dans le schéma déduit\n");
  lines.push("_(heuristique regex, faux positifs possibles — vérifier avant d'agir)_\n");
  let colMismatch = 0;
  for (const [name, info] of usage) {
    const schema = tables.get(name);
    if (!schema) continue;
    for (const col of info.columns) {
      if (!schema.columns.has(col)) {
        colMismatch++;
        lines.push(`- \`${name}.${col}\` (référencée dans ${info.refs.join(", ")})`);
      }
    }
  }
  if (colMismatch === 0) lines.push("(aucune)");

  console.log(lines.join("\n"));

  const problems = dupCount + missing + colMismatch;
  if (problems > 0) {
    console.log(`\n---\n${problems} point(s) à vérifier manuellement.`);
  }
}

main();
