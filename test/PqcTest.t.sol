// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PqcTest} from "../src/test-utils/PqcTest.sol";
import {PqcKeyStatusMock} from "../src/test-utils/PqcMocks.sol";

contract PqcLibraryTest is PqcTest {
    bytes private pk;
    bytes private sk;

    function setUp() public override {
        super.setUp();
        (pk, sk) = pqcGenerateAndRegister(address(1), bytes32(uint256(42)));
    }

    function testNodeSignatureVerifiesThroughViewAbi() public {
        bytes memory message = qorexMessage("qorechain-diana", hex"0001ff");
        bytes memory sig = pqcSign(sk, message);
        assertEq(pk.length, 2592);
        assertEq(sig.length, 4627);
        assertTrue(PQC_VERIFY.pqcVerify(pk, sig, message));
    }

    function testTamperedMessageFails() public {
        bytes memory sig = pqcSign(sk, "message");
        assertFalse(PQC_VERIFY.pqcVerify(pk, sig, "messagE"));
    }

    function testWrongKeyFails() public {
        (bytes memory other,) = pqcKeygen(bytes32(uint256(43)));
        assertFalse(PQC_VERIFY.pqcVerify(other, pqcSign(sk, "message"), "message"));
    }

    function testTamperedSignatureFails() public {
        bytes memory sig = pqcSign(sk, "message");
        sig[100] ^= 0x01;
        assertFalse(PQC_VERIFY.pqcVerify(pk, sig, "message"));
    }

    function testEmptyMessageValidAndMalformedInputsFail() public {
        bytes memory sig = pqcSign(sk, "");
        assertTrue(PQC_VERIFY.pqcVerify(pk, sig, ""));
        assertFalse(PQC_VERIFY.pqcVerify("", sig, ""));
        assertFalse(PQC_VERIFY.pqcVerify(pk, "", ""));
        assertFalse(PQC_VERIFY.pqcVerify(new bytes(2592), new bytes(4627), ""));
    }

    function testDeterministicKeygenAndSigning() public {
        (bytes memory again, bytes memory secret) = pqcKeygen(bytes32(uint256(42)));
        assertEq(again, pk);
        assertEq(secret, sk);
        assertEq(pqcSign(sk, "same"), pqcSign(secret, "same"));
    }

    function testSharedUpstreamVector() public {
        (bytes memory key, bytes memory sig, bytes memory message) =
            abi.decode(pqcFfi("vector", "", ""), (bytes, bytes, bytes));
        assertTrue(PQC_VERIFY.pqcVerify(key, sig, message));
        assertFalse(PQC_VERIFY.pqcVerify(key, sig, abi.encodePacked(message, hex"00")));
    }

    function testRegistryRegisteredUnprovenRotatedRevoked() public {
        assertStatus(address(1), true, 1, pk, true);
        assertStatus(address(2), false, 0, "", false);
        pqcRegister(address(1), pk, false);
        assertStatus(address(1), true, 1, pk, false);
        (bytes memory replacement,) = pqcKeygen(bytes32(uint256(99)));
        pqcRegister(address(1), replacement, true);
        assertStatus(address(1), true, 1, replacement, true);
        pqcRevoke(address(1));
        assertStatus(address(1), false, 0, "", false);
    }

    function testRegistryRejectsMalformedKey() public {
        vm.expectRevert(bytes("ML-DSA-87 key length"));
        PqcKeyStatusMock(address(PQC_KEYS)).register(address(2), "", true);
    }

    function testQorexPrefix() public {
        assertEq(qorexMessage("qorechain-diana", "hello"), bytes("qorechain-msg-v1|qorechain-diana|hello"));
        assertEq(qorexMessage("a.A_0-", ""), bytes("qorechain-msg-v1|a.A_0-|"));
        bytes memory sig = pqcSign(sk, qorexMessage("qorechain-diana", "hello"));
        assertFalse(PQC_VERIFY.pqcVerify(pk, sig, qorexMessage("qorechain-vladi", "hello")));
    }

    function testQorexRejectsEmptyAndInvalidChainId() public {
        vm.expectRevert(bytes("Empty chain id"));
        this.prefix("", "");
        vm.expectRevert(bytes("Invalid chain id"));
        this.prefix("a|b", "");
    }

    function testFfiErrorsAreNotConvertedToValidSignatures() public {
        vm.expectRevert();
        this.badSeed();
    }

    function prefix(string memory id, bytes memory data) external pure returns (bytes memory) {
        return qorexMessage(id, data);
    }

    function badSeed() external { pqcFfi("keygen", "0x00", ""); }

    function assertStatus(address who, bool registered, uint8 algorithm, bytes memory key, bool proven) private view {
        (bool r, uint8 a, bytes memory p, bool v) = PQC_KEYS.pqcKeyStatus(who);
        assertEq(r, registered);
        assertEq(a, algorithm);
        assertEq(p, key);
        assertEq(v, proven);
    }
}
