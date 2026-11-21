import type { Address } from "viem";
import { parseBoards, type IssueRef } from "./boards";
import prod from "../../deployments/diana.json";
import e2e from "../../deployments/diana-e2e.json";
import verifierList from "../../app/src/data/verifiers.json";

export interface BotConfig {
  verifierKey: `0x${string}` | undefined;
  pqcRecoveryCode: string | undefined;
  githubToken: string | undefined;
  postComments: boolean;
  escrow: Address;
  deployBlock: bigint;
  /** lower-case addresses that count as human verifiers for the dispute rule (never derived from comment labels) */
  humans: Set<string>;
  dryRun: boolean;
  /** issues (owner/repo#n) where verdict signatures are shared for bounties on other repositories */
  boards: IssueRef[];
  /** the repository this run executes in (set by Actions); decides where comments may be posted */
  githubRepository: string | undefined;
}

const flag = (v: string | undefined, dflt = false) =>
  v === undefined || v.trim() === "" ? dflt : /^(1|true|yes|on)$/i.test(v.trim());

const KNOWN = [prod, e2e].map((d) => ({ address: d.address.toLowerCase(), block: BigInt(d.deploy.block) }));

export function loadConfig(env: Record<string, string | undefined>): BotConfig {
  const escrow = (env.POSTMARK_ESCROW?.trim() || prod.address) as Address;
  const known = KNOWN.find((k) => k.address === escrow.toLowerCase());
  const block = env.POSTMARK_DEPLOY_BLOCK?.trim() ? BigInt(env.POSTMARK_DEPLOY_BLOCK.trim()) : known?.block;
  if (block === undefined) throw new Error("POSTMARK_DEPLOY_BLOCK is required for an escrow this bot doesn't know");
  const humanList = env.POSTMARK_HUMAN_VERIFIERS?.trim()
    ? env.POSTMARK_HUMAN_VERIFIERS.split(",").map((s) => s.trim())
    : (verifierList as { address: string; kind?: string }[]).filter((v) => v.kind === "human").map((v) => v.address);
  return {
    verifierKey: (env.POSTMARK_VERIFIER_KEY?.trim() || undefined) as `0x${string}` | undefined,
    pqcRecoveryCode: env.POSTMARK_VERIFIER_PQC?.trim() || undefined,
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
    postComments: flag(env.POSTMARK_POST_COMMENTS),
    escrow,
    deployBlock: block,
    humans: new Set(humanList.filter(Boolean).map((a) => a.toLowerCase())),
    dryRun: flag(env.POSTMARK_DRY_RUN),
    boards: parseBoards(env.POSTMARK_VERDICT_BOARDS),
    githubRepository: env.GITHUB_REPOSITORY?.trim() || undefined,
  };
}
