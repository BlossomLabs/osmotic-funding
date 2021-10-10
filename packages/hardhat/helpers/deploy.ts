import { defaultAbiCoder } from "@ethersproject/abi";
import { utils } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ISuperfluid, SuperfluidOwnableGovernance } from "../typechain";
import { impersonateAddress } from "./rpc";

export const getHost = async (
  hre: HardhatRuntimeEnvironment,
  hostAddress: string
): Promise<ISuperfluid> => {
  const { ethers } = hre;

  const hostSigner = await impersonateAddress(hostAddress);

  return (await ethers.getContractAt(
    "ISuperfluid",
    hostAddress,
    hostSigner
  )) as ISuperfluid;
};

export const getGovernance = async (
  hre: HardhatRuntimeEnvironment,
  hostAddress: string,
  govNewOwner?: string
): Promise<SuperfluidOwnableGovernance> => {
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
  await (await governance.transferOwnership(govNewOwner ?? deployer)).wait();

  return governance;
};

const createAppKey = (deployer: string, registrationKey: string): string => {
  return utils.keccak256(
    defaultAbiCoder.encode(
      ["string", "address", "string"],
      [
        "org.superfluid-finance.superfluid.appWhiteListing.registrationKey",
        deployer,
        registrationKey,
      ]
    )
  );
};

export const deployWithRegisteringKey = async (
  hre: HardhatRuntimeEnvironment,
  hostAddress: string
): Promise<void> => {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const governance = await getGovernance(hre, hostAddress);

  const registrationKey = "osmosis-funding";
  const appKey = createAppKey(deployer, registrationKey);

  await (await governance.whiteListNewApp(hostAddress, appKey)).wait();
};

export const registerAgreement = async (
  hre: HardhatRuntimeEnvironment,
  hostAddress: string,
  agreementClassAddress: string
): Promise<void> => {
  const governance = await getGovernance(hre, hostAddress);

  await (
    await governance.registerAgreementClass(hostAddress, agreementClassAddress)
  ).wait();
};
