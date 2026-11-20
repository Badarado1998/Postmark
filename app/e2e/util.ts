import { readFileSync } from "node:fs";

/** Read and parse a JSON file, naming the file in any failure. */
export function readJsonFile<T>(url: URL): T {
  try {
    return JSON.parse(readFileSync(url, "utf8")) as T;
  } catch (e) {
    throw new Error(`cannot read JSON ${url.pathname}: ${e instanceof Error ? e.message : e}`);
  }
}

/** Tagged progress line for specs and global setup. */
export function e2eLog(tag: string, ...parts: unknown[]) {
  console.log(`[${tag}]`, ...parts);
}

export const E2E_DEPLOYMENT = readJsonFile<{ address: string }>(
  new URL("../../deployments/diana-e2e.json", import.meta.url));
