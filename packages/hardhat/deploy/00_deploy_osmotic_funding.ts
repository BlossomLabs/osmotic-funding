import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { toDecimals } from "../helpers/web3";
import { impersonateAddress, setBalance } from "../helpers/rpc";
import { getConfigByNetworkId } from "../helpers/configuration";
import { createAppKey } from "../helpers/superfluid";
import {
  ISuperfluid,
  ISuperToken,
  SuperfluidOwnableGovernance,
} from "../typechain";

// Initial funds stored in the osmotic funding app
const FUNDS_AMOUNT = 500000;

// Conviction voting parameters
const DECAY = 0.9999999e7;
const MAX_RATIO = 0.2e7;
const WEIGHT = 0.0025e7;

const deployWithRegisteringKey = async (
  hostAddress: string,
  hre: HardhatRuntimeEnvironment
) => {
  const { ethers, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const host = (await ethers.getContractAt(
    "ISuperfluid",
    hostAddress
  )) as ISuperfluid;
  const governanceAddress = await host.getGovernance();
  let governance = (await ethers.getContractAt(
    "SuperfluidOwnableGovernance",
    governanceAddress
  )) as SuperfluidOwnableGovernance;
  const governanceOwnerAddress = await governance.owner();
  const ownerSigner = await impersonateAddress(governanceOwnerAddress);

  governance = governance.connect(ownerSigner);

  /**
   * Transfer ownership to deployer account to create a valid
   * registration key
   */
  await (await governance.transferOwnership(deployer)).wait();

  const registrationKey = "osmosis-funding";
  const appKey = createAppKey(deployer, registrationKey);

  await (await governance.whiteListNewApp(hostAddress, appKey)).wait();
};

const deployFunc: DeployFunction = async (hre) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const {
    cfav1,
    host: hostAddress,
    requestSuperToken: requestSuperTokenAddress,
  } = getConfigByNetworkId(network.config.chainId);

  console.log(hostAddress);
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
