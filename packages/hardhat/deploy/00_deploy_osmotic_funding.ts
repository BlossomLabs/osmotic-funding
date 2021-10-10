import { DeployFunction } from "hardhat-deploy/types";
// deploy/00_deploy_osmotic_funding.js

// const { ethers } = require("hardhat");
const DECAY = String(0.9999999e18);
const MAX_RATIO = String(Math.floor(0.02e18 / (30 * 24 * 60 * 60)));
const WEIGHT = String(0.025e18);

const deployFunc: DeployFunction = async (hre) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  // Deploy stake token
  const { address: stakeTokenAddress } = await deploy("StakeToken", {
    from: deployer,
    args: ["Test GTC", "GTC", deployer, String(100e18)],
    log: true,
    contract: "ERC20Mock",
  });
  // Deploy request token
  const { address: requestTokenAddress } = await deploy("RequestToken", {
    from: deployer,
    args: ["Test DAI", "DAI", deployer, String(100e18)],
    log: true,
    contract: "ERC20Mock",
  });
  await deploy("OsmoticFunding", {
    // Learn more about args here: https://www.npmjs.com/package/hardhat-deploy#deploymentsdeploy
    from: deployer,
    args: [stakeTokenAddress, requestTokenAddress, DECAY, MAX_RATIO, WEIGHT],
    log: true,
  });

  // Getting a previously deployed contract
  const osmoticFunding = await ethers.getContract("OsmoticFunding", deployer);
  const stakeToken = await ethers.getContract("StakeToken", deployer);
  const requestToken = await ethers.getContract("RequestToken", deployer);
  await requestToken.transfer(osmoticFunding.address, String(100e18));
  await osmoticFunding.addProposal(
    "https://gitcoin.co/grants/899",
    "0x5b0f8d8f47e3fdf7ee1c337abca19dbba98524e6"
  );
  await osmoticFunding.addProposal(
    "https://gitcoin.co/grants/2388",
    "0x0035cC37599241D007D0AbA1Fb931C5FA757f7A1"
  );
  await osmoticFunding.addProposal(
    "https://gitcoin.co/grants/795",
    "0x90dfc35e747ffcf9631ce75348f99632528e1704"
  );
  await osmoticFunding.addProposal(
    "https://gitcoin.co/grants/277",
    "0xa0527bA80D811cd45d452481Caf902DFd6F5b8c2"
  );
  await osmoticFunding.addProposal(
    "https://gitcoin.co/grants/539",
    "0x8110d1D04ac316fdCACe8f24fD60C86b810AB15A"
  );
  await osmoticFunding.addProposal(
    "https://gitcoin.co/grants/1141",
    "0x422ae3412510d6c877b259dad402ddeaf1fdb28e"
  );
  await osmoticFunding.addProposal(
    "https://gitcoin.co/grants/191",
    "0x4B8810b079eb22ecF2D1f75E08E0AbbD6fD87dbF"
  );
  await osmoticFunding.stakeOnProposal(0, String(1e18));

  // To take ownership of osmoticFunding using the ownable library uncomment next line and add the
  // address you want to be the owner.
  // osmoticFunding.transferOwnership(YOUR_ADDRESS_HERE);

  // const osmoticFunding = await ethers.getContractAt('OsmoticFunding', "0xaAC799eC2d00C013f1F11c37E654e59B0429DF6A") //<-- if you want to instantiate a version of a contract at a specific address!

  /*
  //If you want to send value to an address from the deployer
  const deployerWallet = ethers.provider.getSigner()
  await deployerWallet.sendTransaction({
    to: "0x34aA3F359A9D614239015126635CE7732c18fDF3",
    value: ethers.utils.parseEther("0.001")
  })
  */

  /*
  //If you want to send some ETH to a contract on deploy (make your constructor payable!)
  const osmoticFunding = await deploy("OsmoticFunding", [], {
  value: ethers.utils.parseEther("0.05")
  });
  */

  /*
  //If you want to link a library into your contract:
  // reference: https://github.com/austintgriffith/scaffold-eth/blob/using-libraries-example/packages/hardhat/scripts/deploy.js#L19
  const osmoticFunding = await deploy("OsmoticFunding", [], {}, {
   LibraryName: **LibraryAddress**
  });
  */
};
deployFunc.tags = ["OsmoticFunding"];

export default deployFunc;
