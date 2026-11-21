// The three claim steps, shared by the connected claim card and the not-connected preview.
export const CLAIM_STEPS = [
  { title: "Post your claim line", hint: "Comment the line on the GitHub issue from the account that will open the PR." },
  { title: "Find my comment", hint: "After you've posted it, we look it up on GitHub." },
  { title: "Sign with QoreX and claim", hint: "Find your comment first, then sign and send the claim." },
] as const;
