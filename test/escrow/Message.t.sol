// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {EscrowFixture} from "./EscrowFixture.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";

/// Signs quorums over bytes built independently from SPEC — never via
/// escrow.claimMessage/verdictMessage — so wrong payload construction in the
/// contract cannot hide behind the test.
contract MessageTest is EscrowFixture {
    bytes32 internal constant CLAIM_TYPEHASH = keccak256(
        "ClaimV1(uint256 chainId,address escrow,uint256 bountyId,address claimant,"
        "bytes32 identityHash,uint256 claimRound)");
    bytes32 internal constant TYPEHASH = keccak256(
        "PostmarkEscrowVerdictV1(uint256 chainId,address escrow,uint256 bountyId,"
        "uint8 phase,uint8 outcome,address payee,uint64 mergedAt,bytes32 evidenceHash,"
        "uint256 nonce,uint256 claimRound,bytes32 disputedVerdictHash,"
        "bytes32 disputeEvidenceHash)");

    function _iClaimMessage(uint256 id, address who, bytes32 idh, uint256 round)
        internal view returns (bytes memory)
    {
        return abi.encodePacked("qorechain-msg-v1|", "qorechain-diana", "|",
            abi.encode(CLAIM_TYPEHASH, block.chainid, address(escrow), id,
                who, idh, round));
    }

    function _iVerdictMessage(uint256 id, uint8 phase, uint8 outcome, address p,
        uint64 mergedAt, bytes32 ev, uint256 nonce, uint256 round,
        bytes32 dvh, bytes32 deh) internal view returns (bytes memory)
    {
        return abi.encodePacked("qorechain-msg-v1|", "qorechain-diana", "|",
            abi.encode(TYPEHASH, block.chainid, address(escrow), id, phase, outcome),
            abi.encode(p, mergedAt, ev, nonce, round, dvh, deh));
    }

    function _quorumOver(bytes memory msgBytes, uint8 a, uint8 b)
        internal returns (uint8[] memory idx, bytes[] memory sigs)
    {
        idx = new uint8[](2);
        idx[0] = a; idx[1] = b;
        sigs = new bytes[](2);
        sigs[0] = pqcSign(vSks[a], msgBytes);
        sigs[1] = pqcSign(vSks[b], msgBytes);
    }

    function testTypehashConstants() public view {
        assertEq(escrow.CLAIM_TYPEHASH(), CLAIM_TYPEHASH);
        assertEq(escrow.VERDICT_TYPEHASH(), TYPEHASH);
    }

    function testClaimMessageMatchesAndVerifies() public {
        uint256 id = _create();
        bytes memory expected = _iClaimMessage(id, claimant, IDENTITY, 1);
        assertEq(expected, escrow.claimMessage(id, claimant, IDENTITY, 1));
        vm.prank(claimant);
        escrow.claim(id, IDENTITY, pqcSign(cSk, expected));
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Claimed));
    }

    function testInitialPayMessageMatchesAndVerifies() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint64 mergedAt = uint64(block.timestamp);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY, mergedAt, 0);
        bytes memory expected = _iVerdictMessage(
            id, 0, 0, claimant, mergedAt, EVIDENCE, 0, 1, bytes32(0), bytes32(0));
        assertEq(expected, escrow.verdictMessage(v));
        (uint8[] memory idx, bytes[] memory sigs) = _quorumOver(expected, 0, 1);
        escrow.submitVerdict(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testInitialRefundMessageMatchesAndVerifies() public {
        uint256 id = _create();
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, 0);
        bytes memory expected = _iVerdictMessage(
            id, 0, 1, address(0), 0, EVIDENCE, 0, 0, bytes32(0), bytes32(0));
        assertEq(expected, escrow.verdictMessage(v));
        (uint8[] memory idx, bytes[] memory sigs) = _quorumOver(expected, 1, 2);
        escrow.submitVerdict(v, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Pending));
    }

    function testPendingVerdictHashIsIndependentKeccak() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint64 mergedAt = uint64(block.timestamp);
        bytes32 expectedPending = keccak256(abi.encodePacked(
            abi.encode(TYPEHASH, block.chainid, address(escrow), id,
                uint8(0), uint8(0)),
            abi.encode(claimant, mergedAt, EVIDENCE, uint256(0), uint256(1),
                bytes32(0), bytes32(0))));
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY, mergedAt, 0);
        (uint8[] memory idx, bytes[] memory sigs) =
            _quorumOver(escrow.verdictMessage(v), 0, 1);
        vm.recordLogs();
        escrow.submitVerdict(v, idx, sigs);
        bytes32 eventHash;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == keccak256(
                "VerdictSubmitted(uint256,bytes32,uint8,uint64,bytes32,uint256,uint256,uint64)")) {
                (eventHash,,,,,,) = abi.decode(logs[i].data,
                    (bytes32, uint8, uint64, bytes32, uint256, uint256, uint64));
            }
        }
        assertEq(eventHash, expectedPending);
        assertEq(escrow.getBounty(id).pendingVerdictHash, expectedPending);
    }

    function testDisputeMessageMatchesAndVerifies() public {
        uint256 id = _pendingPay();
        bytes32 expectedPending = escrow.getBounty(id).pendingVerdictHash;
        assertEq(expectedPending, keccak256(abi.encodePacked(
            abi.encode(TYPEHASH, block.chainid, address(escrow), id,
                uint8(0), uint8(0)),
            abi.encode(claimant, uint64(block.timestamp), EVIDENCE,
                uint256(0), uint256(1), bytes32(0), bytes32(0)))));

        _dispute(id);
        PostmarkEscrow.Verdict memory dv = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id).nonce);
        dv.evidenceHash = keccak256("resolution.evidence");
        bytes memory expected = _iVerdictMessage(
            id, 1, 1, address(0), 0, dv.evidenceHash, dv.nonce,
            dv.claimRound, expectedPending, DEVIDENCE);
        assertEq(expected, escrow.verdictMessage(dv));
        (uint8[] memory idx, bytes[] memory sigs) = _quorumOver(expected, 0, 2);
        escrow.resolveDispute(dv, idx, sigs);
        assertEq(uint8(escrow.getBounty(id).state), uint8(PostmarkEscrow.State.Refunded));
    }

    // --- field and domain binding: one change invalidates the quorum ---

    function testFieldBindingMutations() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        uint64 mergedAt = uint64(block.timestamp);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY, mergedAt, 0);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);

        PostmarkEscrow.Verdict memory m = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY, mergedAt, 0);
        m.evidenceHash = keccak256("other evidence");
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(m, idx, sigs);

        m = _verdict(id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            mergedAt - 1, 0);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(m, idx, sigs);

        m = _verdict(id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(m, idx, sigs);

        m = _verdict(id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            mergedAt, 0);
        m.payee = funder; // payee binding hits NotClaimant before fields
        vm.expectRevert(PostmarkEscrow.NotClaimant.selector);
        escrow.submitVerdict(m, idx, sigs);

        m = _verdict(id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.REFUND, 0, 0);
        m.claimRound = 1; // same value still signs a different bytes layout only if changed
        m.claimRound = 2; // wrong round -> InvalidClaimRound before signature
        vm.expectRevert(abi.encodeWithSelector(
            PostmarkEscrow.InvalidClaimRound.selector, 1, 2));
        escrow.submitVerdict(m, idx, sigs);
    }

    function testDomainBinding() public {
        uint256 id = _create();
        _claim(id, claimant, cSk);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 0);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 1);

        uint256 realChain = block.chainid;
        vm.chainId(realChain + 777);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.submitVerdict(v, idx, sigs);
        vm.chainId(realChain);

        // identical bounty on a second escrow at a different address
        PostmarkEscrow other = new PostmarkEscrow("qorechain-diana");
        vm.prank(funder);
        uint256 oid = other.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, WORK, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        assertEq(oid, id);
        // claim on it too (round 1, same claimant)
        uint256 r = other.getBounty(oid).claimRound + 1;
        bytes memory csig = pqcSign(cSk, other.claimMessage(oid, claimant, IDENTITY, r));
        vm.prank(claimant);
        other.claim(oid, IDENTITY, csig);
        PostmarkEscrow.Verdict memory ov = _verdict(
            oid, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 0);
        // sigs bound to the first escrow's address fail on the second
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        other.submitVerdict(ov, idx, sigs);

        // escrow bound to another native chain id
        PostmarkEscrow vladi = new PostmarkEscrow("qorechain-vladi");
        vm.prank(funder);
        uint256 vid = vladi.createBounty{value: AMOUNT + REWARD}(
            AMOUNT, WORK, deadline, CLAIM_TIMEOUT, verifiers, BOND, REWARD);
        r = vladi.getBounty(vid).claimRound + 1;
        csig = pqcSign(cSk, vladi.claimMessage(vid, claimant, IDENTITY, r));
        vm.prank(claimant);
        vladi.claim(vid, IDENTITY, csig);
        ov = _verdict(vid, PostmarkEscrow.Phase.INITIAL, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), 0);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        vladi.submitVerdict(ov, idx, sigs);
    }

    function testDisputeSignatureNotReusableAcrossDisputes() public {
        uint256 id1 = _create();
        uint256 id2 = _create();
        _claim(id1, claimant, cSk);
        _claim(id2, claimant, cSk);
        _submitPay(id1);
        _submitPay(id2);
        _dispute(id1);
        vm.prank(disputer);
        escrow.dispute{value: BOND}(id2, keccak256("different evidence"));
        PostmarkEscrow.Verdict memory v1 = _verdict(
            id1, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id1).nonce);
        PostmarkEscrow.Verdict memory v2 = _verdict(
            id2, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.REFUND,
            0, escrow.getBounty(id2).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v1, 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.BadSignature.selector, 0));
        escrow.resolveDispute(v2, idx, sigs);
    }

    function testResolvePayNeedsEligiblePayee() public {
        uint256 id = _pendingPay();
        _dispute(id);
        pqcRevoke(claimant);
        PostmarkEscrow.Verdict memory v = _verdict(
            id, PostmarkEscrow.Phase.DISPUTE, PostmarkEscrow.Outcome.PAY,
            uint64(block.timestamp), escrow.getBounty(id).nonce);
        (uint8[] memory idx, bytes[] memory sigs) = _sign(v, 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PostmarkEscrow.KeyIneligible.selector, claimant));
        escrow.resolveDispute(v, idx, sigs);
    }
}
