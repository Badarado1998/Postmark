// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PqcTest} from "../../src/test-utils/PqcTest.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";

abstract contract EscrowFixture is PqcTest {
    PostmarkEscrow internal escrow;

    address internal funder = makeAddr("funder");
    address internal claimant = makeAddr("claimant");
    address internal claimant2 = makeAddr("claimant2");
    address internal disputer = makeAddr("disputer");
    address internal relayer = makeAddr("relayer");
    address[3] internal verifiers;
    bytes internal cPk;
    bytes internal cSk;
    bytes internal c2Pk;
    bytes internal c2Sk;
    bytes[3] internal vPks;
    bytes[3] internal vSks;

    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant REWARD = 0.1 ether;
    uint256 internal constant BOND = 0.2 ether;
    uint64 internal constant CLAIM_TIMEOUT = 1 days;
    string internal constant OWNER_REPO = "acme/widgets";
    uint8 internal constant KIND = 0;
    uint256 internal constant NUMBER = 42;
    bytes32 internal constant WORK =
        keccak256(abi.encode("github", "acme/widgets", uint8(0), uint256(42)));
    bytes32 internal constant IDENTITY = keccak256("postmark.identity");
    bytes32 internal constant EVIDENCE = keccak256("postmark.evidence");
    bytes32 internal constant DEVIDENCE = keccak256("postmark.dispute.evidence");
    uint64 internal deadline;

    function setUp() public virtual override {
        super.setUp();
        vm.warp(1_700_000_000);
        deadline = uint64(block.timestamp + 30 days);
        escrow = new PostmarkEscrow("qorechain-diana");
        verifiers = [makeAddr("v0"), makeAddr("v1"), makeAddr("v2")];
        (cPk, cSk) = pqcGenerateAndRegister(claimant, bytes32(uint256(7)));
        (c2Pk, c2Sk) = pqcGenerateAndRegister(claimant2, bytes32(uint256(8)));
        for (uint256 i; i < 3; ++i) {
            (vPks[i], vSks[i]) = pqcGenerateAndRegister(verifiers[i], bytes32(uint256(100 + i)));
        }
        vm.deal(funder, 100 ether);
        vm.deal(disputer, 100 ether);
    }

    function _verdict(uint256 id, PostmarkEscrow.Phase phase, PostmarkEscrow.Outcome outcome,
        uint64 mergedAt, uint256 nonce) internal view returns (PostmarkEscrow.Verdict memory)
    {
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        return PostmarkEscrow.Verdict({
            bountyId: id, phase: phase, outcome: outcome,
            payee: outcome == PostmarkEscrow.Outcome.PAY ? b.payee : address(0),
            mergedAt: mergedAt, evidenceHash: EVIDENCE, nonce: nonce,
            claimRound: b.claimRound
        });
    }

    function _sign(PostmarkEscrow.Verdict memory v, uint8 a, uint8 b)
        internal returns (uint8[] memory idx, bytes[] memory sigs)
    {
        idx = new uint8[](2);
        idx[0] = a;
        idx[1] = b;
        bytes memory m = escrow.verdictMessage(v);
        sigs = new bytes[](2);
        sigs[0] = pqcSign(vSks[a], m);
        sigs[1] = pqcSign(vSks[b], m);
    }

    function _sign3(PostmarkEscrow.Verdict memory v)
        internal returns (uint8[] memory idx, bytes[] memory sigs)
    {
        idx = new uint8[](3);
        idx[0] = 0; idx[1] = 1; idx[2] = 2;
        bytes memory m = escrow.verdictMessage(v);
        sigs = new bytes[](3);
        for (uint256 i; i < 3; ++i) sigs[i] = pqcSign(vSks[i], m);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(funder);
        return escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT,
            verifiers, BOND, REWARD);
    }

    /// Real ML-DSA-87 claim by `who` (must have a registered key).
    function _claim(uint256 id, address who, bytes memory sk) internal {
        uint256 round = escrow.getBounty(id).claimRound + 1;
        bytes memory m = escrow.claimMessage(id, who, IDENTITY, round);
        vm.prank(who);
        escrow.claim(id, IDENTITY, pqcSign(sk, m));
    }

    function _claimSubmitPay(uint256 id) internal {
        _claim(id, claimant, cSk);
        _submitPay(id);
    }

    function _submitPay(uint256 id) internal {
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        escrow.submitVerdict(v, idx, sigs);
    }

    function _submitRefund(uint256 id) internal {
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        escrow.submitVerdict(v, idx, sigs);
    }

    function _pendingPay() internal returns (uint256 id) {
        id = _create();
        _claimSubmitPay(id);
    }

    function _dispute(uint256 id) internal {
        vm.prank(disputer);
        escrow.dispute{value: BOND}(id, DEVIDENCE);
    }

    function _resolvePay(uint256 id) internal {
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 2);
        escrow.resolveDispute(v, idx, sigs);
    }

    function _resolveRefund(uint256 id) internal {
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 2);
        escrow.resolveDispute(v, idx, sigs);
    }

    function _credits(address a) internal view returns (uint256 ungated, uint256 gated) {
        return escrow.creditOf(a);
    }
}
