import { DeployFunction } from "hardhat-deploy/dist/types";
import { getConfigByNetworkId } from "../helpers/configuration";
import { getHost, registerAgreement } from "../helpers/deploy";
import { AdaptiveFlowAgreementV1 } from "../typechain";

const deployFunc: DeployFunction = async (hre) => {
  const { ethers, deployments, getNamedAccounts, network, tenderly } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { requestSuperToken: requestSuperTokenAddress, host: hostAddress } =
    getConfigByNetworkId(network.config.chainId);

  const afaDeployment = await deploy("AdaptiveFlowAgreementV1", {
    from: deployer,
    args: [],
    log: true,
  });

  const afa = (await ethers.getContractAt(
    "AdaptiveFlowAgreementV1",
    afaDeployment.address
  )) as AdaptiveFlowAgreementV1;

  // Register agreement if necessary
  const host = await getHost(hre, hostAddress);
  const agreementType = await afa.agreementType();

  const isListed = await host.isAgreementTypeListed(agreementType);

  if (!isListed) {
    await registerAgreement(hre, hostAddress, afaDeployment.address);
  }

  // Fetch agreement class as a new agreement proxy might have been created
  const agreementClass = await host.getAgreementClass(agreementType);

  const fluidFundingDeployment = await deploy("FluidFunding", {
    from: deployer,
    args: [hostAddress, agreementClass, requestSuperTokenAddress],
    log: true,
  });

  if (process.env.VERIFY) {
    await tenderly.persistArtifacts([
      {
        address: fluidFundingDeployment.address,
        name: "FluidFunding",
      },
      { address: agreementClass, name: "AdaptiveFlowAgreementV1" },
    ]);

    await tenderly.verify([
      { address: agreementClass, name: "AdaptiveFlowAgreementV1" },
    ]);
  }
};

deployFunc.tags = ["FluidFunding"];

export default deployFunc;
