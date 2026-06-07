import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const LOG_FILE = path.join(LOGS_DIR, `pipeline_${today}.log`);

fs.mkdirSync(LOGS_DIR, { recursive: true });

export function log(scope: string, message: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${scope}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
}

export function logError(scope: string, message: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${scope}] ERROR: ${message}`;
  console.error(line);
  fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
}
