// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IQorePQC} from "./IQorePQC.sol";
import {PqcVerifyMock, PqcKeyStatusMock} from "./PqcMocks.sol";

abstract contract PqcTest is Test {
    IQorePQC internal constant PQC_VERIFY = IQorePQC(0x0000000000000000000000000000000000000a01);
    IQorePQC internal constant PQC_KEYS = IQorePQC(0x0000000000000000000000000000000000000a02);

    function setUp() public virtual {
        vm.etch(address(PQC_VERIFY), address(new PqcVerifyMock()).code);
        vm.etch(address(PQC_KEYS), address(new PqcKeyStatusMock()).code);
        vm.allowCheatcodes(address(PQC_VERIFY));
    }

    function pqcKeygen(bytes32 seed) internal returns (bytes memory pubkey, bytes memory secretKey) {
        return abi.decode(pqcFfi("keygen", vm.toString(abi.encodePacked(seed)), ""), (bytes, bytes));
    }

    function pqcSign(bytes memory secretKey, bytes memory message) internal returns (bytes memory) {
        return abi.decode(pqcFfi("sign", vm.toString(secretKey), vm.toString(message)), (bytes));
    }

    function pqcRegister(address account, bytes memory pubkey, bool proven) internal {
        PqcKeyStatusMock(address(PQC_KEYS)).register(account, pubkey, proven);
    }

    function pqcGenerateAndRegister(address account, bytes32 seed)
        internal returns (bytes memory pubkey, bytes memory secretKey)
    {
        (pubkey, secretKey) = pqcKeygen(seed);
        pqcRegister(account, pubkey, true);
    }

    function pqcRevoke(address account) internal { PqcKeyStatusMock(address(PQC_KEYS)).revoke(account); }

    function qorexMessage(string memory chainId, bytes memory data) internal pure returns (bytes memory) {
        bytes memory id = bytes(chainId);
        require(id.length != 0, "Empty chain id");
        for (uint256 i; i < id.length; ++i) {
            bytes1 c = id[i];
            require((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") ||
                (c >= "0" && c <= "9") || c == "." || c == "_" || c == "-", "Invalid chain id");
        }
        return abi.encodePacked("qorechain-msg-v1|", chainId, "|", data);
    }

    function pqcFfi(string memory op, string memory a, string memory b) internal returns (bytes memory) {
        string[] memory args = new string[](5);
        args[0] = "node";
        args[1] = "scripts/pqc.mjs";
        args[2] = op;
        args[3] = a;
        args[4] = b;
        return vm.ffi(args);
    }
}
