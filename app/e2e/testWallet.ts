// Single entry point for the e2e support modules (also loaded by the demo
// launcher through Node's type stripping, hence the explicit .ts extensions).
export {
  E2E_ESCROW, loadAccount, profileAddress, verifierAddr, nodePublic, nodeWallet, windowCtl,
} from "./support/accounts.ts";
export { installTestWallet, connectInjected } from "./support/injectedWallet.ts";
export { mockGithub, synthComments } from "./support/githubStub.ts";
export { signerState, pairingCodeFor, openBountyOrCreate } from "./support/bounties.ts";
