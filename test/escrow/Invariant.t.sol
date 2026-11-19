// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowFixture} from "./EscrowFixture.sol";
import {PqcTest} from "../../src/test-utils/PqcTest.sol";
import {PostmarkEscrow} from "../../src/PostmarkEscrow.sol";

contract EscrowHandler is PqcTest {
    PostmarkEscrow public escrow;
    address public funder;
    address public claimant;
    address public claimant2;
    address public disputer;
    address[3] public verifiers;
    bytes[3] public sks;
    bytes public cSk;
    bytes public c2Sk;

    uint256 public escrowed;
    uint256 public credited;
    uint256 public withdrawn;
    mapping(uint256 => uint256) public escrowedById;
    uint256 public idCount;
    uint64 public nextDeadline;

    constructor(PostmarkEscrow escrow_, address funder_, address claimant_,
        address claimant2_, address disputer_, address[3] memory verifiers_,
        bytes[3] memory sks_, bytes memory cSk_, bytes memory c2Sk_)
    {
        escrow = escrow_;
        funder = funder_; claimant = claimant_; claimant2 = claimant2_;
        disputer = disputer_;
        verifiers = verifiers_; sks = sks_; cSk = cSk_; c2Sk = c2Sk_;
        nextDeadline = uint64(block.timestamp + 30 days);
    }

    function _idx(uint8 a, uint8 b) internal pure returns (uint8[] memory i) {
        i = new uint8[](2); i[0] = a; i[1] = b;
    }

    function _signPair(PostmarkEscrow.Verdict memory v, uint8 a, uint8 b)
        internal returns (uint8[] memory, bytes[] memory)
    {
        bytes memory m = escrow.verdictMessage(v);
        bytes[] memory s = new bytes[](2);
        s[0] = pqcSign(sks[a], m);
        s[1] = pqcSign(sks[b], m);
        return (_idx(a, b), s);
    }

    function create(uint256 seed) external {
        uint256 amount = bound(seed >> 8, 0.001 ether, 2 ether);
        uint256 reward = bound(seed >> 40, 0.001 ether, 0.5 ether);
        uint256 bond = bound(seed >> 80, 0.001 ether, 0.5 ether);
        uint64 timeout = uint64(bound(seed >> 100, 1 hours, 7 days));
        uint64 dl = uint64(block.timestamp) + timeout + uint64(bound(seed >> 120, 1, 30 days));
        vm.deal(funder, amount + reward);
        vm.prank(funder);
        try escrow.createBounty{value: amount + reward}(
            amount, keccak256(abi.encode(seed, idCount)), dl, timeout,
            verifiers, bond, reward
        ) returns (uint256 id) {
            idCount = id;
            escrowedById[id] = amount + reward;
            escrowed += amount + reward;
        } catch {}
    }

    function claim(uint256 seed) external {
        if (idCount == 0) return;
        uint256 id = (seed % idCount) + 1;
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        if (b.state != PostmarkEscrow.State.Open) return;
        bool second = seed % 3 == 0;
        address who = second ? claimant2 : claimant;
        bytes memory sk = second ? c2Sk : cSk;
        uint256 round = b.claimRound + 1;
        bytes memory m = escrow.claimMessage(id, who, keccak256("idh"), round);
        vm.prank(who);
        try escrow.claim(id, keccak256("idh"), pqcSign(sk, m)) {} catch {}
    }

    function reopen(uint256 seed) external {
        if (idCount == 0) return;
        try escrow.reopen((seed % idCount) + 1) {} catch {}
    }

    function submit(uint256 seed) external {
        if (idCount == 0) return;
        uint256 id = (seed % idCount) + 1;
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        if (b.state != PostmarkEscrow.State.Open
            && b.state != PostmarkEscrow.State.Claimed) return;
        bool pay = seed % 3 != 0 && b.payee != address(0);
        PostmarkEscrow.Verdict memory v = PostmarkEscrow.Verdict({
            bountyId: id, phase: PostmarkEscrow.Phase.INITIAL,
            outcome: pay ? PostmarkEscrow.Outcome.PAY : PostmarkEscrow.Outcome.REFUND,
            payee: pay ? b.payee : address(0),
            mergedAt: pay ? uint64(block.timestamp) : 0,
            evidenceHash: keccak256("ev"), nonce: b.nonce,
            claimRound: b.claimRound});
        (uint8[] memory idx, bytes[] memory s) = _signPair(v, 0, 1);
        try escrow.submitVerdict(v, idx, s) {} catch {}
    }

    function dispute(uint256 seed) external {
        if (idCount == 0) return;
        uint256 id = (seed % idCount) + 1;
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        if (b.state != PostmarkEscrow.State.Pending) return;
        vm.deal(disputer, b.bondAmount);
        vm.prank(disputer);
        try escrow.dispute{value: b.bondAmount}(id, keccak256("d")) {
            escrowedById[id] += b.bondAmount;
            escrowed += b.bondAmount;
        } catch {}
    }

    function _settle(uint256 id) internal {
        escrowed -= escrowedById[id];
        credited += escrowedById[id];
        escrowedById[id] = 0;
    }

    function resolve(uint256 seed) external {
        if (idCount == 0) return;
        uint256 id = (seed % idCount) + 1;
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        if (b.state != PostmarkEscrow.State.Disputed) return;
        bool pay = seed % 2 == 0 && b.payee != address(0);
        PostmarkEscrow.Verdict memory v = PostmarkEscrow.Verdict({
            bountyId: id, phase: PostmarkEscrow.Phase.DISPUTE,
            outcome: pay ? PostmarkEscrow.Outcome.PAY : PostmarkEscrow.Outcome.REFUND,
            payee: pay ? b.payee : address(0),
            mergedAt: pay ? uint64(block.timestamp) : 0,
            evidenceHash: keccak256("re"), nonce: b.nonce,
            claimRound: b.claimRound});
        (uint8[] memory idx, bytes[] memory s) = _signPair(v, 1, 2);
        try escrow.resolveDispute(v, idx, s) { _settle(id); } catch {}
    }

    function finalize(uint256 seed) external {
        if (idCount == 0) return;
        uint256 id = (seed % idCount) + 1;
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        if (b.state != PostmarkEscrow.State.Pending) return;
        vm.warp(b.challengeEndsAt);
        try escrow.finalize(id) { _settle(id); } catch {}
    }

    function refund(uint256 seed) external {
        if (idCount == 0) return;
        uint256 id = (seed % idCount) + 1;
        PostmarkEscrow.Bounty memory b = escrow.getBounty(id);
        if (b.funder == address(0) || b.deadline >= block.timestamp) return;
        if (b.state != PostmarkEscrow.State.Open
            && b.state != PostmarkEscrow.State.Claimed) return;
        vm.prank(b.funder);
        try escrow.refundExpired(id) { _settle(id); } catch {}
    }

    function advanceTime() external {
        vm.warp(block.timestamp + 1 hours);
    }

    function withdrawAll(uint256 seed) external {
        address[4] memory actors = [funder, claimant, claimant2, disputer];
        address a = actors[seed % 4];
        (uint256 u, uint256 g) = escrow.creditOf(a);
        if (u + g == 0) return;
        vm.prank(a);
        try escrow.withdraw() {
            withdrawn += u + g;
            credited -= u + g;
        } catch {}
    }
}

contract EscrowInvariantTest is EscrowFixture {
    EscrowHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new EscrowHandler(escrow, funder, claimant, claimant2,
            disputer, verifiers, vSks, cSk, c2Sk);
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 8
    /// forge-config: default.invariant.depth = 15
    function invariant_liabilitiesCoveredAndExact() public view {
        uint256 bal = address(escrow).balance;
        uint256 liab = escrow.totalLiabilities();
        assertLe(liab, bal);
        assertEq(liab, handler.escrowed() + handler.credited());
    }
}
