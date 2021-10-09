// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import { ISuperfluidToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluidToken.sol";
import { ISuperfluid } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { AgreementBase } from "@superfluid-finance/ethereum-contracts/contracts/agreements/AgreementBase.sol";
import { AgreementLibrary } from "@superfluid-finance/ethereum-contracts/contracts/agreements/AgreementLibrary.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/SafeCast.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import { IAdaptiveFlowAgreementV1 } from "./IAdaptiveFlowAgreementV1.sol";
import  { ABDKMath64x64 } from "abdk-libraries-solidity/ABDKMath64x64.sol";

contract AdaptiveFlowAgreementV1 is AgreementBase, IAdaptiveFlowAgreementV1 {
  using ABDKMath64x64 for int128;
  using ABDKMath64x64 for uint256;
  using ABDKMath64x64 for int96;
  using SafeMath for uint256;
  using SignedSafeMath for int256;
  using SafeCast for uint256;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  int128 constant private ONE = 1 << 64;
  int128 constant private ALMOST_ONE = int128((999 << 64) / 1000); // 0.999
  
  // Available Adaptive Periods (AP):  0.999 ^ (1 / time).
  // We can use it to adjust decay/grow velocity.
  int128 public AP_1_DAY = int128(999920052324701219 << 64) / 2 ** 18; 
  int128 public AP_2_DAY = int128(999960025363364823 << 64) / 2 ** 18;
  int128 public AP_3_DAY = int128(999973350064687663 << 64) / 2 ** 18;
  int128 public AP_1_WEEK = int128(99998857851218504 << 64) / 2 ** 18;
  int128 public AP_2_WEEK = int128(99999428923978613 << 64) / 2 ** 18;
  int128 public AP_3_WEEK = int128(99999619282290043 << 64) / 2 ** 18;
  int128 public AP_1_MONTH = int128(9999973349745083 << 64) / 2 ** 18;
  int128 public AP_2_MONTH = int128(9999986674863663 << 64) / 2 ** 18;
  int128 public AP_3_MONTH = int128(9999991116573803 << 64) / 2 ** 18;


  struct AdaptiveFlowParams {
    uint256 timestamp;
    bytes32 flowId;
    address receiver;
    address sender;
    // TODO: Should use unsigned integers instead as negative/positive flows are infered when calculating their rate
    int96 lastRate;
    int96 targetRate;
    int64 adaptivePeriod;
    bytes userData;
  }

  struct AdaptiveFlowData {
    uint256 timestamp;
    address sender;
    int96 lastRate;
    int96 targetRate;
    int64 adaptivePeriod;
  }

  mapping(address => EnumerableSet.Bytes32Set) private accountsFlows;


  /**************************************************************************
    * ISuperAgreement interface
    *************************************************************************/

  function realtimeBalanceOf(
    ISuperfluidToken token,
    address account,
    uint256 time
  )
    external view override   
    returns (
      int256 totalDynamicBalance,
      uint256 deposit,
      uint256 owedDeposit
    )
  {
    EnumerableSet.Bytes32Set storage flows = accountsFlows[account];

    if (flows.length() > 0) {
      int256 dynamicBalance = 0;

      for(uint256 i = 0; i < flows.length(); i++) {
        (, AdaptiveFlowData memory flowData) = _getFlowData(token, flows.at(i));
        dynamicBalance = _calculateSuperTokenBalance(time, flowData.lastRate, flowData.targetRate, flowData.adaptivePeriod, account == flowData.sender);
        totalDynamicBalance = totalDynamicBalance.add(dynamicBalance);
      }
      deposit = 0;
      owedDeposit = 0;
    }
  }

  function realtimeRate(
    ISuperfluidToken token,
    address sender,
    address receiver,
    uint256 time
  )
    external
    view
    override
    returns (int96 currentRate) 
  {
    (bool exist, AdaptiveFlowData memory flowData) =_getFlowData(token, _generateFlowId(sender, receiver));

    if (exist) {
      currentRate = _calculateFlowRate(flowData.lastRate, flowData.targetRate, flowData.adaptivePeriod, time);
    }
  }

  function createFlow(
    ISuperfluidToken token,
    address receiver,
    int96 targetRate,
    int64 adaptivePeriod,
    bytes calldata ctx
  ) 
    external
    virtual
    override
    returns (bytes memory newCtx)
  {
    AdaptiveFlowParams memory flowParams;
    require(receiver != address(0), "AFA: receiver is zero");
    ISuperfluid.Context memory currentContext = AgreementLibrary.authorizeTokenAccess(token, ctx);
    flowParams.flowId = _generateFlowId(currentContext.msgSender, receiver);
    flowParams.timestamp = currentContext.timestamp;
    flowParams.sender = currentContext.msgSender;
    flowParams.receiver = receiver;
    flowParams.lastRate = 0;
    flowParams.targetRate = targetRate;
    flowParams.adaptivePeriod = adaptivePeriod;
    flowParams.userData = currentContext.userData;
    require(flowParams.sender != flowParams.receiver, "AFA: no self flow");
    require(flowParams.targetRate > 0, "AFA: invalid target rate");
    require(flowParams.adaptivePeriod > 0, "AFA: invalid adaptive period");


    (bool exist,) = _getFlowData(token, flowParams.flowId);
    require(!exist, "AFA: flow already exist");


    accountsFlows[flowParams.sender].add(flowParams.flowId);
    accountsFlows[flowParams.receiver].add(flowParams.flowId);
    
    _changeFlow(token, flowParams, currentContext);
  }

  function updateFlow(
    ISuperfluidToken token,
    address receiver,
    uint256 finalRate,
    bytes calldata ctx
  ) 
    external
    override
    returns (bytes memory newCtx) 
  {
    // TODO: implement
    return bytes("");
  }

  function deleteFlow(
    ISuperfluidToken token,
    address sender,
    address receiver,
    bytes calldata ctx
  )
    external
    override
    returns (bytes memory newCtx)
  {
    // TODO: implement
    return bytes("");
  }

  function getFlow(
    ISuperfluidToken token,
    address sender,
    address receiver
  ) 
    external
    view
    override 
    returns (
      int96 lastRate,
      int96 targetRate,
      int128 adaptivePeriod,
      int96 flowRate
    ) 
  {
    (, AdaptiveFlowData memory data) = _getFlowData(token, _generateFlowId(sender, receiver));
    flowRate = _calculateFlowRate(lastRate, targetRate, adaptivePeriod, block.timestamp);
    return (
      data.lastRate,
      data.targetRate,
      data.adaptivePeriod,
      flowRate
    );
  }

  /**************************************************************************
     * Internal State Functions
     *************************************************************************/

  function _changeFlow(
    ISuperfluidToken token,
    AdaptiveFlowParams memory flowParams,
    ISuperfluid.Context memory currentContext
  ) 
    private
    returns (AdaptiveFlowData memory newFlowData)
  {
    (,AdaptiveFlowData memory oldFlowData) = _getFlowData(token, flowParams.flowId);

    uint256 timePassed = currentContext.timestamp.sub(oldFlowData.timestamp);
    int96 currentRate = _calculateFlowRate(oldFlowData.lastRate, oldFlowData.targetRate, oldFlowData.adaptivePeriod, currentContext.timestamp);

    // Calculate and update balance
    int256 dynamicBalance = _calculateSuperTokenBalance(timePassed, oldFlowData.lastRate, currentRate, oldFlowData.adaptivePeriod, flowParams.sender == oldFlowData.sender);
    token.settleBalance(flowParams.sender, dynamicBalance);

    // Update flow state data
    newFlowData = AdaptiveFlowData(
      currentContext.timestamp,
      flowParams.sender,
      // The new last target rate will be the current rate
      currentRate,
      flowParams.targetRate,
      flowParams.adaptivePeriod
    );
    _updateFlowData(token, flowParams.flowId, newFlowData);
    
  }

  function _getFlowData
  (
    ISuperfluidToken token,
    bytes32 dId
  )
    private view
    returns (bool exist, AdaptiveFlowData memory)
  {
    bytes32[] memory data = token.getAgreementData(address(this), dId, 2);
    exist = data.length > 0;
    return _decodeFlowData(uint256(data[0]), uint256(data[1]));
  }

  function _updateFlowData
  (
    ISuperfluidToken token,
    bytes32 dId,
    AdaptiveFlowData memory flowData
  )
    private
  {
    token.updateAgreementData(dId, _encodeFlowData(flowData));
  }


  /**************************************************************************
    * Flow Data Pure Functions
    *************************************************************************/

  function _calculateFlowRate(int96 lastRate, int96 targetRate, int128 adaptivePeriod, uint256 time) private pure returns (int96) {
    // (1 - 0.999) ^ (1 / adaptativePeriod)
    int128 at = adaptivePeriod.pow(time);

    // r(time) = r(0) * adaptivePeriod ^ time + r(∞) * (1 - adaptivePeriod ^ time)
    return int96(at.mul(int128(lastRate)).add(ONE.sub(at).mul(int128(targetRate))));
  }


  // Stack variables to avoid stack too deep issue
  struct _StackVars_calculateSuperTokenBalance {
      uint256 lastRate;
      uint256 targetRate;
      int128 oneSubAt;
      int128 lna;
  }
  function _calculateSuperTokenBalance(
    uint256 _timePassed,
    int96 _lastRate,
    int96 _targetRate,
    int128 adaptivePeriod,
    bool isNegative
  ) public pure returns(int256 amount) {
    _StackVars_calculateSuperTokenBalance memory vars;

    vars.lastRate = uint256(_lastRate); 
    vars.targetRate = uint256(_targetRate);
    vars.oneSubAt = ONE.sub(adaptivePeriod.pow(_timePassed));
    vars.lna = ONE.div(adaptivePeriod).ln();

    // amount = (targetRate * (1 - adaptivePeriod ^ time + time * ln(1 / adaptivePeriod)) + lastRate * (1 - alpha ^ time)) / ln(1 / adaptivePeriod)
    amount = int256(ONE.div(vars.lna).mulu(vars.oneSubAt.add(_timePassed.fromUInt().mul(vars.lna)).mulu(vars.targetRate).add(vars.oneSubAt.mulu(vars.lastRate))));

    if (isNegative) {
      amount = -amount;
    }
  }

  function _generateFlowId(address sender, address receiver) private pure returns(bytes32 id) {
      return keccak256(abi.encode(sender, receiver));
  }

  //
  // Data packing:
  //
  // WORD A: | lastRate |  targetRate | adaptivePeriod
  //         | 96b      |    96b      |    64b     |
  // WORD B: | timestamp | sender (needed for setting flow sign) |
  //         |   32b     |  160b                                 |  
  // NOTE:
  // - rates have 96 bits length

  function _encodeFlowData (
      AdaptiveFlowData memory flowData
  )
      internal pure
      returns(bytes32[] memory data)
  {
      // enable these for debugging
      // assert(flowData.deposit & type(uint32).max == 0);
      // assert(flowData.owedDeposit & type(uint32).max == 0);
      data = new bytes32[](2);
      data[0] = bytes32(
        ((uint256(uint96(flowData.lastRate)) << 160)) |
        (uint256(uint96(flowData.targetRate)) << 64) |
        (uint256(uint64(flowData.adaptivePeriod)))
      );
      data[1] = bytes32(
        ((uint256(flowData.timestamp)) << 224) |
        ((uint256(uint160(flowData.sender))) << 64)
      );
  }

  function _decodeFlowData
  (
      uint256 wordA,
      uint256 wordB
  )
      internal pure
      returns(bool exist, AdaptiveFlowData memory flowData)
  {
      exist = wordA > 0 && wordB > 0;
      if (exist) {
          // word A
          flowData.lastRate = int96((wordA >> 160) & uint256(type(uint96).max));
          flowData.targetRate = int96((wordA >> 64) & uint256(type(uint96).max));
          flowData.adaptivePeriod = int64(wordA & uint256(type(uint64).max));
          // word B
          flowData.timestamp = uint32((wordB >> 224) & uint256(type(uint32).max));
          flowData.sender = address((wordB >> 64) & uint256(type(uint160).max));
      }
  }
}
