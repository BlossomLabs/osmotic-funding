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


contract AdaptiveFlowAgreementV1 is IAdaptiveFlowAgreementV1, AgreementBase {
  using ABDKMath64x64 for int128;
  using ABDKMath64x64 for uint256;
  using ABDKMath64x64 for int96;
  using SafeMath for uint256;
  using SignedSafeMath for int256;
  using SafeCast for uint256;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  int128 constant private ONE = 1 << 64;
  int128 constant private ALMOST_ONE = int128((999 << 64) / 1000); // 0.999

  struct AdaptiveFlowParams {
    uint256 timestamp;
    address receiver;
    address sender;
    bytes32 flowId;
    // TODO: Should use unsigned integers instead as negative/positive flows are infered when calculating their rate
    int96 lastRate;
    int96 targetRate;
    int128 adaptivePeriod;
    bytes userData;
  }

  struct AdaptiveFlowData {
    uint256 timestamp;
    address receiver;
    int96 lastRate;
    int96 targetRate;
    int128 adaptivePeriod;
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

        dynamicBalance = _calculateSuperTokenBalance(time.sub(flowData.timestamp), flowData.lastRate, flowData.targetRate, flowData.adaptivePeriod);

        if (account == flowData.receiver) {
          totalDynamicBalance = totalDynamicBalance.add(dynamicBalance);
        } else {
          totalDynamicBalance = totalDynamicBalance.sub(dynamicBalance);
        }
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

    if (exist && time > flowData.timestamp) {
      currentRate = _calculateFlowRate(flowData.lastRate, flowData.targetRate, flowData.adaptivePeriod, time.sub(flowData.timestamp));
    }
  }

  function createFlow(
    ISuperfluidToken token,
    address receiver,
    int96 targetRate,
    int128 adaptivePeriod,
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
    require(flowParams.targetRate > 0, "AFA: invalid target rate for new flow");
    require(flowParams.adaptivePeriod > 0, "AFA: invalid adaptive period");

    (bool exist,) = _getFlowData(token, flowParams.flowId);
    require(!exist, "AFA: flow already exists");

    newCtx = ctx;
    (,AdaptiveFlowData memory oldFlowData) = _getFlowData(token, flowParams.flowId);

    accountsFlows[flowParams.sender].add(flowParams.flowId);
    accountsFlows[flowParams.receiver].add(flowParams.flowId);
    
    _changeFlow(token, flowParams, oldFlowData, false);

    _requireAvailableBalance(token, currentContext);
  }

  function updateFlow(
    ISuperfluidToken token,
    address receiver,
    int96 targetRate,
    bytes calldata ctx
  ) 
    external
    override
    returns (bytes memory newCtx) 
  {
    AdaptiveFlowParams memory flowParams;
    require(receiver != address(0), "AFA: receiver is zero");
    ISuperfluid.Context memory currentContext = AgreementLibrary.authorizeTokenAccess(token, ctx);
    flowParams.flowId = _generateFlowId(currentContext.msgSender, receiver);
    flowParams.timestamp = currentContext.timestamp;
    flowParams.sender = currentContext.msgSender;
    (bool exist, AdaptiveFlowData memory oldFlowData) = _getFlowData(token, flowParams.flowId);
    require(exist, "AFA: flow does not exists");

    flowParams.receiver = receiver;
    flowParams.targetRate = targetRate;
    require(flowParams.sender != flowParams.receiver, "AFA: no self flow");

    flowParams.adaptivePeriod = oldFlowData.adaptivePeriod;
    flowParams.userData = currentContext.userData;

    _changeFlow(token, flowParams, oldFlowData, false);

    _requireAvailableBalance(token, currentContext);

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
    AdaptiveFlowParams memory flowParams;
    require(sender != address(0), "AFA: sender is zero");
    require(receiver != address(0), "AFA: receiver is zero");
    ISuperfluid.Context memory currentContext = AgreementLibrary.authorizeTokenAccess(token, ctx);
    flowParams.flowId = _generateFlowId(currentContext.msgSender, receiver);
    flowParams.sender = currentContext.msgSender;
    flowParams.receiver = receiver;

    (bool exist, AdaptiveFlowData memory oldFlowData) = _getFlowData(token, flowParams.flowId);
    require(exist, "AFA: flow does not exists");

    flowParams.timestamp = currentContext.timestamp;
    flowParams.targetRate = 0;
    flowParams.adaptivePeriod = oldFlowData.adaptivePeriod;
    flowParams.userData = currentContext.userData;
    require(flowParams.sender != flowParams.receiver, "AFA: no self flow");


    // // TODO: Implement insolvency and liquidity logic
    // int256 availableBalance;
    // // should use currentContext.timestamp
    // (availableBalance,,) = token.realtimeBalanceOf(sender, block.timestamp);
    // require(availableBalance >= 0, "AFA: Sender does not have balance");
    // token.settleBalance(flowParams.sender, -dynamicBalance);
    // token.settleBalance(flowParams.receiver, dynamicBalance);

    _changeFlow(token, flowParams, oldFlowData, true);

    accountsFlows[flowParams.sender].remove(flowParams.flowId);
    accountsFlows[flowParams.receiver].remove(flowParams.flowId);

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
      uint256 timestamp,
      int96 lastRate,
      int96 targetRate,
      int128 adaptivePeriod,
      int96 flowRate
    ) 
  {
    (, AdaptiveFlowData memory flowData) = _getFlowData(token, _generateFlowId(sender, receiver));
    flowRate = _calculateFlowRate(lastRate, targetRate, adaptivePeriod, block.timestamp.sub(flowData.timestamp));
    return (
      flowData.timestamp,
      flowData.lastRate,
      flowData.targetRate,
      flowData.adaptivePeriod,
      flowRate
    );
  }

  /**************************************************************************
     * Internal State Functions
     *************************************************************************/

  function _changeFlow(
    ISuperfluidToken token,
    AdaptiveFlowParams memory flowParams,
    AdaptiveFlowData memory oldFlowData,
    bool terminateFlow
    // ISuperfluid.Context memory currentContext
  ) 
    private
    returns (AdaptiveFlowData memory newFlowData)
  {
    uint256 timePassed = flowParams.timestamp.sub(oldFlowData.timestamp);
    int96 currentRate = _calculateFlowRate(oldFlowData.lastRate, oldFlowData.targetRate, flowParams.adaptivePeriod, timePassed);

    // Calculate and update balance for both the sender and the receiver
    int256 dynamicBalance = _calculateSuperTokenBalance(timePassed, oldFlowData.lastRate, currentRate, flowParams.adaptivePeriod);
    token.settleBalance(flowParams.sender, -dynamicBalance);
    token.settleBalance(flowParams.receiver, dynamicBalance);

    if (!terminateFlow) {
      // Update flow state data
      newFlowData = AdaptiveFlowData(
        // currentContext.timestamp,
        flowParams.timestamp,
        flowParams.receiver,
        // The new last target rate will be the current rate
        currentRate,
        flowParams.targetRate,
        flowParams.adaptivePeriod
      );
      _updateFlowData(token, flowParams.flowId, newFlowData);

      // Emit event
      emit FlowUpdated(
        token,
        flowParams.sender,
        flowParams.receiver,
        flowParams.timestamp,
        newFlowData.lastRate,
        newFlowData.targetRate,
        flowParams.adaptivePeriod,
        dynamicBalance,
        flowParams.userData
      );
    } else {
      _deleteFlowData(token, flowParams.flowId);
      emit FlowDeleted(token, flowParams.sender, flowParams.receiver, flowParams.timestamp, dynamicBalance, flowParams.userData);    
    }
    
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

  function _deleteFlowData
  (
    ISuperfluidToken token,
    bytes32 dId
  )
    private
  {
    token.terminateAgreement(dId, 2);
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
      int128 adaptivePeriod;
      int128 lna;
  }
  function _calculateSuperTokenBalance(
    uint256 _timePassed,
    int96 _lastRate,
    int96 _targetRate,
    int128 _adaptivePeriod
  ) public pure returns(int256 amount) {
    _StackVars_calculateSuperTokenBalance memory vars;
    vars.lastRate = uint256(_lastRate); 
    vars.targetRate = uint256(_targetRate);
    vars.adaptivePeriod = _adaptivePeriod;
    vars.oneSubAt = ONE.sub(vars.adaptivePeriod.pow(_timePassed));
    vars.lna = ONE.div(vars.adaptivePeriod).ln();

    // amount = (targetRate * (1 - adaptivePeriod ^ time + time * ln(1 / adaptivePeriod)) + lastRate * (1 - alpha ^ time)) / ln(1 / adaptivePeriod)
    amount = int256(ONE.div(vars.lna).mulu(vars.oneSubAt.add(_timePassed.fromUInt().mul(vars.lna)).mulu(vars.targetRate).add(vars.oneSubAt.mulu(vars.lastRate))));
  }

  function _generateFlowId(address sender, address receiver) private pure returns(bytes32 id) {
    return keccak256(abi.encode(sender, receiver));
  }

  function _requireAvailableBalance(
    ISuperfluidToken token,
    ISuperfluid.Context memory currentContext
  )
    private view
  {

    (int256 availableBalance,,) = token.realtimeBalanceOf(currentContext.msgSender, currentContext.timestamp);
    require(availableBalance >= 0, "AFA: not enough available balance");
    
  }

  //
  // Data packing:
  //
  // WORD A: |   timestamp     |  lastRate   |  adaptivePeriod | 
  //         |     32b         |    96b      |    128b         |
  // WORD B: |   targetRate    | receiver (needed for setting flow sign) |
  //         |     96b         |             160b                      |  
  // NOTE:
  // - rates have 96 bits length

  function _encodeFlowData (
      AdaptiveFlowData memory flowData
  )
      internal pure
      returns(bytes32[] memory data)
  {
    data = new bytes32[](2);
    // Word A
    data[0] = bytes32(
      ((uint256(flowData.timestamp)) << 224) |
      ((uint256(uint96(flowData.lastRate)) << 128)) |
      (uint256(uint128(flowData.adaptivePeriod)))
    );
    // Word B
    data[1] = bytes32(
      (uint256(uint96(flowData.targetRate)) << 160) |
      (uint256(uint160(flowData.receiver)))
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
      // Word A
      flowData.timestamp = uint32((wordA >> 224) & uint256(type(uint32).max));
      flowData.lastRate = int96((wordA >> 128) & uint256(type(uint96).max));
      flowData.adaptivePeriod = int128(wordA & uint256(type(uint128).max));
      // Word B
      flowData.targetRate = int96((wordB >> 160) & uint256(type(uint96).max));
      flowData.receiver = address(wordB & uint256(type(uint160).max));
    }
  }
}
