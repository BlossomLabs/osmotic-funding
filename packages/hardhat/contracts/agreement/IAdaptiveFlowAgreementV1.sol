// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;

import { ISuperAgreement } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperAgreement.sol";
import { ISuperfluidToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluidToken.sol";

abstract contract IAdaptiveFlowAgreementV1 is ISuperAgreement {

  event FlowUpdated(
    ISuperfluidToken indexed token,
    address indexed sender,
    address indexed receiver,
    int96 lastRate,
    int96 targetRate,
    int64 adaptivePeriod,
    bytes userData
  );

  /// @dev ISuperAgreement.agreementType implementation
  function agreementType() external override pure returns (bytes32) {
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

    function createFlow(ISuperfluidToken token, address receiver, int96 targetRate, int64 adaptivePeriod, bytes calldata ctx) external virtual returns(bytes memory newCtx);

    function updateFlow(ISuperfluidToken token, address receiver, uint256 finalRate, bytes calldata ctx) external virtual returns (bytes memory newCtx);

    function deleteFlow(ISuperfluidToken token, address sender, address receiver, bytes calldata ctx) external virtual returns (bytes memory newCtx);

    function getFlow(ISuperfluidToken token, address sender, address receiver) external view virtual returns (int96 lastRate, int96 targetRate, int128 adaptivePeriod, int96 flowRate);
}
