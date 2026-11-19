// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowFixture} from "./EscrowFixture.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";

contract DisputeTest is EscrowFixture {
    function testDispute() public {
        uint256 id = _pendingPay();
        uint64 endsAt = escrow.getBounty(id).challengeEndsAt;
        vm.warp(endsAt - 1); // last valid instant
        _dispute(id);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Disputed));
        assertEq(b.disputer, disputer);
        assertEq(b.disputeEvidenceHash, DEVIDENCE);
        assertEq(escrow.totalLiabilities(), AMOUNT + REWARD + BOND);
    }

    function testDisputeReverts() public {
        uint256 id = _create();
        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Open, PostmarkEscrow.State.Pending));
        escrow.dispute{value: BOND}(id, DEVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.UnknownBounty.selector, 99));
        escrow.dispute{value: BOND}(99, DEVIDENCE);

        _claimSubmitPay(id);
        vm.prank(disputer);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.dispute{value: BOND}(id, bytes32(0));
        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.WrongValue.selector, BOND, BOND - 1));
        escrow.dispute{value: BOND - 1}(id, DEVIDENCE);
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        vm.prank(disputer);
        vm.expectRevert(PostmarkEscrow.ChallengeClosed.selector);
        escrow.dispute{value: BOND}(id, DEVIDENCE);
    }

    function testSecondDisputeReverts() public {
        uint256 id = _pendingPay();
        _dispute(id);
        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Disputed, PostmarkEscrow.State.Pending));
        escrow.dispute{value: BOND}(id, DEVIDENCE);
    }

    function testFunderCanDispute() public {
        uint256 id = _pendingPay();
        vm.prank(funder);
        escrow.dispute{value: BOND}(id, DEVIDENCE);
        assertEq(escrow.getBounty(id).disputer, funder);
    }

    function testResolveUpholdRefundAfterPay() public {
        uint256 id = _pendingPay();
        _dispute(id);
        _resolveRefund(id);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Refunded));
        // upheld: P per outcome (REFUND -> funder), B+R -> disputer
        (uint256 u1, uint256 g1) = _credits(funder);
        assertEq(u1, AMOUNT);
        assertEq(g1, 0);
        (uint256 u2,) = _credits(disputer);
        assertEq(u2, BOND + REWARD);
        assertEq(escrow.totalLiabilities(), AMOUNT + REWARD + BOND);
    }

    function testResolveUpholdPayAfterRefund() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        _submitRefund(id); // freezes the active claimant
        _dispute(id);
        _resolvePay(id);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Paid));
        // upheld: P -> frozen claimant gated, B+R -> disputer
        (uint256 u1, uint256 g1) = _credits(claimant);
        assertEq(u1, 0);
        assertEq(g1, AMOUNT);
        (uint256 u2,) = _credits(disputer);
        assertEq(u2, BOND + REWARD);
    }

    function testResolvePayWithoutFrozenClaimantFails() public {
        // REFUND from Open freezes no claimant: a PAY resolution is impossible
        uint256 id = _create();
        _submitRefund(id);
        _dispute(id);
        PostmarkEscrow.Verdict memory v = PostmarkEscrow.Verdict({
            bountyId: id, phase: PostmarkEscrow.Phase.DISPUTE,
            outcome: PostmarkEscrow.Outcome.PAY, payee: claimant,
            mergedAt: uint64(block.timestamp), evidenceHash: EVIDENCE,
            nonce: escrow.getBounty(id).nonce,
            claimRound: escrow.getBounty(id).claimRound});
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 2);
        vm.expectRevert(PostmarkEscrow.ClaimExpired.selector);
        escrow.resolveDispute(v, idx, sigs);
    }

    function testResolvePayWrongClaimantFails() public {
        uint256 id = _pendingPay();
        _dispute(id);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), escrow.getBounty(id).nonce);
        v.payee = claimant2; // not the frozen claimant
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 2);
        vm.expectRevert(PostmarkEscrow.NotClaimant.selector);
        escrow.resolveDispute(v, idx, sigs);
    }

    function testResolveRejectedPay() public {
        uint256 id = _pendingPay();
        _dispute(id);
        _resolvePay(id);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Paid));
        // rejected: P -> frozen claimant gated, B -> frozen claimant gated, R -> funder
        (, uint256 g) = _credits(claimant);
        assertEq(g, AMOUNT + BOND);
        (uint256 uf,) = _credits(funder);
        assertEq(uf, REWARD);
        (uint256 ud,) = _credits(disputer);
        assertEq(ud, 0);
    }

    function testResolveRejectedRefundWithClaimant() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        _submitRefund(id); // freezes claimant even though outcome is REFUND
        _dispute(id);
        _resolveRefund(id);
        // rejected: P -> funder, B -> frozen claimant gated, R -> funder
        (uint256 uf,) = _credits(funder);
        assertEq(uf, AMOUNT + REWARD);
        (, uint256 g) = _credits(claimant);
        assertEq(g, BOND);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Refunded));
    }

    function testResolveRejectedRefundNoClaimant() public {
        // no frozen claimant: slashed bond falls back to the funder, ungated
        uint256 id = _create();
        _submitRefund(id);
        _dispute(id);
        _resolveRefund(id);
        (uint256 uf, uint256 gf) = _credits(funder);
        assertEq(uf, AMOUNT + BOND + REWARD);
        assertEq(gf, 0);
        (, uint256 gd) = _credits(disputer);
        assertEq(gd, 0);
    }

    function testResolveRevertsBadMeta() public {
        uint256 id = _pendingPay();
        _dispute(id);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        uint256 nonce = b.nonce;
        // wrong phase
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(PostmarkEscrow.InvalidPhase.selector);
        escrow.resolveDispute(v, idx, sigs);
        // wrong nonce
        v = _verdict(id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, nonce + 1);
        (idx, sigs) = _sign(v, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidNonce.selector, nonce, nonce + 1));
        escrow.resolveDispute(v, idx, sigs);
        // wrong round
        v = _verdict(id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, nonce);
        v.claimRound = b.claimRound + 9;
        (idx, sigs) = _sign(v, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidClaimRound.selector, b.claimRound, b.claimRound + 9));
        escrow.resolveDispute(v, idx, sigs);
    }

    function testResolveDisputeBindsStoredHashes() public {
        uint256 id = _pendingPay();
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        bytes memory msgBefore = escrow.verdictMessage(v);
        _dispute(id);
        bytes memory msgAfter = escrow.verdictMessage(v);
        assertTrue(keccak256(msgBefore) != keccak256(msgAfter));
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = pqcSign(vSks[0], msgBefore);
        sigs[1] = pqcSign(vSks[1], msgBefore);
        uint8[] memory idx = new uint8[](2);
        idx[0] = 0; idx[1] = 1;
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.resolveDispute(v, idx, sigs);
    }

    function testFinalizeFrozenWhileDisputed() public {
        uint256 id = _pendingPay();
        _dispute(id);
        vm.warp(escrow.getBounty(id).challengeEndsAt + 365 days);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Disputed, PostmarkEscrow.State.Pending));
        escrow.finalize(id);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Disputed));
    }

    function testReplayedResolutionReverts() public {
        uint256 id = _pendingPay();
        _dispute(id);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 2);
        escrow.resolveDispute(v, idx, sigs);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Refunded, PostmarkEscrow.State.Disputed));
        escrow.resolveDispute(v, idx, sigs);
    }
}
