// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowFixture} from "./EscrowFixture.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";
import {ReentrantReceiver, RejectingReceiver} from "./mocks/Mocks.sol";

contract SettlementTest is EscrowFixture {
    function testFinalizePayByAnyone() public {
        uint256 id = _pendingPay();
        uint64 endsAt = escrow.getBounty(id).challengeEndsAt;
        vm.warp(endsAt - 1);
        vm.expectRevert(PostmarkEscrow.ChallengeOpen.selector);
        escrow.finalize(id);
        vm.warp(endsAt); // exact boundary
        vm.prank(relayer);
        escrow.finalize(id);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Paid));
        (uint256 uc, uint256 gc) = _credits(claimant);
        assertEq(uc, 0);
        assertEq(gc, AMOUNT);
        (uint256 uf,) = _credits(funder);
        assertEq(uf, REWARD);
        assertEq(escrow.totalLiabilities(), AMOUNT + REWARD);
    }

    function testFinalizeRefund() public {
        uint256 id = _create();
        _submitRefund(id);
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Refunded));
        (uint256 uf,) = _credits(funder);
        assertEq(uf, AMOUNT + REWARD); // one credit
    }

    function testFinalizeTerminalReverts() public {
        uint256 id = _pendingPay();
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Paid, PostmarkEscrow.State.Pending));
        escrow.finalize(id);
        vm.prank(disputer);
        vm.expectRevert();
        escrow.dispute{value: BOND}(id, DEVIDENCE);
        vm.prank(funder);
        vm.expectRevert();
        escrow.refundExpired(id);
        bytes memory sig = pqcSign(cSk, escrow.claimMessage(id, claimant, IDENTITY, 2));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.ClaimClosed.selector);
        escrow.claim(id, IDENTITY, sig);
    }

    function testRefundExpired() public {
        uint256 id = _create();
        vm.warp(deadline); // not yet past
        vm.prank(funder);
        vm.expectRevert(PostmarkEscrow.DeadlineNotPassed.selector);
        escrow.refundExpired(id);
        vm.warp(deadline + 1);
        vm.prank(disputer); // not the funder
        vm.expectRevert(PostmarkEscrow.NotFunder.selector);
        escrow.refundExpired(id);
        vm.prank(funder);
        escrow.refundExpired(id);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Refunded));
        (uint256 uf,) = _credits(funder);
        assertEq(uf, AMOUNT + REWARD);
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.UnknownBounty.selector, 77));
        escrow.refundExpired(77);
    }

    function testRefundExpiredOnClaimed() public {
        // works on stored-Claimed too (claim always lapses by deadline)
        uint256 id = _create();
        _claim(id, claimant, cSk);
        vm.warp(deadline + 1);
        vm.prank(funder);
        escrow.refundExpired(id);
        (uint256 uf,) = _credits(funder);
        assertEq(uf, AMOUNT + REWARD);
    }

    function testRefundExpiredRacesTimelyVerdict() public {
        uint256 id = _create();
        vm.warp(deadline);
        _submitRefund(id); // REFUND verdict exactly at deadline is valid
        vm.warp(deadline + 1);
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Pending, PostmarkEscrow.State.Open));
        escrow.refundExpired(id);
    }

    function testWithdraw() public {
        uint256 id = _pendingPay();
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        uint256 before = funder.balance;
        vm.prank(funder);
        escrow.withdraw();
        assertEq(funder.balance, before + REWARD);
        assertEq(escrow.totalLiabilities(), AMOUNT);
        before = claimant.balance;
        vm.prank(claimant);
        escrow.withdraw();
        assertEq(claimant.balance, before + AMOUNT);
        assertEq(escrow.totalLiabilities(), 0);
    }

    function testWithdrawNothing() public {
        vm.expectRevert(PostmarkEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    function testGatedWithdrawNeedsEligibility() public {
        uint256 id = _pendingPay();
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        pqcRevoke(claimant); // revoked before settlement -> finalize PAY needs eligible payee
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.finalize(id);
        // restore key, settle, then revoke again -> withdraw still gated
        pqcRegister(claimant, cPk, true);
        escrow.finalize(id);
        pqcRevoke(claimant);
        vm.prank(claimant);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.withdraw();
        // rotate to a fresh key -> eligible again
        pqcGenerateAndRegister(claimant, bytes32(uint256(1234)));
        vm.prank(claimant);
        escrow.withdraw();
        assertEq(claimant.balance, AMOUNT);
    }

    function testUngatedWithdrawBypassesGating() public {
        uint256 id = _create();
        vm.warp(deadline + 1);
        vm.prank(funder);
        escrow.refundExpired(id);
        vm.prank(funder); // funder has no PQ key at all: ungated path needs none
        escrow.withdraw();
    }

    function testMixedGatedUngatedAtomic() public {
        // claimant disputes its own bounty: gets ungated B+R on upheld REFUND
        uint256 id = _pendingPay();
        vm.deal(claimant, BOND);
        vm.prank(claimant);
        escrow.dispute{value: BOND}(id, DEVIDENCE);
        _resolveRefund(id); // upheld -> disputer(claimant) gets B+R ungated
        (uint256 u, uint256 g) = _credits(claimant);
        assertEq(u, BOND + REWARD);
        assertEq(g, 0);
        vm.prank(claimant);
        escrow.withdraw();
        assertEq(claimant.balance, BOND + REWARD);
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    function testWithdrawTransferFailureRollsBack() public {
        RejectingReceiver bad = new RejectingReceiver();
        address badClaimant = address(bad);
        (, bytes memory badSk) = pqcGenerateAndRegister(badClaimant, bytes32(uint256(77)));
        uint256 id = _create();
        _claim(id, badClaimant, badSk);
        _submitPay(id);
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        vm.prank(badClaimant);
        vm.expectRevert(PostmarkEscrow.TransferFailed.selector);
        escrow.withdraw();
        (, uint256 g) = _credits(badClaimant);
        assertEq(g, AMOUNT); // credits restored
    }

    function testWithdrawReentrancy() public {
        ReentrantReceiver rr = new ReentrantReceiver(address(escrow));
        address rClaimant = address(rr);
        (, bytes memory rSk) = pqcGenerateAndRegister(rClaimant, bytes32(uint256(88)));
        uint256 id = _create();
        _claim(id, rClaimant, rSk);
        _submitPay(id);
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        rr.arm(abi.encodeCall(escrow.withdraw, ()));
        vm.prank(rClaimant);
        // inner withdraw reverts (nonReentrant) and is swallowed by the mock;
        // the outer withdraw completes exactly once, credits already zeroed
        escrow.withdraw();
        assertEq(rClaimant.balance, AMOUNT);
        (, uint256 g) = _credits(rClaimant);
        assertEq(g, 0);
    }

    function testForcedFundsNotCredited() public {
        uint256 id = _pendingPay();
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        vm.deal(address(escrow), address(escrow).balance + 5 ether);
        assertGt(address(escrow).balance, escrow.totalLiabilities());
        assertEq(escrow.totalLiabilities(), AMOUNT + REWARD);
    }

    function testBondCountsInLiabilities() public {
        uint256 id = _pendingPay();
        _dispute(id);
        assertEq(escrow.totalLiabilities(), AMOUNT + REWARD + BOND);
        assertEq(address(escrow).balance, AMOUNT + REWARD + BOND);
    }

    function testLedgerConservation() public {
        // create + dispute + resolve upheld: every wei is a credit
        uint256 id = _pendingPay();
        _dispute(id);
        _resolveRefund(id);
        uint256 total;
        (uint256 uf,) = _credits(funder);
        (uint256 ud,) = _credits(disputer);
        total = uf + ud;
        assertEq(total, AMOUNT + REWARD + BOND);
        assertEq(escrow.totalLiabilities(), total);
        // withdraw everything -> zero
        vm.prank(funder);
        escrow.withdraw();
        vm.prank(disputer);
        escrow.withdraw();
        assertEq(escrow.totalLiabilities(), 0);
        assertEq(address(escrow).balance, 0);
    }
}
