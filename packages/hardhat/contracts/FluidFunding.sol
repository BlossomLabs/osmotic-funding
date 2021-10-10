// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import { ISuperfluidToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluidToken.sol";
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

  function createFlow(
    ISuperfluidToken token,
    address receiver,
    int96 targetRate,
    int128 adaptivePeriod
  )
    external
    returns (bytes memory newCtx)
  {
    return host.callAgreement(
      afa,
      abi.encodeWithSelector(
        afa.createFlow.selector,
        token,
        receiver,
        targetRate,
        adaptivePeriod,
        new bytes(0)
      ),
      "0x"
    );
  }

    function updateFlow(
    ISuperfluidToken token,
    address receiver,
    int96 targetRate
  )
    external
    returns (bytes memory newCtx)
  {
    return host.callAgreement(
      afa,
      abi.encodeWithSelector(
        afa.updateFlow.selector,
        token,
        receiver,
        targetRate,
        new bytes(0)
      ),
      "0x"
    );
  }

  function deleteFlow(
    ISuperfluidToken token,
    address sender,
    address receiver
  )
    external
    returns (bytes memory newCtx)
  {
    return host.callAgreement(
      afa,
      abi.encodeWithSelector(
        afa.deleteFlow.selector,
        token,
        sender,
        receiver,
        new bytes(0)
      ),
      "0x"
    );
  }

    function getFlow(
    ISuperfluidToken token,
    address sender,
    address receiver
  )
    external
    view
    returns (
      uint256 timestamp,
      int96 lastRate,
      int96 targetRate,
      int128 adaptivePeriod,
      int96 flowRate
    )
  {
    return afa.getFlow(token, sender, receiver);
  }


  function getFundingFlowRate(
    ISuperfluidToken requestToken,
    address beneficiary,
    uint256 time
  )
    external
    view
    virtual
    returns (int96 currentRate)
  {
    return afa.realtimeRate(requestToken, address(this), beneficiary, time);
  }

  function getBeneficiaryBalance(
    ISuperfluidToken requestToken,
    address beneficiary,
    uint256 time
  )
    external
    view
    returns (
      int256 totalDynamicBalance,
      uint256 deposit,
      uint256 owedDeposit
    )
  {
    return afa.realtimeBalanceOf(requestToken, beneficiary, time);
  }
}
