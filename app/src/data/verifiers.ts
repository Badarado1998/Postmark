import list from "./verifiers.json";

export interface VerifierEntry {
  address: `0x${string}`;
  name: string;
  github?: string;
  note: string;
}

/** Curated reviewers shown in the Create picker; anyone can apply through the issue form. */
export const VERIFIERS = list as VerifierEntry[];

const REPO = "https://github.com/Ololadestephen/Postmark";
export const BECOME_VERIFIER_URL = `${REPO}/issues/new?template=become-a-verifier.yml`;

/** Issue-form link with the `address` field prefilled when an address is known. */
export const becomeVerifierUrl = (address?: string | null) =>
  address ? `${BECOME_VERIFIER_URL}&address=${encodeURIComponent(address)}` : BECOME_VERIFIER_URL;
