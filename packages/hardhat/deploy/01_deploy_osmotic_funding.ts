import { DeployFunction } from "hardhat-deploy/types";
import { getConfigByNetworkId } from "../helpers/configuration";
import { impersonateAddress } from "../helpers/rpc";
import { toDecimals } from "../helpers/web3";
import { ISuperToken } from "../typechain";

// Initial funds stored in the osmotic funding app
const FUNDS_AMOUNT = 500000;

// Conviction voting parameters
const DECAY = 0.9999999e7;
const MAX_RATIO = 0.2e7;
const WEIGHT = 0.0025e7;

const deployFunc: DeployFunction = async ({
  deployments,
  getNamedAccounts,
  ethers,
  network,
}) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const {
    cfav1,
    host: hostAddress,
    requestSuperToken: requestSuperTokenAddress,
  } = getConfigByNetworkId(network.config.chainId);

  // Deploy stake token
  const { address: stakeTokenAddress } = await deploy("ERC20Mock", {
    from: deployer,
    args: ["Stake Token", "STK", deployer, String(100e18)],
    log: true,
  });

  // Deploy Osmotic Funding
  const { address: osmoticFundingAddress } = await deploy("OsmoticFunding", {
    from: deployer,
    args: [
      stakeTokenAddress,
      requestSuperTokenAddress,
      DECAY,
      MAX_RATIO,
      WEIGHT,
      hostAddress,
      cfav1,
    ],
    log: true,
  });

  // Mint some request tokens to have an initial funding pool
  const requestSuperTokenSigner = await impersonateAddress(
    requestSuperTokenAddress
  );
  const requestSuperToken = (await ethers.getContractAt(
    "ISuperToken",
    requestSuperTokenAddress,
    requestSuperTokenSigner
  )) as ISuperToken;

  await requestSuperToken.selfMint(
    osmoticFundingAddress,
    toDecimals(FUNDS_AMOUNT),
    "0x"
  );
};

deployFunc.tags = ["OsmoticFunding"];

export default deployFunc;
