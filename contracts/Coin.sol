// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract USDC is ERC20 {
    
    uint256 initialSupply = 100000 ether;
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, initialSupply);
    }

    function mint() external {
        _mint(msg.sender, 1 ether);
    }
}
