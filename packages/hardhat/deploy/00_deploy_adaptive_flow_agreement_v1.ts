import {} from "hardhat";
import { DeployFunction } from "hardhat-deploy/dist/types";

const deployFunc: DeployFunction = async ({
  deployments,
  getNamedAccounts,
}) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("AdaptiveFlowAgreementV1", {
    from: deployer,
    args: [],
    log: true,
  });
};

deployFunc.tags = ["AdaptiveFlowAgreementV1"];

export default deployFunc;
