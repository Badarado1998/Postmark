export default function Signer() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="font-serif text-4xl font-semibold text-paper-100">The local signer</h1>
      <p className="mt-4 leading-relaxed text-ink-200">
        Claims and verdicts need an ML-DSA-87 signature over the exact message the chain will
        check. Your post-quantum secret never leaves your machine: a small local process holds
        the key, this app asks it to sign, and it signs only after you confirm the decoded
        request in the terminal.
      </p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">run it</h2>
      <div className="mt-3 space-y-3 text-sm text-ink-200">
        <p>From the repo root, with a QRC1 recovery-code profile:</p>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-ink-950 p-4 font-mono text-xs text-paper-100">
{`npm run signer -- serve --env ~/.config/postmark/<profile> \\
  --origin http://localhost:5173`}
        </pre>
        <p>…or with a mnemonic profile (<code className="text-paper-200">MNEMONIC=</code>, optional <code className="text-paper-200">HD_INDEX=</code>):</p>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-ink-950 p-4 font-mono text-xs text-paper-100">
{`npm run signer -- serve --env ~/.config/postmark/<profile> \\
  --deployment diana --port 47321`}
        </pre>
        <p>The terminal prints an 8-character pairing code — paste it into the app once per tab.
          It prints a decoded summary of every request and asks <span className="font-mono">y/N</span> before signing.</p>
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">security model</h2>
      <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-ink-200">
        <li>Binds <span className="font-mono">127.0.0.1</span> only — nothing on the network can reach it.</li>
        <li>Serves exactly one browser origin; every other origin, including preflights, is refused.</li>
        <li>Every request needs the pairing code; it lives in sessionStorage only.</li>
        <li>It rebuilds the sign bytes itself from the chain (<span className="font-mono">claimMessage</span>/<span className="font-mono">verdictMessage</span> on the escrow) and refuses any mismatch — the app's bytes are never trusted.</li>
        <li>It refuses anything that does not start with <span className="font-mono">qorechain-msg-v1|qorechain-diana|</span>.</li>
        <li>It refuses a claim whose claimant is not its own account, and it refuses to start unless the derived key equals the account's live registered key.</li>
        <li>Profile files must be mode <span className="font-mono">600</span>; the ECDSA key is never read.</li>
      </ul>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">troubleshooting</h2>
      <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-ink-200">
        <li><span className="text-paper-100">"not reachable"</span> — start the signer; check the port (<span className="font-mono">--port</span>) matches 47321.</li>
        <li><span className="text-paper-100">"origin refused"</span> — pass <span className="font-mono">--origin</span> with exactly the URL you browse (http vs https, port included).</li>
        <li><span className="text-paper-100">"pairing code rejected"</span> — a new <span className="font-mono">serve</span> run prints a new code; re-paste it.</li>
        <li><span className="text-paper-100">"key does NOT match"</span> — the profile's recovery code derives a different key than the one registered for that account; use the right profile.</li>
        <li><span className="text-paper-100">"no live key"</span> — register first: <span className="font-mono">npm run window -- --env &lt;profile&gt; register</span>.</li>
        <li><span className="text-paper-100">port busy</span> — pick another port and run the app URL pairing against it, or kill the old signer.</li>
      </ul>
      <p className="mt-8 text-xs text-ink-400">Signatures are ML-DSA-87 over diana testnet messages — test QOR, no monetary value.</p>
    </div>
  );
}
