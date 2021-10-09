import { use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, getNamedAccounts, network } from "hardhat";
import { getConfigByNetworkId } from "../helpers/configuration";
import { impersonateAddress } from "../helpers/rpc";
import { toDecimals } from "../helpers/web3";
import { AdaptiveFlowAgreementV1, ISuperToken } from "../typechain";

use(solidity);

const MONTH_IN_SECONDS = 60 * 60 * 24 * 30;

const buildFlowRate = (tokensPerMonth: number) => {
  return toDecimals(tokensPerMonth / MONTH_IN_SECONDS);
};

describe("AdaptiveFlowAgreementV1", async () => {
  let afa: AdaptiveFlowAgreementV1;
  let requestSuperToken: ISuperToken;

  const setupTests = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture("AdaptiveFlowAgreementV1");
      const { requestSuperToken: requestSuperTokenAddress } =
        getConfigByNetworkId(network.config.chainId);
      const signer = await ethers.getNamedSigner("deployer");

      const afa = await deployments.get("AdaptiveFlowAgreementV1");

      const requestSuperTokenSigner = await impersonateAddress(
        requestSuperTokenAddress
      );
      const requestSuperToken = (await ethers.getContractAt(
        "ISuperToken",
        requestSuperTokenAddress,
        requestSuperTokenSigner
      )) as ISuperToken;

      return {
        afa: (await ethers.getContractAt(
          "AdaptiveFlowAgreementV1",
          afa.address,
          signer
        )) as AdaptiveFlowAgreementV1,
        requestSuperToken,
      };
    }
  );
  beforeEach(async () => {
    ({ afa, requestSuperToken } = await setupTests());
  });

  it("should create a flow", async () => {
    const { tester } = await getNamedAccounts();
    const targetRate = String(5000e18);

    await afa.createFlow(
      requestSuperToken.address,
      tester,
      targetRate,
      await afa.AP_1_MONTH(),
      "0x"
    );

    const flow = await afa.getFlow(
      requestSuperToken.address,
      tester,
      targetRate
    );
  });
});
