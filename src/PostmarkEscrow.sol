// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IQorePQC} from "./test-utils/IQorePQC.sol";

/// @title PostmarkEscrow v1 — GitHub bounty escrow with PQ claims and 2-of-3
/// ML-DSA-87 verdicts. Implements SPEC.md. Native test QOR only.
/// @notice Holds native test QOR (diana) behind GitHub-verified claims and
/// 2-of-3 ML-DSA-87 verifier verdicts. Testnet payouts only; test QOR has no
/// monetary value.
/// @dev The escrow is a native-coin contract by design: there is no ERC-20,
/// ERC-721 or ERC-1155 interface, and none applies — no tokens are issued or
/// transferred. Off-chain integrations read state through the views
/// (`getBounty`, `creditOf`, `claimMessage`, `verdictMessage`, `nativeChainId`,
/// `nextBountyId`, `totalLiabilities`) and follow lifecycle through the events
/// (`BountyCreated`, `BountyWork`, `Claimed`, `ClaimReleased`,
/// `VerdictSubmitted`, `Disputed`, `DisputeResolved`, `Settled`, `Credited`,
/// `Withdrawn`).
contract PostmarkEscrow is ReentrancyGuard {
    enum State { Open, Claimed, Pending, Disputed, Paid, Refunded }
    enum Outcome { PAY, REFUND }
    enum Phase { INITIAL, DISPUTE }

    struct Verdict {
        uint256 bountyId;
        Phase phase;
        Outcome outcome;
        address payee;
        uint64 mergedAt;
        bytes32 evidenceHash;
        uint256 nonce;
        uint256 claimRound;
    }

    struct Bounty {
        address funder;
        uint256 amount;
        uint256 challengeReward;
        bytes32 workHash;
        uint64 deadline;
        uint64 claimTimeout;
        uint256 claimRound;
        uint64 claimExpiresAt;
        address payee;
        bytes32 payeeIdentityHash;
        address[3] verifiers;
        uint256 bondAmount;
        State state;
        uint256 nonce;
        Outcome initialOutcome;
        uint64 initialMergedAt;
        bytes32 initialEvidenceHash;
        bytes32 pendingVerdictHash;
        uint64 challengeEndsAt;
        address disputer;
        bytes32 disputeEvidenceHash;
    }

    uint64 public constant CHALLENGE_PERIOD = 24 hours;
    uint256 internal constant KEY_BYTES = 2592;
    uint256 internal constant SIG_BYTES = 4627;
    uint8 internal constant ALGORITHM_ID = 1;
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_KEYS = 0x0000000000000000000000000000000000000a02;
    // verifier set is fixed at 3; every 3-bound loop/check uses this constant
    uint256 internal constant VERIFIER_COUNT = 3;
    // input bounds, visible next to the loops that rely on them
    uint256 internal constant MAX_OWNER_REPO_BYTES = 140;
    uint256 internal constant MAX_CHAIN_ID_BYTES = 64;
    // pqcKeyStatus return layout: 5-word head (0xa0) then pubkey data at 0xa0;
    // its dynamic tail offset is 0x80. pqcVerify returns exactly one word.
    uint256 internal constant KEYS_STATUS_MIN_BYTES = 0xa0;
    uint256 internal constant KEYS_STATUS_DATA_OFFSET = 0x80;
    uint256 internal constant VERIFY_RET_BYTES = 32;

    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "ClaimV1(uint256 chainId,address escrow,uint256 bountyId,address claimant,"
        "bytes32 identityHash,uint256 claimRound)");
    bytes32 public constant VERDICT_TYPEHASH = keccak256(
        "PostmarkEscrowVerdictV1(uint256 chainId,address escrow,uint256 bountyId,uint8 phase,"
        "uint8 outcome,address payee,uint64 mergedAt,bytes32 evidenceHash,uint256 nonce,"
        "uint256 claimRound,bytes32 disputedVerdictHash,bytes32 disputeEvidenceHash)");

    string public nativeChainId;
    uint256 public nextBountyId = 1;
    uint256 public totalLiabilities;
    mapping(uint256 => Bounty) private bounties;
    mapping(address => uint256) private ungatedCredits;
    mapping(address => uint256) private gatedCredits;

    event BountyCreated(uint256 indexed bountyId, address indexed funder,
        uint256 amount, uint256 reward, bytes32 workHash, uint64 deadline,
        uint64 claimTimeout, address[3] verifiers, uint256 bondAmount);
    event BountyWork(uint256 indexed bountyId, bytes32 indexed workHash,
        string ownerRepo, uint8 kind, uint256 number);
    event Claimed(uint256 indexed bountyId, address indexed claimant,
        bytes32 identityHash, uint256 claimRound, uint64 expiresAt);
    event ClaimReleased(uint256 indexed bountyId, address indexed claimant, uint256 claimRound);
    event VerdictSubmitted(uint256 indexed bountyId, bytes32 payloadHash, Outcome outcome,
        uint64 mergedAt, bytes32 evidenceHash, uint256 nonce, uint256 claimRound,
        uint64 challengeEndsAt);
    event Disputed(uint256 indexed bountyId, address indexed disputer, uint256 bond, bytes32 evidenceHash);
    event DisputeResolved(uint256 indexed bountyId, bytes32 payloadHash, Outcome outcome,
        bool upheld, bytes32 evidenceHash, uint256 nonce, uint256 claimRound);
    event Settled(uint256 indexed bountyId, State terminalState);
    event Credited(uint256 indexed bountyId, address indexed account, uint256 amount, bool payeeGated);
    event Withdrawn(address indexed account, uint256 amount);

    error UnknownBounty(uint256 bountyId);
    error InvalidState(State current, State expected);
    error InvalidParameters();
    error NotFunder();
    error WrongValue(uint256 expected, uint256 got);
    error ClaimActive(uint64 expiresAt);
    error ClaimExpired();
    error NotClaimant();
    error ClaimClosed();
    error ClaimWindowTooShort();
    error InvalidClaimTimeout();
    error ClaimantExcluded(address account);
    error InvalidClaimRound(uint256 expected, uint256 actual);
    error BadClaimSignature();
    error DeadlineNotPassed();
    error SubmissionClosed();
    error ChallengeClosed();
    error ChallengeOpen();
    error InvalidPhase();
    error InvalidNonce(uint256 expected, uint256 got);
    error InvalidVerdict();
    error InvalidSigners();
    error DuplicateVerifierKey();
    error KeyIneligible(address account);
    error BadSignature(uint8 index);
    error PrecompileUnavailable();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(string memory nativeChainId_) {
        bytes memory id = bytes(nativeChainId_);
        if (id.length == 0 || id.length > MAX_CHAIN_ID_BYTES) revert InvalidParameters();
        for (uint256 i; i < id.length; ++i) { // bounded by MAX_CHAIN_ID_BYTES
            bytes1 c = id[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")
                || (c >= "0" && c <= "9") || c == "." || c == "_" || c == "-";
            if (!ok) revert InvalidParameters();
        }
        nativeChainId = nativeChainId_;
    }

    /// @notice Create and fund a bounty in native QOR. No payee is chosen;
    /// contributors claim with a PQ signature.
    function createBounty(uint256 amount, string calldata ownerRepo,
        uint8 kind, uint256 number, uint64 deadline, uint64 claimTimeout,
        address[3] calldata verifiers, uint256 bondAmount,
        uint256 challengeReward) external payable nonReentrant returns (uint256 bountyId)
    {
        if (amount == 0 || bondAmount == 0 || challengeReward == 0
            || kind > 1 || number == 0 || !_validOwnerRepo(ownerRepo)) {
            revert InvalidParameters();
        }
        // verifier set: exactly VERIFIER_COUNT distinct, non-zero, non-funder
        for (uint256 i; i < VERIFIER_COUNT; ++i) {
            address v = verifiers[i];
            if (v == address(0) || v == msg.sender) revert InvalidParameters();
            for (uint256 j = i + 1; j < VERIFIER_COUNT; ++j) {
                if (v == verifiers[j]) revert InvalidParameters();
            }
        }
        if (claimTimeout < 1 hours || claimTimeout > 7 days) revert InvalidClaimTimeout();
        if (deadline <= block.timestamp) revert InvalidParameters();
        if (claimTimeout > deadline - block.timestamp) revert ClaimWindowTooShort();
        if (msg.value != amount + challengeReward) {
            revert WrongValue(amount + challengeReward, msg.value);
        }
        _requireDistinctEligibleKeys(verifiers);

        bytes32 workHash = keccak256(abi.encode("github", ownerRepo, kind, number));
        bountyId = nextBountyId++;
        Bounty storage b = bounties[bountyId];
        b.funder = msg.sender;
        b.amount = amount;
        b.challengeReward = challengeReward;
        b.workHash = workHash;
        b.deadline = deadline;
        b.claimTimeout = claimTimeout;
        b.verifiers = verifiers;
        b.bondAmount = bondAmount;
        b.state = State.Open;
        totalLiabilities += msg.value;
        emit BountyCreated(bountyId, msg.sender, amount, challengeReward,
            workHash, deadline, claimTimeout, verifiers, bondAmount);
        emit BountyWork(bountyId, workHash, ownerRepo, kind, number);
    }

    /// @dev Canonical `owner/repo`: 3..MAX_OWNER_REPO_BYTES, exactly one '/',
    /// neither first nor last, chars [a-z0-9._-/].
    function _validOwnerRepo(string calldata s) internal pure returns (bool) {
        bytes calldata r = bytes(s);
        uint256 n = r.length;
        if (n < 3 || n > MAX_OWNER_REPO_BYTES || r[0] == "/" || r[n - 1] == "/") return false;
        uint256 slashes;
        for (uint256 i; i < n; ++i) { // bounded by MAX_OWNER_REPO_BYTES
            bytes1 c = r[i];
            if (c == "/") {
                ++slashes;
            } else if (!(c >= "a" && c <= "z" || c >= "0" && c <= "9"
                || c == "." || c == "_" || c == "-")) {
                return false;
            }
        }
        return slashes == 1;
    }

    /// @notice Claim an open bounty with an ML-DSA signature over ClaimV1
    /// for the next round. Sets the caller as payee.
    /// @dev Front-running analysis: the signed ClaimV1 payload covers
    /// msg.sender, block.chainid, this escrow, the bounty id, identityHash and
    /// the next claimRound, and is verified against msg.sender's own live
    /// registered key — a signature copied from someone else's transaction
    /// fails verification for any other caller. First-come claiming is
    /// intentional; squatting is bounded by claimTimeout and by verifier
    /// identity review (THREAT_MODEL.md T-11).
    function claim(uint256 bountyId, bytes32 identityHash, bytes calldata signature)
        external nonReentrant
    {
        Bounty storage b = _bounty(bountyId);
        _normalize(bountyId, b);
        if (b.state != State.Open && b.state != State.Claimed) revert ClaimClosed();
        if (b.state == State.Claimed) revert ClaimActive(b.claimExpiresAt);
        if (block.timestamp >= b.deadline) revert ClaimClosed();
        if (b.claimTimeout > b.deadline - block.timestamp) revert ClaimWindowTooShort();
        if (identityHash == bytes32(0)) revert InvalidParameters();
        if (msg.sender == b.funder || msg.sender == b.verifiers[0]
            || msg.sender == b.verifiers[1] || msg.sender == b.verifiers[2]) {
            revert ClaimantExcluded(msg.sender);
        }
        (bool reg, uint8 alg, bytes memory pk, bool prov) = _keyStatus(msg.sender);
        if (!(reg && alg == ALGORITHM_ID && pk.length == KEY_BYTES && prov)) {
            revert KeyIneligible(msg.sender);
        }
        if (_keySharedWithVerifier(b, keccak256(pk))) {
            revert ClaimantExcluded(msg.sender);
        }
        // signature is bound to msg.sender (and the next claimRound) inside the
        // payload, so replaying another caller's claim tx cannot succeed
        if (signature.length != SIG_BYTES
            || !_pqcVerify(pk, signature,
                _claimMessage(bountyId, msg.sender, identityHash, b.claimRound + 1))) {
            revert BadClaimSignature();
        }

        b.claimRound += 1;
        b.payee = msg.sender;
        b.payeeIdentityHash = identityHash;
        b.claimExpiresAt = uint64(block.timestamp) + b.claimTimeout;
        b.state = State.Claimed;
        emit Claimed(bountyId, msg.sender, identityHash, b.claimRound, b.claimExpiresAt);
    }

    /// @notice Release an expired claim: stored Claimed becomes Open and its
    /// claimant fields are cleared.
    /// @dev Permissionless by design, not an oversight. The function only acts
    /// on a claim that has already expired: it moves no funds, changes no
    /// credit, and does exactly what `claim()` itself does to an expired claim
    /// via `_normalize` — the same transition every other entry point performs
    /// lazily. Restricting it to the funder or the former claimant would
    /// protect nothing, since `claim()` performs the same release, and would
    /// only stop others (an indexer, the app, a new claimant) from publishing
    /// the release as a `ClaimReleased` event.
    /// Preconditions (revert order preserved): stored state must be Claimed,
    /// else `InvalidState`; `block.timestamp >= claimExpiresAt`, else
    /// `ClaimActive(claimExpiresAt)`. Emits `ClaimReleased` via `_normalize`.
    function reopen(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (b.state != State.Claimed) revert InvalidState(b.state, State.Claimed);
        if (block.timestamp < b.claimExpiresAt) revert ClaimActive(b.claimExpiresAt);
        _normalize(bountyId, b);
    }

    /// @notice Submit an INITIAL quorum verdict for an Open/Claimed bounty.
    function submitVerdict(Verdict calldata v, uint8[] calldata signerIndices,
        bytes[] calldata signatures) external nonReentrant
    {
        Bounty storage b = _bounty(v.bountyId);
        _normalize(v.bountyId, b);
        if (b.state != State.Open && b.state != State.Claimed) {
            revert InvalidState(b.state, State.Open);
        }
        if (v.phase != Phase.INITIAL) revert InvalidPhase();
        if (v.nonce != b.nonce) revert InvalidNonce(b.nonce, v.nonce);
        if (v.claimRound != b.claimRound) revert InvalidClaimRound(b.claimRound, v.claimRound);
        if (block.timestamp > b.deadline) revert SubmissionClosed();
        _checkVerdictFields(b, v, b.payee);
        bytes[] memory pubs = _checkSignersAndKeys(b, signerIndices, signatures.length);
        _verifySignatures(b, v, signerIndices, signatures, pubs);
        if (v.outcome == Outcome.PAY && !_eligible(b.payee)) revert KeyIneligible(b.payee);

        b.nonce += 1;
        b.state = State.Pending;
        b.initialOutcome = v.outcome;
        b.initialMergedAt = v.mergedAt;
        b.initialEvidenceHash = v.evidenceHash;
        bytes32 payloadHash = keccak256(_payload(b, v));
        b.pendingVerdictHash = payloadHash;
        b.challengeEndsAt = uint64(block.timestamp) + CHALLENGE_PERIOD;

        emit VerdictSubmitted(v.bountyId, payloadHash, v.outcome, v.mergedAt,
            v.evidenceHash, v.nonce, v.claimRound, b.challengeEndsAt);
    }

    /// @notice Bond a dispute against a Pending verdict.
    function dispute(uint256 bountyId, bytes32 evidenceHash) external payable nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (b.state != State.Pending) revert InvalidState(b.state, State.Pending);
        if (evidenceHash == bytes32(0)) revert InvalidParameters();
        if (block.timestamp >= b.challengeEndsAt) revert ChallengeClosed();
        if (msg.value != b.bondAmount) revert WrongValue(b.bondAmount, msg.value);

        b.state = State.Disputed;
        b.disputer = msg.sender;
        b.disputeEvidenceHash = evidenceHash;
        totalLiabilities += msg.value;
        emit Disputed(bountyId, msg.sender, b.bondAmount, evidenceHash);
    }

    /// @notice Resolve a Disputed bounty with a fresh DISPUTE quorum.
    function resolveDispute(Verdict calldata v, uint8[] calldata signerIndices,
        bytes[] calldata signatures) external nonReentrant
    {
        Bounty storage b = _bounty(v.bountyId);
        _normalize(v.bountyId, b);
        if (b.state != State.Disputed) revert InvalidState(b.state, State.Disputed);
        if (v.phase != Phase.DISPUTE) revert InvalidPhase();
        if (v.nonce != b.nonce) revert InvalidNonce(b.nonce, v.nonce);
        if (v.claimRound != b.claimRound) revert InvalidClaimRound(b.claimRound, v.claimRound);
        _checkVerdictFields(b, v, b.payee);
        bytes[] memory pubs = _checkSignersAndKeys(b, signerIndices, signatures.length);
        _verifySignatures(b, v, signerIndices, signatures, pubs);

        b.nonce += 1;
        bytes32 payloadHash = keccak256(_payload(b, v));
        bool upheld = v.outcome != b.initialOutcome;
        _settleOutcome(v.bountyId, b, v.outcome);
        if (upheld) {
            _credit(v.bountyId, b.disputer, b.bondAmount + b.challengeReward, false);
        } else if (b.payee != address(0)) {
            _credit(v.bountyId, b.payee, b.bondAmount, true);
            _credit(v.bountyId, b.funder, b.challengeReward, false);
        } else {
            _credit(v.bountyId, b.funder, b.bondAmount, false);
            _credit(v.bountyId, b.funder, b.challengeReward, false);
        }

        emit DisputeResolved(v.bountyId, payloadHash, v.outcome, upheld,
            v.evidenceHash, v.nonce, v.claimRound);
        emit Settled(v.bountyId, b.state);
    }

    /// @notice Finalize an unchallenged Pending verdict once the window closes.
    function finalize(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (b.state != State.Pending) revert InvalidState(b.state, State.Pending);
        if (block.timestamp < b.challengeEndsAt) revert ChallengeOpen();

        if (b.initialOutcome == Outcome.PAY) {
            _settleOutcome(bountyId, b, Outcome.PAY);
            _credit(bountyId, b.funder, b.challengeReward, false);
        } else {
            _credit(bountyId, b.funder, b.amount + b.challengeReward, false);
            b.state = State.Refunded;
        }

        emit Settled(bountyId, b.state);
    }

    /// @notice Refund an untouched bounty after the deadline. Funder only.
    function refundExpired(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (msg.sender != b.funder) {
            if (b.funder == address(0)) revert UnknownBounty(bountyId);
            revert NotFunder();
        }
        _normalize(bountyId, b);
        if (b.state != State.Open && b.state != State.Claimed) {
            revert InvalidState(b.state, State.Open);
        }
        if (block.timestamp <= b.deadline) revert DeadlineNotPassed();

        _credit(bountyId, b.funder, b.amount + b.challengeReward, false);
        b.state = State.Refunded;

        emit Settled(bountyId, State.Refunded);
    }

    /// @notice Withdraw all of the caller's native QOR credits to the caller.
    /// @dev Liability model: credits only relabel liability already counted in
    /// `totalLiabilities` (escrow-held → credit-held), so withdrawing `total`
    /// decrements it by exactly what the caller was credited. Solidity 0.8
    /// checked arithmetic guards every credit add/remove.
    function withdraw() external nonReentrant {
        uint256 ungated = ungatedCredits[msg.sender];
        uint256 gated = gatedCredits[msg.sender];
        uint256 total = ungated + gated;
        if (total == 0) revert NothingToWithdraw();
        if (gated > 0 && !_eligible(msg.sender)) revert KeyIneligible(msg.sender);

        ungatedCredits[msg.sender] = 0;
        gatedCredits[msg.sender] = 0;
        totalLiabilities -= total;
        // Sanity guard, unreachable in a valid state: total <= totalLiabilities
        // <= address(this).balance holds because credits are only minted from
        // already-locked liability and forced donations can only raise balance.
        if (total > address(this).balance) revert TransferFailed();
        emit Withdrawn(msg.sender, total);

        (bool ok,) = msg.sender.call{value: total}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Raw signing bytes for a claim.
    function claimMessage(uint256 bountyId, address claimant, bytes32 identityHash,
        uint256 claimRound) external view returns (bytes memory)
    {
        return _claimMessage(bountyId, claimant, identityHash, claimRound);
    }

    /// @notice Raw signing bytes for a verdict, bound to stored dispute fields.
    function verdictMessage(Verdict calldata v) external view returns (bytes memory) {
        return abi.encodePacked("qorechain-msg-v1|", nativeChainId, "|",
            _payload(bounties[v.bountyId], v));
    }

    /// @notice Normalized view: an expired stored claim reads as Open with
    /// cleared claimant fields.
    function getBounty(uint256 bountyId) external view returns (Bounty memory b) {
        b = bounties[bountyId];
        if (b.state == State.Claimed && block.timestamp >= b.claimExpiresAt) {
            b.state = State.Open;
            b.payee = address(0);
            b.payeeIdentityHash = bytes32(0);
            b.claimExpiresAt = 0;
        }
    }

    function creditOf(address account) external view
        returns (uint256 ungated, uint256 payeeGated)
    {
        return (ungatedCredits[account], gatedCredits[account]);
    }

    // --- internals ---

    function _bounty(uint256 bountyId) internal view returns (Bounty storage b) {
        b = bounties[bountyId];
        if (b.funder == address(0)) revert UnknownBounty(bountyId);
    }

    /// Lazy expiry: a stored Claimed record past its expiry becomes Open and
    /// clears its claimant fields. claimRound is kept.
    function _normalize(uint256 bountyId, Bounty storage b) internal {
        if (b.state == State.Claimed && block.timestamp >= b.claimExpiresAt) {
            address claimant = b.payee;
            b.state = State.Open;
            b.payee = address(0);
            b.payeeIdentityHash = bytes32(0);
            b.claimExpiresAt = 0;
            emit ClaimReleased(bountyId, claimant, b.claimRound);
        }
    }

    function _claimMessage(uint256 bountyId, address claimant, bytes32 identityHash,
        uint256 claimRound) internal view returns (bytes memory)
    {
        return abi.encodePacked("qorechain-msg-v1|", nativeChainId, "|",
            abi.encode(CLAIM_TYPEHASH, block.chainid, address(this), bountyId,
                claimant, identityHash, claimRound));
    }

    function _payload(Bounty storage b, Verdict calldata v) internal view returns (bytes memory) {
        bytes32 disputedVerdictHash;
        bytes32 disputeEvidenceHash;
        if (v.phase == Phase.DISPUTE) {
            disputedVerdictHash = b.pendingVerdictHash;
            disputeEvidenceHash = b.disputeEvidenceHash;
        }
        return abi.encodePacked(
            abi.encode(VERDICT_TYPEHASH, block.chainid, address(this), v.bountyId,
                uint8(v.phase), uint8(v.outcome)),
            abi.encode(v.payee, v.mergedAt, v.evidenceHash, v.nonce, v.claimRound,
                disputedVerdictHash, disputeEvidenceHash));
    }

    /// claimant: INITIAL -> current active claimant; DISPUTE -> frozen snapshot.
    function _checkVerdictFields(Bounty storage b, Verdict calldata v, address claimant)
        internal view
    {
        if (v.outcome == Outcome.PAY) {
            if (claimant == address(0)) revert ClaimExpired();
            if (v.payee != claimant) revert NotClaimant();
            if (v.mergedAt == 0 || v.mergedAt > block.timestamp
                || v.mergedAt > b.deadline || v.evidenceHash == bytes32(0)) {
                revert InvalidVerdict();
            }
        } else {
            if (v.payee != address(0) || v.mergedAt != 0 || v.evidenceHash == bytes32(0)) {
                revert InvalidVerdict();
            }
        }
    }

    function _checkSignersAndKeys(Bounty storage b, uint8[] calldata signerIndices,
        uint256 sigCount) internal view returns (bytes[] memory pubs)
    {
        if (sigCount != signerIndices.length
            || (signerIndices.length != 2 && signerIndices.length != 3)) {
            revert InvalidSigners();
        }
        // bound: caller-supplied length, already required to be 2 or 3
        for (uint256 k = 1; k < signerIndices.length; ++k) {
            if (signerIndices[k] <= signerIndices[k - 1]) revert InvalidSigners();
        }
        if (signerIndices[signerIndices.length - 1] >= VERIFIER_COUNT) revert InvalidSigners();

        pubs = new bytes[](VERIFIER_COUNT);
        bool[VERIFIER_COUNT] memory reg;
        uint8[VERIFIER_COUNT] memory alg;
        bool[VERIFIER_COUNT] memory prov;
        for (uint256 i; i < VERIFIER_COUNT; ++i) { // fixed set: 3 staticcalls
            (reg[i], alg[i], pubs[i], prov[i]) = _keyStatus(b.verifiers[i]);
        }
        // bound: caller-supplied length, already required to be 2 or 3
        for (uint256 k; k < signerIndices.length; ++k) {
            uint8 idx = signerIndices[k];
            if (!(reg[idx] && alg[idx] == ALGORITHM_ID
                && pubs[idx].length == KEY_BYTES && prov[idx])) {
                revert KeyIneligible(b.verifiers[idx]);
            }
        }
        for (uint256 i; i < VERIFIER_COUNT; ++i) { // fixed set: 3
            if (!reg[i] || pubs[i].length == 0) continue;
            for (uint256 j = i + 1; j < VERIFIER_COUNT; ++j) { // 3 pair checks
                if (reg[j] && pubs[j].length != 0
                    && keccak256(pubs[i]) == keccak256(pubs[j])) {
                    revert DuplicateVerifierKey();
                }
            }
        }
    }

    function _verifySignatures(Bounty storage b, Verdict calldata v,
        uint8[] calldata signerIndices, bytes[] calldata signatures, bytes[] memory pubs)
        internal view
    {
        bytes memory message = abi.encodePacked("qorechain-msg-v1|", nativeChainId, "|",
            _payload(b, v));
        // bound: caller-supplied length, already required to be 2 or 3
        for (uint256 k; k < signerIndices.length; ++k) {
            if (signatures[k].length != SIG_BYTES) {
                revert BadSignature(signerIndices[k]);
            }
            if (!_pqcVerify(pubs[signerIndices[k]], signatures[k], message)) {
                revert BadSignature(signerIndices[k]);
            }
        }
    }

    /// @dev Fail-closed: every malformed or surprising response from the
    /// pqcKeyStatus precompile reverts `PrecompileUnavailable` rather than
    /// being coerced into "unregistered". Checks, in order: call success flag;
    /// minimum length KEYS_STATUS_MIN_BYTES (five-word head); each boolean word
    /// exactly 0 or 1; algorithm word fits uint8; the pubkey tail offset equals
    /// KEYS_STATUS_DATA_OFFSET; the pubkey length plus its 32-byte padding
    /// stays inside the returned buffer.
    function _keyStatus(address account) internal view
        returns (bool registered, uint8 algorithmId8, bytes memory pubkey, bool proven)
    {
        (bool ok, bytes memory ret) = PQC_KEYS.staticcall(
            abi.encodeCall(IQorePQC.pqcKeyStatus, (account)));
        if (ok && ret.length >= KEYS_STATUS_MIN_BYTES) {
            uint256 w0; uint256 w1; uint256 off; uint256 w3; uint256 len;
            assembly {
                let p := add(ret, 32)
                w0 := mload(p)
                w1 := mload(add(p, 32))
                off := mload(add(p, 64))
                w3 := mload(add(p, 96))
                len := mload(add(p, 128))
            }
            if (w0 <= 1 && w1 <= 255 && off == KEYS_STATUS_DATA_OFFSET && w3 <= 1
                && len <= ret.length
                && len + ((32 - (len % 32)) % 32) <= ret.length - KEYS_STATUS_MIN_BYTES) {
                registered = w0 == 1;
                // forge-lint: disable-next-line(unsafe-typecast)
                algorithmId8 = uint8(w1);
                proven = w3 == 1;
                pubkey = new bytes(len);
                assembly {
                    let src := add(ret, 0xc0)
                    let dst := add(pubkey, 32)
                    for { let i := 0 } lt(i, len) { i := add(i, 32) } {
                        mstore(add(dst, i), mload(add(src, i)))
                    }
                }
                return (registered, algorithmId8, pubkey, proven);
            }
        }
        revert PrecompileUnavailable();
    }

    /// @dev Fail-closed: a failed call, a return that is not exactly one word,
    /// or a word that is not 0/1 reverts `PrecompileUnavailable` instead of
    /// silently counting as "signature invalid" or "signature valid".
    function _pqcVerify(bytes memory pubkey, bytes calldata sig, bytes memory message)
        internal view returns (bool)
    {
        (bool ok, bytes memory ret) = PQC_VERIFY.staticcall(
            abi.encodeCall(IQorePQC.pqcVerify, (pubkey, sig, message)));
        if (!ok || ret.length != VERIFY_RET_BYTES) revert PrecompileUnavailable();
        uint256 w;
        assembly { w := mload(add(ret, 32)) }
        if (w > 1) revert PrecompileUnavailable();
        return w == 1;
    }

    function _keySharedWithVerifier(Bounty storage b, bytes32 callerHash)
        internal view returns (bool)
    {
        for (uint256 i; i < VERIFIER_COUNT; ++i) { // fixed set: 3 staticcalls
            (bool reg,, bytes memory pk,) = _keyStatus(b.verifiers[i]);
            if (reg && pk.length != 0 && keccak256(pk) == callerHash) return true;
        }
        return false;
    }

    function _eligible(address account) internal view returns (bool) {
        (bool reg, uint8 alg, bytes memory pk, bool prov) = _keyStatus(account);
        return reg && alg == ALGORITHM_ID && pk.length == KEY_BYTES && prov;
    }

    function _eligibleKeyHash(address account) internal view returns (bytes32) {
        (bool reg, uint8 alg, bytes memory pk, bool prov) = _keyStatus(account);
        if (!(reg && alg == ALGORITHM_ID && pk.length == KEY_BYTES && prov)) {
            revert KeyIneligible(account);
        }
        return keccak256(pk);
    }

    function _requireDistinctEligibleKeys(address[3] calldata verifiers) internal view {
        bytes32[3] memory keyHashes;
        for (uint256 i; i < VERIFIER_COUNT; ++i) keyHashes[i] = _eligibleKeyHash(verifiers[i]); // fixed set: 3
        for (uint256 i; i < VERIFIER_COUNT; ++i) { // fixed set: 3
            for (uint256 j = i + 1; j < VERIFIER_COUNT; ++j) { // 3 pair checks
                if (keyHashes[i] == keyHashes[j]) revert DuplicateVerifierKey();
            }
        }
    }

    /// @dev Liability model: `_credit` relabels value already counted in
    /// `totalLiabilities` (added when the QOR was locked at create/dispute
    /// time); it never creates new liability and never moves coins itself.
    /// Solidity 0.8 checked arithmetic makes the `+=` revert on overflow —
    /// an overflow would mean accounting already exceeded every deposited wei.
    function _credit(uint256 bountyId, address account, uint256 amount, bool gated) internal {
        if (gated) gatedCredits[account] += amount;
        else ungatedCredits[account] += amount;
        emit Credited(bountyId, account, amount, gated);
    }

    /// Principal credit + terminal state for `outcome`. Caller adds bond/reward credits.
    function _settleOutcome(uint256 bountyId, Bounty storage b, Outcome outcome) internal {
        if (outcome == Outcome.PAY) {
            if (!_eligible(b.payee)) revert KeyIneligible(b.payee);
            _credit(bountyId, b.payee, b.amount, true);
            b.state = State.Paid;
        } else {
            _credit(bountyId, b.funder, b.amount, false);
            b.state = State.Refunded;
        }
    }
}
