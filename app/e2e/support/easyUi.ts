import type { Page } from "@playwright/test";

/** Reveals the manual verifier inputs inside the picker. */
export const openManualVerifiers = (page: Page) =>
  page.getByText("Add someone else", { exact: true }).click();

/** Opens the "Advanced settings" disclosure on the Create form. */
export const openAdvancedSettings = (page: Page) =>
  page.getByText("Advanced settings", { exact: true }).click();

/** Opens the "Advanced: use the local signer" disclosure. */
export const openLocalSigner = (page: Page) =>
  page.getByText("Advanced: use the local signer", { exact: true }).first().click();
