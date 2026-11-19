// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Payee/funder contract that reenters the escrow when it receives native funds.
contract ReentrantReceiver {
    address public immutable escrow;
    bytes public reentryData;
    bool public armed;

    constructor(address escrow_) { escrow = escrow_; }

    function arm(bytes calldata data) external {
        reentryData = data;
        armed = true;
    }

    receive() external payable {
        if (armed) {
            armed = false;
            (bool ok,) = escrow.call(reentryData);
            ok;
        }
    }
}

/// Account contract that refuses native funds.
contract RejectingReceiver {
    receive() external payable { revert("no thanks"); }
}

/// Configurable pqcKeyStatus replacement to etch over 0x..0a02.
contract CustomKeyStatus {
    mapping(address => Key) private keys;
    struct Key { bool registered; uint8 algorithmId; bytes pubkey; bool proven; }

    function set(address account, bool registered, uint8 algorithmId, bytes calldata pubkey,
        bool proven) external
    {
        keys[account] = Key(registered, algorithmId, pubkey, proven);
    }

    function pqcKeyStatus(address account) external view returns (bool, uint8, bytes memory, bool) {
        Key storage k = keys[account];
        return (k.registered, k.algorithmId, k.pubkey, k.proven);
    }
}

/// Always reverts.
contract RevertingPrecompile {
    fallback() external { revert("precompile down"); }
}

/// Returns a single zero word (too short / malformed for key status).
contract ShortReturnPrecompile {
    fallback() external { assembly { return(0, 32) } }
}

/// Returns a well-formed `false` (32-byte zero word).
contract FalseVerifyPrecompile {
    fallback() external { assembly { return(0, 32) } }
}

/// Returns 64 bytes (malformed pqcVerify output).
contract LongReturnPrecompile {
    fallback() external { assembly { return(0, 64) } }
}
