// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowFixture} from "./EscrowFixture.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";
import {CustomKeyStatus, RevertingPrecompile,
    ShortReturnPrecompile} from "./mocks/Mocks.sol";

contract CreateTest is EscrowFixture {
    function testCreate() public {
        uint256 id = _create();
        assertEq(id, 1);
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.state), uint8(PostmarkEscrow.State.Open));
        assertEq(b.funder, funder);
        assertEq(b.amount, AMOUNT);
        assertEq(b.bondAmount, BOND);
        assertEq(b.challengeReward, REWARD);
        assertEq(b.nonce, 0);
        assertEq(b.claimRound, 0);
        assertEq(b.payee, address(0));
        assertEq(b.claimExpiresAt, 0);
        assertEq(escrow.totalLiabilities(), AMOUNT + REWARD);
        assertEq(address(escrow).balance, AMOUNT + REWARD);
        assertEq(escrow.nextBountyId(), 2);
        assertEq(b.workHash, WORK);
    }

    function testBountyWorkEvent() public {
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PostmarkEscrow.BountyCreated(1, funder, AMOUNT, REWARD, WORK,
            deadline, CLAIM_TIMEOUT, verifiers, BOND);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit PostmarkEscrow.BountyWork(1, WORK, OWNER_REPO, KIND, NUMBER);
        _create();
    }

    function testRejectsBadWorkReference() public {
        string[9] memory bad = ["", "ab", "noslash", "a/b/c",
            "/a/b", "a/b/", "Owner/repo", "a b/c",
            string(abi.encodePacked("o/", new bytes(139)))];
        vm.startPrank(funder);
        for (uint256 i; i < bad.length; ++i) {
            vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
            escrow.createBounty{value: 1}(AMOUNT, bad[i], KIND, NUMBER,
                deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        }
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, 2, NUMBER,
            deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, KIND, 0,
            deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        bytes memory long_ = new bytes(138);
        for (uint256 i; i < 138; ++i) long_[i] = "a";
        uint256 id = escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, string(abi.encodePacked("o/", long_)), KIND, NUMBER,
            deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        assertEq(id, 1);
        vm.stopPrank();
    }

    function testRejectsZeroAndBadParams() public {
        vm.startPrank(funder);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(0, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, 0, REWARD);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, 0);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, KIND, NUMBER, uint64(block.timestamp), CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT,
            [verifiers[0], verifiers[0], verifiers[2]], BOND, REWARD);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT,
            [verifiers[0], address(0), verifiers[2]], BOND, REWARD);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: 1}(AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT,
            [funder, verifiers[1], verifiers[2]], BOND, REWARD);
        vm.stopPrank();
    }

    function testClaimTimeoutBounds() public {
        vm.startPrank(funder);
        // below minimum
        vm.expectRevert(PostmarkEscrow.InvalidClaimTimeout.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, 1 hours - 1, verifiers, BOND, REWARD);
        // exact minimum and maximum accepted
        uint256 id1 = escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, 1 hours, verifiers, BOND, REWARD);
        uint256 id2 = escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, 7 days, verifiers, BOND, REWARD);
        assertEq(escrow.getBounty(id1).claimTimeout, 1 hours);
        assertEq(escrow.getBounty(id2).claimTimeout, 7 days);
        // above maximum
        vm.expectRevert(PostmarkEscrow.InvalidClaimTimeout.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, 7 days + 1, verifiers, BOND, REWARD);
        // huge uint64 must not overflow the window check
        vm.expectRevert(PostmarkEscrow.InvalidClaimTimeout.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, type(uint64).max, verifiers, BOND, REWARD);
        vm.stopPrank();
    }

    function testWindowMustFitDeadline() public {
        uint64 tightDeadline = uint64(block.timestamp + 2 hours);
        vm.startPrank(funder);
        // 1-day timeout cannot fit before a 2-hour deadline
        vm.expectRevert(PostmarkEscrow.ClaimWindowTooShort.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, tightDeadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        // a timeout that exactly fits is accepted
        uint256 id = escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, tightDeadline, 2 hours, verifiers, BOND, REWARD);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Open));
        vm.stopPrank();
    }

    function testRejectsWrongValue() public {
        vm.startPrank(funder);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.WrongValue.selector, AMOUNT + REWARD, AMOUNT + REWARD - 1));
        escrow.createBounty{value: AMOUNT + REWARD - 1}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.WrongValue.selector, AMOUNT + REWARD, AMOUNT + REWARD + 1));
        escrow.createBounty{value: AMOUNT + REWARD + 1}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        vm.stopPrank();
    }

    function testRejectsUneligibleKeys() public {
        address[3] memory vs = [verifiers[0], verifiers[1], makeAddr("unregistered")];
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, vs[2]));
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, vs, BOND, REWARD);
        // unproven key
        pqcRegister(verifiers[2], vPks[2], false);
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, verifiers[2]));
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
    }

    function testRejectsDuplicateKeys() public {
        pqcRegister(verifiers[0], vPks[2], true);
        vm.prank(funder);
        vm.expectRevert(PostmarkEscrow.DuplicateVerifierKey.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
    }

    function testRejectsWhenPrecompileDown() public {
        vm.etch(0x0000000000000000000000000000000000000a02, address(new RevertingPrecompile()).code);
        vm.prank(funder);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
    }

    function testRejectsWhenPrecompileEmptyOrMalformed() public {
        vm.prank(funder);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        vm.etch(0x0000000000000000000000000000000000000a02, "");
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        vm.etch(0x0000000000000000000000000000000000000a02, address(new ShortReturnPrecompile()).code);
        vm.prank(funder);
        vm.expectRevert(PostmarkEscrow.PrecompileUnavailable.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
    }

    function testRejectsWrongAlgorithmAndShortKey() public {
        CustomKeyStatus custom = new CustomKeyStatus();
        vm.etch(0x0000000000000000000000000000000000000a02, address(custom).code);
        CustomKeyStatus ks = CustomKeyStatus(0x0000000000000000000000000000000000000a02);
        for (uint256 i; i < 3; ++i) ks.set(verifiers[i], true, 1, vPks[i], true);
        ks.set(verifiers[2], true, 2, vPks[2], true); // wrong algorithm
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, verifiers[2]));
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        ks.set(verifiers[2], true, 1, new bytes(100), true); // wrong key length
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, verifiers[2]));
        escrow.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
    }

    function testConstructorRejectsBadChainId() public {
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        new PostmarkEscrow("");
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        new PostmarkEscrow("bad id");
        new PostmarkEscrow("a.A_0-");
    }

    function testCreateRollbackOnFailure() public {
        vm.prank(funder);
        vm.expectRevert(PostmarkEscrow.InvalidParameters.selector);
        escrow.createBounty{value: AMOUNT + REWARD}(
            0, OWNER_REPO, KIND, NUMBER, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        assertEq(escrow.nextBountyId(), 1);
        assertEq(escrow.totalLiabilities(), 0);
        assertEq(address(escrow).balance, 0);
    }

    function testNoReceiveFallback() public {
        (bool ok,) = address(escrow).call{value: 1}("");
        assertFalse(ok);
    }
}
