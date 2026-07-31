import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const sqlPath = fileURLToPath(
  new URL("../supabase/tests/booking_and_reminder_safety.sql", import.meta.url)
);
const sql = await readFile(sqlPath, "utf8");
const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase_db_auto-repair",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
