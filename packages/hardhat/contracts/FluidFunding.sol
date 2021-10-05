// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

contract FluidFunding is SuperAppBase {

  ISuperfluid private host; // host
  IConstantFlowAgreementV1 private cfa; // the stored constant flow agreement class address
  ISuperToken private acceptedToken; // accepted token

  constructor(
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    ISuperToken _acceptedToken
    // string memory _registrationKey
  ) {
    assert(address(_host) != address(0));
    assert(address(_cfa) != address(0));
    assert(address(_acceptedToken) != address(0));

    host = _host;
    cfa = _cfa;
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

  function _updateFundingFlow(address _recipient, uint256 _reward) internal returns (bytes memory newCtx) {
    (uint256 timestamp,,,) = cfa.getFlow(acceptedToken, address(this), _recipient);
    int96 _flowRate = int96(_reward);

    // Check if stream flow already exists
    if (timestamp != 0) {
      return host.callAgreement(cfa, abi.encodeWithSelector(cfa.createFlow.selector, acceptedToken, _recipient, _flowRate, new bytes(0) ), "0x");
    }
    else {
      return host.callAgreement(cfa, abi.encodeWithSelector(cfa.updateFlow.selector, acceptedToken, _recipient, _flowRate, new bytes(0)), "0x");
    }
  }
}