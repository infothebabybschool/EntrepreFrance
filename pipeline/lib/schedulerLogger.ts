import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.join(__dirname, "..", "logs");

fs.mkdirSync(LOGS_DIR, { recursive: true });

function getLogFile(): string {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `scheduler_${today}.log`);
}

export function logScheduler(scope: string, message: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${scope}] ${message}`;
  console.log(line);
  fs.appendFileSync(getLogFile(), line + "\n", "utf-8");
}

export function logSchedulerError(scope: string, message: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${scope}] ERROR: ${message}`;
  console.error(line);
  fs.appendFileSync(getLogFile(), line + "\n", "utf-8");
}
