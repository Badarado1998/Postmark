import { loadConfig } from "./config";
import { createGithubApi } from "./github";
import { run } from "./run";

try {
  const cfg = loadConfig(process.env);
  const { exitCode } = await run(cfg, createGithubApi(cfg.githubToken));
  process.exit(exitCode);
} catch (e) {
  console.error(`verifier failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
