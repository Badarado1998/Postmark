import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GithubRateLimitError } from "../github/client";
import { useToast } from "./Toasts";

export const RATE_LIMIT_TOAST = "GitHub is rate-limiting us — try again in a few minutes.";

/** One warning toast whenever a GitHub query fails because of the rate limit. */
export function GithubRateLimitToast() {
  const cache = useQueryClient().getQueryCache();
  const toast = useToast();
  useEffect(() => cache.subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error"
      && event.action.error instanceof GithubRateLimitError) {
      toast({ kind: "warning", title: "GitHub is busy", text: RATE_LIMIT_TOAST });
    }
  }), [cache, toast]);
  return null;
}
