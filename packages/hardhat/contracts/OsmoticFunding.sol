// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;

import "./OsmoticFundingBase.sol";

contract OsmoticFunding is OsmoticFundingBase {

  constructor(
    ERC20 _stakeToken,
    ERC20 _requestToken,
    uint256 _decay,
    uint256 _maxRatio,
    uint256 _minStakeRatio
  ) OsmoticFundingBase(
    _stakeToken,
    _requestToken,
    _decay,
    _maxRatio,
    _minStakeRatio
  ) {}

  function requestTokenSymbol() public view returns (string memory) {
    return requestToken.symbol();
  }

  function availableFunds() public view returns (uint256) {
    return requestToken.balanceOf(address(this));
  }
}