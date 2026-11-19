// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

contract PqcVerifyMock {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // Deliberately non-view: ffi is a cheatcode, but callers use the real view ABI.
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external returns (bool)
    {
        string[] memory args = new string[](6);
        args[0] = "node";
        args[1] = "scripts/pqc.mjs";
        args[2] = "verify";
        args[3] = VM.toString(pubkey);
        args[4] = VM.toString(signature);
        args[5] = VM.toString(message);
        return abi.decode(VM.ffi(args), (bool));
    }
}

contract PqcKeyStatusMock {
    struct Key { bool registered; uint8 algorithmId; bytes pubkey; bool possessionProven; }
    mapping(address => Key) private keys;

    function register(address account, bytes calldata pubkey, bool proven) external {
        require(pubkey.length == 2592, "ML-DSA-87 key length");
        keys[account] = Key(true, 1, pubkey, proven);
    }

    function revoke(address account) external { delete keys[account]; }

    function pqcKeyStatus(address account) external view returns (bool, uint8, bytes memory, bool) {
        Key storage key = keys[account];
        return (key.registered, key.algorithmId, key.pubkey, key.possessionProven);
    }
}
