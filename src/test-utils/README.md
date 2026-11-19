# pqc-forge

Real FIPS-204 ML-DSA-87 verification inside Foundry, not an always-true stub.
Test-only code: **never deploy these mocks**. Registration/revocation entry points
are deliberately permissionless fixtures, not an implementation of native account security.

## Install and run

From the project root: `npm ci` (Node.js >=20.19, preferably Node 22).
Use an installed Forge, or `npm test` for the pinned npm Forge binary. forge-std
is included under `lib/forge-std`; to restore it, clone
`https://github.com/foundry-rs/forge-std` there (revision below).
Enable `ffi = true` in `foundry.toml`. FFI runs local processes: only run trusted tests.
Run from this project root so `scripts/pqc.mjs` and Node dependencies resolve.

The one-line test installation is `contract MyTest is PqcTest { ... }`.
The inherited `setUp()` etches both addresses; overrides must call `super.setUp()`.

```solidity
import {PqcTest} from "../src/test-utils/PqcTest.sol";

contract MyTest is PqcTest {
    function testSignature() public {
        (bytes memory pk, bytes memory sk) =
            pqcGenerateAndRegister(address(123), bytes32(uint256(7)));
        bytes memory msgBytes = qorexMessage("qorechain-diana", bytes("hello"));
        bytes memory sig = pqcSign(sk, msgBytes);
        assertTrue(PQC_VERIFY.pqcVerify(pk, sig, msgBytes));
    }
}
```

To copy this library into another Foundry project, copy `src/test-utils/` and
`scripts/pqc.mjs`, install `@qorechain/pqc@0.2.3` at its root, and use forge-std.
Copy `test/fixtures/` only if running the upstream-vector test.

## ABI and helpers

The workshop and current EVM precompile docs define:

* `0x0000000000000000000000000000000000000a01`:
  `pqcVerify(bytes pubkey, bytes signature, bytes message) returns (bool)`.
* `0x0000000000000000000000000000000000000a02`:
  `pqcKeyStatus(address) returns (bool registered, uint8 algorithmId, bytes pubkey, bool possessionProven)`.

`IQorePQC` retains the real `view` declarations and ABI encodings. The mock's
verification implementation is non-view only to invoke `vm.ffi`; the test calls
it through the real view interface (STATICCALL). Forge permits the cheatcode.
`vm.allowCheatcodes` explicitly permits the etched verification address.
Verification delegates to the published `mldsa87.verify(publicKey, message, signature)`.
Malformed keys/signatures return false; subprocess/setup failures revert rather
than silently accepting or treating an environment failure as a bad signature.

* `pqcKeygen(bytes32 seed)` returns `(pubkey, secretKey)` via FFI, deterministic.
* `pqcSign(secretKey, message)` signs raw bytes via FFI, deterministic, empty context.
* `pqcGenerateAndRegister(account, seed)` combines FFI keygen with registry insertion.
* `pqcRegister(account, pubkey, proven)` stores an algorithm-1, 2592-byte key;
  replacing it simulates rotation. `proven` is an explicitly trusted test fixture,
  **not** a cryptographic proof-of-possession check.
* `pqcRevoke(account)` clears the record. Unknown/cleared accounts return
  `(false, 0, bytes(""), false)`. This simulates absence; it does not claim the
  chain offers this permissionless revoke method.
* `qorexMessage(chainId, data)` constructs UTF-8 `qorechain-msg-v1|<chainId>|`
  followed by raw data. Pass the native string ID (`qorechain-diana`), not EVM
  numeric ID 9800. Rejects empty IDs and characters outside `[A-Za-z0-9._-]`.

Registry mutations live in EVM test storage (FFI cannot mutate EVM storage);
key generation and signing use FFI. No files contain generated secret keys.
Seed and secret-key command arguments are visible to local processes; use only
disposable test keys. These mocks do not model gas charges, native registration
validation/PoP, network activation, hybrid transactions, or EVM windows. Etching
does not clear old storage; inherited setup is intended for fresh isolated tests.

## Provenance

ABI: QoreChain Build Before Q-Day workshop 2, `01-qday-vault/src/QDayVault.sol`,
and `qorechain-docs/docs/developer-guide/evm-precompiles.md` (four-output status,
v3.2.4+; older SDK docs show only three outputs and are not used here).
QoreX prefix: `qorechain-docs/docs/qoresign/spec/message-signing-v1.md`.
Crypto: Apache-2.0 `@qorechain/pqc` 0.2.3, wrapping `@noble/post-quantum`.
`test/fixtures/ml-dsa-87.json` is copied unchanged from
https://github.com/qorechain/qorechain-pqc at
`66ff1eb447772f2f8036a0bf5050ae1573baeb85`; its Apache-2.0 license is adjacent.
`testSharedUpstreamVector` checks its first signature and a negative mutation.
forge-std: https://github.com/foundry-rs/forge-std at
`15b2df92a05d4d2f76a06653872fefb287e0e01c` (upstream licenses retained).
