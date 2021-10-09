// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import { ISuperfluid, ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { SuperAppBase, SuperAppDefinitions } from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import { IAdaptiveFlowAgreementV1 } from "./agreement/IAdaptiveFlowAgreementV1.sol";

contract FluidFunding is SuperAppBase {

  ISuperfluid private host;
  IAdaptiveFlowAgreementV1 private afa;
  ISuperToken private acceptedToken;

  constructor(
    ISuperfluid _host,
    IAdaptiveFlowAgreementV1 _afa,
    ISuperToken _acceptedToken
    // string memory _registrationKey
  ) {
    assert(address(_host) != address(0));
    assert(address(_afa) != address(0));
    assert(address(_acceptedToken) != address(0));

    host = _host;
    afa = _afa;
    acceptedToken = _acceptedToken;

    uint256 configWord =
        SuperAppDefinitions.APP_LEVEL_FINAL |
        SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
        SuperAppDefinitions.AFTER_AGREEMENT_CREATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
        SuperAppDefinitions.AFTER_AGREEMENT_UPDATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP |
        SuperAppDefinitions.AFTER_AGREEMENT_TERMINATED_NOOP;

    _host.registerApp(configWord);

    // // For networks with app whitelisting enabled
    // _host.registerAppWithKey(configWord, _registrationKey);
  }

  function _updateFundingFlow(address recipient, uint256 _reward) internal returns (bytes memory newCtx) {
    (,int96 targetRate,,) = afa.getFlow(acceptedToken, address(this), recipient);

    // Check if stream flow already exists
    if (targetRate != 0) {
      return host.callAgreement(afa, abi.encodeWithSelector(afa.createFlow.selector, acceptedToken, recipient, 0, int96(_reward), new bytes(0) ), "0x");
    }
    // TODO: Implement update flow functionality
    // else {
    //   return host.callAgreement(afa, abi.encodeWithSelector(afa.updateFlow.selector, acceptedToken, recipient, 0, int96(_reward), new bytes(0)), "0x");
    // }
  }
}
