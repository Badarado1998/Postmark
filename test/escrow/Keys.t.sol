// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowFixture} from "./EscrowFixture.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";
import {CustomKeyStatus, LongReturnPrecompile} from "./mocks/Mocks.sol";

contract KeysTest is EscrowFixture {
    function testRevocationAfterAcceptanceKeepsVerdict() public {
        uint256 id = _pendingPay();
        pqcRevoke(verifiers[0]);
        pqcRevoke(verifiers[1]); // accepted verdict is a historical fact
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Paid));
    }

    function testResolveWithRevokedSignerFails() public {
        uint256 id = _pendingPay();
        _dispute(id);
        pqcRevoke(verifiers[2]);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 2);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.KeyIneligible.selector, verifiers[2]));
        escrow.resolveDispute(v, idx, sigs);
        (idx, sigs) = _sign(v, 0, 1);
        escrow.resolveDispute(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Refunded));
    }

    function testRotationBetweenVerdictAndResolution() public {
        uint256 id = _pendingPay();
        _dispute(id);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        (, bytes memory newSk) = pqcGenerateAndRegister(verifiers[0], bytes32(uint256(555)));
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.resolveDispute(v, idx, sigs);
        sigs[0] = pqcSign(newSk, escrow.verdictMessage(v));
        escrow.resolveDispute(v, idx, sigs);
    }

    function testClaimantRotationBetweenVerdictAndFinalize() public {
        uint256 id = _pendingPay();
        pqcGenerateAndRegister(claimant, bytes32(uint256(777)));
        vm.warp(escrow.getBounty(id).challengeEndsAt);
        escrow.finalize(id);
        vm.prank(claimant);
        escrow.withdraw();
        assertEq(claimant.balance, AMOUNT);
    }

    function testClaimantRotationAndReregisterStillPays() public {
        // a new claim round uses the same address after rotation; the frozen
        // snapshot (round at submission) is what a DISPUTE verdict binds
        uint256 id = _pendingPay();
        _dispute(id);
        pqcGenerateAndRegister(claimant, bytes32(uint256(778)));
        _resolvePay(id);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Paid));
    }

    function testNonSigningIneligibleIgnored() public {
        CustomKeyStatus custom = new CustomKeyStatus();
        vm.etch(0x0000000000000000000000000000000000000a02, address(custom).code);
        CustomKeyStatus ks = CustomKeyStatus(0x0000000000000000000000000000000000000a02);
        ks.set(claimant, true, 1, cPk, true);
        for (uint256 i; i < 3; ++i) ks.set(verifiers[i], true, 1, vPks[i], true);
        uint256 id = _create();
        _claim(id, claimant, cSk);
        // v2 becomes ineligible after creation; non-signing -> ignored
        ks.set(verifiers[2], true, 2, new bytes(50), false);
        _submitPay(id);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testMalformedKeyStatusOnSubmit() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 0);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.etch(0x0000000000000000000000000000000000000a02, address(new BadOffsetKeyStatus()).code);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
        vm.etch(0x0000000000000000000000000000000000000a02, address(new OverlongKeyStatus()).code);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
        vm.etch(0x0000000000000000000000000000000000000a02, address(new BadBoolKeyStatus()).code);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testMalformedVerifyReturn() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 0);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.etch(0x0000000000000000000000000000000000000a01, address(new LongReturnPrecompile()).code);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.submitVerdict(v, idx, sigs);
    }

    function testGatedBondSlashNeedsPayeeKey() public {
        // rejected dispute: bond slashed to the frozen claimant is gated
        uint256 id = _pendingPay();
        _dispute(id);
        _resolvePay(id);
        pqcRevoke(claimant);
        vm.prank(claimant);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.withdraw();
    }

    function testCannotMeetQuorumLocksDispute() public {
        uint256 id = _pendingPay();
        _dispute(id);
        pqcRevoke(verifiers[1]);
        pqcRevoke(verifiers[2]); // only v0 alive -> no 2-of-3 possible
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.KeyIneligible.selector, verifiers[1]));
        escrow.resolveDispute(v, idx, sigs);
        (idx, sigs) = _sign(v, 0, 2);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.KeyIneligible.selector, verifiers[2]));
        escrow.resolveDispute(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Disputed));
    }
}

// Head offset word not 0x80.
contract BadOffsetKeyStatus {
    fallback() external {
        assembly {
            mstore(0x00, 1) mstore(0x20, 1) mstore(0x40, 0x60) mstore(0x60, 1)
            mstore(0x80, 0)
            return(0x00, 0xa0)
        }
    }
}

// Declares len 0x1000 but returns only the head.
contract OverlongKeyStatus {
    fallback() external {
        assembly {
            mstore(0x00, 1) mstore(0x20, 1) mstore(0x40, 0x80) mstore(0x60, 1)
            mstore(0x80, 0x1000)
            return(0x00, 0xa0)
        }
    }
}

// registered word = 2.
contract BadBoolKeyStatus {
    fallback() external {
        assembly {
            mstore(0x00, 2) mstore(0x20, 1) mstore(0x40, 0x80) mstore(0x60, 1)
            mstore(0x80, 0)
            return(0x00, 0xa0)
        }
    }
}
