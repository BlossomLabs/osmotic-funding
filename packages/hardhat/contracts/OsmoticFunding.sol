// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./OsmoticFundingBase.sol";

contract OsmoticFunding is OsmoticFundingBase {
  using SafeMath for uint256;
  using SafeERC20 for ERC20;

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

  function stakeTokenBalanceOf(address _voter) public view returns (uint256) {
    return stakeToken.balanceOf(_voter).add(getTotalVoterStake(_voter));
  }

  function stakeTokenSymbol() public view returns (string memory) {
    return stakeToken.symbol();
  }

  function faucet() public {
    require(stakeToken.balanceOf(address(this)) >= totalStaked + (500 * 10 ** 18), "Not enough funds in faucet");
    stakeToken.safeTransfer(msg.sender, 500 * 10 ** 18);
  }

  function requestTokenSymbol() public view returns (string memory) {
    return requestToken.symbol();
  }

  function availableFunds() public view returns (uint256) {
    return requestToken.balanceOf(address(this));
  }
}