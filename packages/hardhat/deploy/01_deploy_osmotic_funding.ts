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
  const { deploy, execute } = deployments;
  const { deployer } = await getNamedAccounts();
  const {
    cfav1,
    host: hostAddress,
    requestSuperToken: requestSuperTokenAddress,
  } = getConfigByNetworkId(network.config.chainId);

  // Deploy stake token
  const { address: stakeTokenAddress } = await deploy("StakeToken", {
    from: deployer,
    args: ["Test GTC", "GTC", deployer, String(100e18 + "0000")],
    log: true,
    contract: "ERC20Mock",
  });
  // Deploy request token
  const { address: requestTokenAddress } = await deploy("RequestToken", {
    from: deployer,
    args: ["Test DAI", "DAI", deployer, String(100e18 + "000000")],
    log: true,
    contract: "ERC20Mock",
  });
  const { address: osmoticFundingAddress } = await deploy("OsmoticFunding", {
    // Learn more about args here: https://www.npmjs.com/package/hardhat-deploy#deploymentsdeploy
    from: deployer,
    args: [
      stakeTokenAddress,
      requestTokenAddress,
      DECAY,
      MAX_RATIO,
      WEIGHT,
      hostAddress,
      cfav1,
    ],
    log: true,
  });

  // Fill the faucet
  await execute(
    "StakeToken",
    { from: deployer, log: true },
    "transfer",
    osmoticFundingAddress,
    String(100e18) + "00"
  );

  // Transfer request tokens
  await execute(
    "RequestToken",
    { from: deployer, log: true },
    "transfer",
    osmoticFundingAddress,
    String(100e18) + "000"
  );

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

  // Add test proposals
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "addProposal",
    "https://gitcoin.co/grants/899",
    "0x5b0f8d8f47e3fdf7ee1c337abca19dbba98524e6"
  );
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "addProposal",
    "https://gitcoin.co/grants/2388",
    "0x0035cC37599241D007D0AbA1Fb931C5FA757f7A1"
  );
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "addProposal",
    "https://gitcoin.co/grants/795",
    "0x90dfc35e747ffcf9631ce75348f99632528e1704"
  );
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "addProposal",
    "https://gitcoin.co/grants/277",
    "0xa0527bA80D811cd45d452481Caf902DFd6F5b8c2"
  );
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "addProposal",
    "https://gitcoin.co/grants/539",
    "0x8110d1D04ac316fdCACe8f24fD60C86b810AB15A"
  );
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "addProposal",
    "https://gitcoin.co/grants/1141",
    "0x422ae3412510d6c877b259dad402ddeaf1fdb28e"
  );
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "addProposal",
    "https://gitcoin.co/grants/191",
    "0x4B8810b079eb22ecF2D1f75E08E0AbbD6fD87dbF"
  );

  // Stake to proposal
  await execute(
    "StakeToken",
    { from: deployer, log: true },
    "approve",
    osmoticFundingAddress,
    String(100e18)
  );
  await execute(
    "OsmoticFunding",
    { from: deployer, log: true },
    "setStake",
    0,
    String(1e18)
  );
};

deployFunc.tags = ["OsmoticFunding"];

export default deployFunc;
