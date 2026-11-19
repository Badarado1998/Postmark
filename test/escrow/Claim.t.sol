// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowFixture} from "./EscrowFixture.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";
import {CustomKeyStatus, RevertingPrecompile} from "./mocks/Mocks.sol";

contract ClaimTest is EscrowFixture {
    function testValidClaim() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Claimed));
        assertEq(b.payee, claimant);
        assertEq(b.payeeIdentityHash, IDENTITY);
        assertEq(b.claimRound, 1);
        assertEq(b.claimExpiresAt, uint64(block.timestamp) + CLAIM_TIMEOUT);
    }

    function testClaimEmitsEvent() public {
        uint256 id = _create();
        uint256 round = 1;
        bytes memory m = escrow.claimMessage(id, claimant, IDENTITY, round);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PostmarkEscrow.Claimed(id, claimant, IDENTITY, round,
            uint64(block.timestamp) + CLAIM_TIMEOUT);
        vm.prank(claimant);
        escrow.claim(id, IDENTITY, pqcSign(cSk, m));
    }

    function testClaimUnknownBounty() public {
        vm.prank(claimant);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.UnknownBounty.selector, 9));
        escrow.claim(9, IDENTITY, new bytes(4627));
    }

    function testClaimKeyIneligible() public {
        uint256 id = _create();
        // unregistered caller
        address nobody = makeAddr("nobody");
        bytes memory sig = new bytes(4627);
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, nobody));
        escrow.claim(id, IDENTITY, sig);
        // revoked claimant key
        pqcRevoke(claimant);
        vm.prank(claimant);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.claim(id, IDENTITY, sig);
        // unproven key
        pqcRegister(claimant, cPk, false);
        vm.prank(claimant);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.claim(id, IDENTITY, sig);
        // wrong algorithm
        CustomKeyStatus custom = new CustomKeyStatus();
        vm.etch(0x0000000000000000000000000000000000000a02, address(custom).code);
        CustomKeyStatus ks = CustomKeyStatus(0x0000000000000000000000000000000000000a02);
        for (uint256 i; i < 3; ++i) ks.set(verifiers[i], true, 1, vPks[i], true);
        ks.set(claimant, true, 2, cPk, true);
        vm.prank(claimant);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.claim(id, IDENTITY, sig);
    }

    function testClaimBadSignatures() public {
        uint256 id = _create();
        bytes memory good = pqcSign(cSk, escrow.claimMessage(id, claimant, IDENTITY, 1));
        // wrong length
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, new bytes(100));
        // tampered
        bytes memory bad = good;
        bad[10] ^= 0x01;
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, bad);
        // signed by a different key
        bytes memory sig = pqcSign(c2Sk, escrow.claimMessage(id, claimant, IDENTITY, 1));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig);
    }

    function testCopiedSignatureCannotClaimForCopier() public {
        uint256 id = _create();
        // claimant signs for itself; another address submits it
        bytes memory sig = pqcSign(cSk, escrow.claimMessage(id, claimant, IDENTITY, 1));
        vm.prank(claimant2);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig);
        // claimant2's own signature names claimant2: cannot seat claimant either
        bytes memory sig2 = pqcSign(c2Sk, escrow.claimMessage(id, claimant2, IDENTITY, 1));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig2);
    }

    function testClaimDomainBinding() public {
        uint256 id = _create();
        // signature bound to another bounty id
        bytes memory sig = pqcSign(cSk, escrow.claimMessage(id + 1, claimant, IDENTITY, 1));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig);
        // different EVM chain id
        uint256 realChain = block.chainid;
        vm.chainId(realChain + 5);
        sig = pqcSign(cSk, escrow.claimMessage(id, claimant, IDENTITY, 1));
        vm.chainId(realChain);
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig);
        // different deployment
        PostmarkEscrow other = new PostmarkEscrow("qorechain-diana");
        sig = pqcSign(cSk, other.claimMessage(id, claimant, IDENTITY, 1));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig);
        // wrong round (signs round 2 before any claim)
        sig = pqcSign(cSk, escrow.claimMessage(id, claimant, IDENTITY, 2));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig);
    }

    function testClaimedReplayFails() public {
        uint256 id = _create();
        bytes memory m = escrow.claimMessage(id, claimant, IDENTITY, 1);
        bytes memory sig = pqcSign(cSk, m);
        vm.prank(claimant);
        escrow.claim(id, IDENTITY, sig);
        // replaying the same round-1 signature after expiry: the next round is 2
        vm.warp(escrow.getBounty(id).claimExpiresAt);
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, sig);
    }

    function testRenewalAndSecondClaimantRejectedWhileActive() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint64 expiresAt = escrow.getBounty(id).claimExpiresAt;
        // same-address renewal
        bytes memory m = escrow.claimMessage(id, claimant, IDENTITY, 2);
        vm.prank(claimant);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.ClaimActive.selector, expiresAt));
        escrow.claim(id, IDENTITY, pqcSign(cSk, m));
        // second claimant
        bytes memory m2 = escrow.claimMessage(id, claimant2, IDENTITY, 2);
        vm.prank(claimant2);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.ClaimActive.selector, expiresAt));
        escrow.claim(id, IDENTITY, pqcSign(c2Sk, m2));
    }

    function testReplacementAtAndAfterExpiry() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint64 expiresAt = escrow.getBounty(id).claimExpiresAt;
        // at exact expiry the old claim is gone; a new claim succeeds
        vm.warp(expiresAt);
        _claim(id, claimant2, c2Sk);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(b.payee, claimant2);
        assertEq(b.claimRound, 2);
        // and later again
        vm.warp(b.claimExpiresAt + 1 days);
        _claim(id, claimant, cSk);
        assertEq(escrow.getBounty(id).claimRound, 3);
    }

    function testClaimClosedAtDeadline() public {
        uint256 id = _create();
        vm.warp(deadline);
        bytes memory m = escrow.claimMessage(id, claimant, IDENTITY, 1);
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.ClaimClosed.selector);
        escrow.claim(id, IDENTITY, pqcSign(cSk, m));
        vm.warp(deadline + 1);
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.ClaimClosed.selector);
        escrow.claim(id, IDENTITY, pqcSign(cSk, m));
    }

    function testClaimWindowTooShort() public {
        // create with a tight claimTimeout so late claims still fit until close
        vm.prank(funder);
        uint256 id = escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, WORK, deadline, 7 days, verifiers, BOND, REWARD);
        // warp inside deadline but with less than 7 days remaining
        vm.warp(deadline - 1 days);
        bytes memory m = escrow.claimMessage(id, claimant, IDENTITY, 1);
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.ClaimWindowTooShort.selector);
        escrow.claim(id, IDENTITY, pqcSign(cSk, m));
    }

    function testClaimClosedOnTerminalStates() public {
        uint256 id = _pendingPay();
        bytes memory sig = pqcSign(cSk, escrow.claimMessage(id, claimant, IDENTITY, 2));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.ClaimClosed.selector);
        escrow.claim(id, IDENTITY, sig);
    }

    function testFunderAndVerifierCannotClaim() public {
        uint256 id = _create();
        (bytes memory fPk, bytes memory fSk) = pqcGenerateAndRegister(funder, bytes32(uint256(41)));
        fPk;
        bytes memory sig = pqcSign(fSk, escrow.claimMessage(id, funder, IDENTITY, 1));
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.ClaimantExcluded.selector, funder));
        escrow.claim(id, IDENTITY, sig);
        // a verifier account is excluded before its key is even checked
        sig = pqcSign(vSks[0], escrow.claimMessage(id, verifiers[0], IDENTITY, 1));
        vm.prank(verifiers[0]);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.ClaimantExcluded.selector, verifiers[0]));
        escrow.claim(id, IDENTITY, sig);
    }

    function testClaimantSharingVerifierKeyExcluded() public {
        uint256 id = _create();
        // claimant2 controls the same key material as verifiers[0]
        pqcRegister(claimant2, vPks[0], true);
        bytes memory sig = pqcSign(vSks[0], escrow.claimMessage(id, claimant2, IDENTITY, 1));
        vm.prank(claimant2);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.ClaimantExcluded.selector, claimant2));
        escrow.claim(id, IDENTITY, sig);
    }

    function testClaimRejectsZeroIdentity() public {
        uint256 id = _create();
        bytes memory sig = pqcSign(cSk, escrow.claimMessage(id, claimant, bytes32(0), 1));
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.claim(id, bytes32(0), sig);
    }

    function testNormalizedOpenViewAtExactExpiry() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint64 expiresAt = escrow.getBounty(id).claimExpiresAt;
        vm.warp(expiresAt - 1);
        PostmarkEscrow.Bounty memory active = escrow.getBounty(id);
        assertEq(uint8(active.state), uint8(PostmarkEscrow.State.Claimed));
        assertEq(active.payee, claimant);
        vm.warp(expiresAt); // exact expiry
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Open));
        assertEq(b.payee, address(0));
        assertEq(b.payeeIdentityHash, bytes32(0));
        assertEq(b.claimExpiresAt, 0);
        assertEq(b.claimRound, 1); // round never resets
        // stored record untouched by the view
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Open));
    }

    function testReopenReleasesExpiredClaim() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint64 expiresAt = escrow.getBounty(id).claimExpiresAt;
        // still active
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.ClaimActive.selector, expiresAt));
        escrow.reopen(id);
        // nothing to release on a fresh bounty
        uint256 id2 = _create();
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidState.selector,
            PostmarkEscrow.State.Open, PostmarkEscrow.State.Claimed));
        escrow.reopen(id2);
        // after expiry: releases, emits ClaimReleased
        vm.warp(expiresAt);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PostmarkEscrow.ClaimReleased(id, claimant, 1);
        escrow.reopen(id);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Open));
        assertEq(b.payee, address(0));
        assertEq(b.claimRound, 1);
    }

    function testClaimRoundIncrementsOnlyOnSuccess() public {
        uint256 id = _create();
        // failed claims consume no round
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.BadClaimSignature.selector);
        escrow.claim(id, IDENTITY, new bytes(1));
        assertEq(escrow.getBounty(id).claimRound, 0);
        _claim(id, claimant, cSk);
        assertEq(escrow.getBounty(id).claimRound, 1);
        vm.warp(escrow.getBounty(id).claimExpiresAt);
        _claim(id, claimant, cSk);
        assertEq(escrow.getBounty(id).claimRound, 2);
    }

    function testClaimPrecompileFailure() public {
        uint256 id = _create();
        vm.etch(0x0000000000000000000000000000000000000a02, address(new RevertingPrecompile()).code);
        vm.prank(claimant);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.claim(id, IDENTITY, new bytes(4627));
    }
}
