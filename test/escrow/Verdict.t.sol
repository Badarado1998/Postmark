// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowFixture} from "./EscrowFixture.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";
import {FalseVerifyPrecompile, RevertingPrecompile} from "./mocks/Mocks.sol";

contract VerdictTest is EscrowFixture {
    function _payVerdict(uint256 id) internal view returns (PostmarkEscrow.Verdict memory) {
        return _verdict(id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 0);
    }

    function _refundVerdict(uint256 id) internal view returns (PostmarkEscrow.Verdict memory) {
        return _verdict(id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, 0);
    }

    function testSubmitPayTwoOfThree() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 1, 2);
        escrow.submitVerdict(v, idx, sigs);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Pending));
        assertEq(b.nonce, 1);
        assertEq(b.challengeEndsAt, uint64(block.timestamp) + 24 hours);
        assertTrue(b.pendingVerdictHash != bytes32(0));
        // frozen snapshot kept
        assertEq(b.payee, claimant);
        assertEq(b.claimRound, 1);
    }

    function testSubmitPayThreeOfThreeAndRelayer() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign3(v);
        vm.prank(relayer); // relayer identity does not authorize; just transports
        escrow.submitVerdict(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testSubmitRefundFromOpenAndClaimed() public {
        // REFUND quorum on an Open bounty (no claim)
        uint256 id = _create();
        PostmarkEscrow.Verdict memory v = _refundVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        escrow.submitVerdict(v, idx, sigs);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Pending));
        assertEq(uint8(b.initialOutcome), uint8(PostmarkEscrow.Outcome.REFUND));
        assertEq(b.payee, address(0)); // no claimant frozen
        // REFUND quorum on an actively Claimed bounty
        uint256 id2 = _create();
        _claim(id2, claimant, cSk);
        v = _verdict(id2, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id2).nonce);
        (idx, sigs) = _sign(v, 0, 1);
        escrow.submitVerdict(v, idx, sigs);
        b = escrow.getBounty(id2);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Pending));
        assertEq(b.payee, claimant); // active claimant frozen into the snapshot
    }

    function testSubmitAtExactDeadline() public {
        // REFUND quorum at the deadline instant is still valid (claims are
        // always expired by then: claimExpiresAt <= deadline)
        uint256 id = _create();
        _claim(id, claimant, cSk);
        vm.warp(deadline);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, 0);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        escrow.submitVerdict(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testSubmitAfterDeadlineReverts() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        vm.warp(deadline + 1);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            deadline, 0);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(PostmarkEscrow.SubmissionClosed.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testPayWithoutClaimIsClaimExpired() public {
        uint256 id = _create();
        PostmarkEscrow.Verdict memory v = PostmarkEscrow.Verdict({
            bountyId: id, phase: PostmarkEscrow.Phase.INITIAL,
            outcome: PostmarkEscrow.Outcome.PAY, payee: claimant,
            mergedAt: uint64(block.timestamp), evidenceHash: EVIDENCE,
            nonce: 0, claimRound: 0});
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(PostmarkEscrow.ClaimExpired.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testPayWithExpiredClaimFails() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        vm.warp(escrow.getBounty(id).claimExpiresAt); // claim lapses
        PostmarkEscrow.Verdict memory v = PostmarkEscrow.Verdict({
            bountyId: id, phase: PostmarkEscrow.Phase.INITIAL,
            outcome: PostmarkEscrow.Outcome.PAY, payee: claimant,
            mergedAt: uint64(block.timestamp), evidenceHash: EVIDENCE,
            nonce: 0, claimRound: 1});
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(PostmarkEscrow.ClaimExpired.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testStaleRoundFails() public {
        uint256 id = _create();
        _claim(id, claimant, cSk); // round 1
        vm.warp(escrow.getBounty(id).claimExpiresAt);
        _claim(id, claimant, cSk); // round 2
        PostmarkEscrow.Verdict memory v = PostmarkEscrow.Verdict({
            bountyId: id, phase: PostmarkEscrow.Phase.INITIAL,
            outcome: PostmarkEscrow.Outcome.PAY, payee: claimant,
            mergedAt: uint64(block.timestamp), evidenceHash: EVIDENCE,
            nonce: 0, claimRound: 1}); // stale round
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidClaimRound.selector, 2, 1));
        escrow.submitVerdict(v, idx, sigs);
    }

    function testCheckOrderNonceBeatsSignature() public {
        uint256 id = _create();
        PostmarkEscrow.Verdict memory v = _refundVerdict(id);
        v.nonce = 5;
        uint8[] memory idx = new uint8[](2);
        idx[0] = 0; idx[1] = 1;
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = new bytes(1);
        sigs[1] = new bytes(1);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.InvalidNonce.selector, 0, 5));
        escrow.submitVerdict(v, idx, sigs);
    }

    function testCheckOrderRoundBeatsFields() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _refundVerdict(id);
        v.claimRound = 7;
        v.evidenceHash = bytes32(0); // bad field too, but round is checked first
        uint8[] memory idx = new uint8[](2);
        idx[0] = 0; idx[1] = 1;
        bytes[] memory sigs = new bytes[](2);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.InvalidClaimRound.selector, 1, 7));
        escrow.submitVerdict(v, idx, sigs);
    }

    function testCheckOrderPhaseBeatsNonce() public {
        uint256 id = _create();
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 5);
        uint8[] memory idx = new uint8[](2);
        bytes[] memory sigs = new bytes[](2);
        vm.expectRevert(PostmarkEscrow.InvalidPhase.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testCheckOrderStateBeatsPhase() public {
        uint256 id = _pendingPay();
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 1);
        uint8[] memory idx = new uint8[](2);
        bytes[] memory sigs = new bytes[](2);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Pending, PostmarkEscrow.State.Open));
        escrow.submitVerdict(v, idx, sigs);
    }

    function testUnknownBounty() public {
        PostmarkEscrow.Verdict memory v = _verdict(
            42, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, 0);
        uint8[] memory idx = new uint8[](2);
        bytes[] memory sigs = new bytes[](2);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.UnknownBounty.selector, 42));
        escrow.submitVerdict(v, idx, sigs);
    }

    function testInvalidVerdictFields() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint8[] memory idx = new uint8[](2);
        idx[0] = 0; idx[1] = 1;
        bytes[] memory sigs = new bytes[](2);

        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        // wrong payee -> NotClaimant (claimant binding precedes field rules)
        v.payee = disputer;
        vm.expectRevert(PostmarkEscrow.NotClaimant.selector);
        escrow.submitVerdict(v, idx, sigs);
        // mergedAt zero
        v.payee = claimant;
        v.mergedAt = 0;
        vm.expectRevert(PostmarkEscrow.InvalidVerdict.selector);
        escrow.submitVerdict(v, idx, sigs);
        // mergedAt in future
        v.mergedAt = uint64(block.timestamp + 1);
        vm.expectRevert(PostmarkEscrow.InvalidVerdict.selector);
        escrow.submitVerdict(v, idx, sigs);
        // mergedAt after deadline
        v.mergedAt = deadline + 1;
        vm.expectRevert(PostmarkEscrow.InvalidVerdict.selector);
        escrow.submitVerdict(v, idx, sigs);
        // zero evidence
        v.mergedAt = uint64(block.timestamp);
        v.evidenceHash = bytes32(0);
        vm.expectRevert(PostmarkEscrow.InvalidVerdict.selector);
        escrow.submitVerdict(v, idx, sigs);
        // REFUND with payee set
        v = _verdict(id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, 0);
        v.payee = claimant;
        vm.expectRevert(PostmarkEscrow.InvalidVerdict.selector);
        escrow.submitVerdict(v, idx, sigs);
        // REFUND with mergedAt set
        v.payee = address(0);
        v.mergedAt = 1;
        vm.expectRevert(PostmarkEscrow.InvalidVerdict.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testInvalidSignerShapes() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (, bytes[] memory sigs) = _sign(v, 0, 1);

        uint8[] memory bad = new uint8[](3);
        bad[0] = 0; bad[1] = 1; bad[2] = 2;
        vm.expectRevert(PostmarkEscrow.InvalidSigners.selector);
        escrow.submitVerdict(v, bad, sigs);
        uint8[] memory one = new uint8[](1);
        bytes[] memory oneSig = new bytes[](1);
        oneSig[0] = sigs[0];
        vm.expectRevert(PostmarkEscrow.InvalidSigners.selector);
        escrow.submitVerdict(v, one, oneSig);
        bad = new uint8[](2);
        bad[0] = 1; bad[1] = 0;
        vm.expectRevert(PostmarkEscrow.InvalidSigners.selector);
        escrow.submitVerdict(v, bad, sigs);
        bad[0] = 0; bad[1] = 0;
        vm.expectRevert(PostmarkEscrow.InvalidSigners.selector);
        escrow.submitVerdict(v, bad, sigs);
        bad[0] = 1; bad[1] = 3;
        vm.expectRevert(PostmarkEscrow.InvalidSigners.selector);
        escrow.submitVerdict(v, bad, sigs);
    }

    function testBadSignatures() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);

        bytes[] memory bad = new bytes[](2);
        bad[0] = new bytes(100);
        bad[1] = sigs[1];
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v, idx, bad);

        bad[0] = sigs[0];
        bad[0][10] ^= 0x01;
        bad[1] = sigs[1];
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v, idx, bad);

        bytes[] memory wrong = new bytes[](2);
        wrong[0] = pqcSign(vSks[2], escrow.verdictMessage(v));
        wrong[1] = sigs[1];
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v, idx, wrong);

        PostmarkEscrow.Verdict memory other = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 99);
        wrong[0] = pqcSign(vSks[0], escrow.verdictMessage(other));
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v, idx, wrong);
    }

    function testCrossBountyReplay() public {
        uint256 id1 = _create();
        uint256 id2 = _create();
        _claim(id1, claimant, cSk);
        _claim(id2, claimant, cSk);
        PostmarkEscrow.Verdict memory v1 = _payVerdict(id1);
        PostmarkEscrow.Verdict memory v2 = _payVerdict(id2);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v1, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v2, idx, sigs);
    }

    function testPayeeRevokedBeforePay() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        pqcRevoke(claimant);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.submitVerdict(v, idx, sigs);
        // REFUND verdict does not need the claimant key
        v = _refundVerdict(id);
        (idx, sigs) = _sign(v, 0, 1);
        escrow.submitVerdict(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testSignerRevokedFails() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        pqcRevoke(verifiers[1]);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.KeyIneligible.selector, verifiers[1]));
        escrow.submitVerdict(v, idx, sigs);
    }

    function testNonSigningRevokedVerifierIgnored() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        pqcRevoke(verifiers[2]);
        _submitPay(id); // signs with 0,1
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testVerifierRotation() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        (, bytes memory newSk) = pqcGenerateAndRegister(verifiers[0], bytes32(uint256(999)));
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v, idx, sigs);
        sigs[0] = pqcSign(newSk, escrow.verdictMessage(v));
        escrow.submitVerdict(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testRotatedIntoSharedKeyFails() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        pqcRegister(verifiers[2], vPks[0], true);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(PostmarkEscrow.DuplicateVerifierKey.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testKeyStatusPrecompileFailures() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.etch(0x0000000000000000000000000000000000000a02, address(new RevertingPrecompile()).code);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
        vm.etch(0x0000000000000000000000000000000000000a02, "");
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testVerifyPrecompileFailures() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _payVerdict(id);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.etch(0x0000000000000000000000000000000000000a01, address(new FalseVerifyPrecompile()).code);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v, idx, sigs);
        vm.etch(0x0000000000000000000000000000000000000a01, address(new RevertingPrecompile()).code);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
        vm.etch(0x0000000000000000000000000000000000000a01, "");
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testPendingFreezesSnapshotPastExpiry() public {
        uint256 id = _pendingPay();
        // original claim expiry passes while Pending: snapshot stays frozen
        vm.warp(escrow.getBounty(id).claimExpiresAt + 10 days);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Pending));
        assertEq(b.payee, claimant);
        assertEq(b.payeeIdentityHash, IDENTITY);
    }
}
