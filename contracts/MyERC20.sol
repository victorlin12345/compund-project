// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyERC20 is ERC20 {
    constructor(uint256 _supply, string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        _mint(msg.sender, _supply);
    }
}