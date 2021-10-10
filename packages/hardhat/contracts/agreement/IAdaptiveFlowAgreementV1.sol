// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;

import { ISuperAgreement } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperAgreement.sol";
import { ISuperfluidToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluidToken.sol";

abstract contract IAdaptiveFlowAgreementV1 is ISuperAgreement {

  // Available Adaptive Periods (AP):  0.999 ^ (1 / time).
  // We can use it to adjust decay/grow velocity.
  int128 public AP_1_DAY = int128(999920052324701219 << 64) / 10 ** 18; 
  int128 public AP_2_DAY = int128(999960025363364823 << 64) / 10 ** 18;
  int128 public AP_3_DAY = int128(999973350064687663 << 64) / 10 ** 18;
  int128 public AP_1_WEEK = int128(99998857851218504 << 64) / 10 ** 18;
  int128 public AP_2_WEEK = int128(99999428923978613 << 64) / 10 ** 18;
  int128 public AP_3_WEEK = int128(99999619282290043 << 64) / 10 ** 18;
  int128 public AP_1_MONTH = int128(999997334974508370 << 64) / 10 ** 18;
  int128 public AP_2_MONTH = int128(9999986674863663 << 64) / 10 ** 18;
  int128 public AP_3_MONTH = int128(9999991116573803 << 64) / 10 ** 18;

  event FlowUpdated(
    ISuperfluidToken indexed token,
    address indexed sender,
    address indexed receiver,
    uint256 timestamp,
    int96 lastRate,
    int96 targetRate,
    int128 adaptivePeriod,
    int256 dynamicBalance,
    bytes userData
  );


  event FlowDeleted(
    ISuperfluidToken indexed token,
    address indexed sender,
    address indexed receiver,
    uint256 timestamp,
    int256 dynamicBalance,
    bytes userData
  );

  /// @dev ISuperAgreement.agreementType implementation
  function agreementType()
    external
    override
    pure
    returns (bytes32)
  {
    return keccak256("org.blossom-labs.agreements.AdaptiveFlowAgreementV1.v1");
  }

  function realtimeRate(
    ISuperfluidToken token,
    address sender,
    address receiver,
    uint256 time
  )
    external
    view
    virtual
    returns (int96 currentRate);

  function createFlow(
    ISuperfluidToken token,
    address receiver,
    int96 targetRate,
    int128 adaptivePeriod,
    bytes calldata ctx
  )
    external
    virtual
    returns(bytes memory newCtx);

  function updateFlow(
    ISuperfluidToken token,
    address receiver,
    int96 targetRate,
    bytes calldata ctx
  ) 
    external
    virtual
    returns (bytes memory newCtx);

  function deleteFlow(
    ISuperfluidToken token,
    address sender,
    address receiver,
    bytes calldata ctx
  )
    external
    virtual
    returns (bytes memory newCtx);

  function getFlow(
    ISuperfluidToken token,
    address sender,
    address receiver
  )
    external
    view
    virtual
    returns (
      uint256 timestamp,
      int96 lastRate,
      int96 targetRate,
      int128 adaptivePeriod,
      int96 flowRate
    );
}
