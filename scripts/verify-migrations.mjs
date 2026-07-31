import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "supabase", "migrations");
const files = (await readdir(directory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  throw new Error("No Supabase migrations found.");
}

const versions = new Set();
for (const file of files) {
  const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) {
    throw new Error(
      `${file}: migration names must use a unique 14-digit timestamp.`
    );
  }
  const version = match[1];
  if (versions.has(version)) {
    throw new Error(`${file}: duplicate migration version ${version}.`);
  }
  versions.add(version);

  const sql = (await readFile(join(directory, file), "utf8")).trim();
  if (!/^begin;/i.test(sql) || !/\bcommit;/i.test(sql)) {
    throw new Error(`${file}: migration must be wrapped in begin/commit.`);
  }
}

console.log(`Verified ${files.length} uniquely versioned Supabase migrations.`);
