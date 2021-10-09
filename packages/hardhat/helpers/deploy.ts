import { defaultAbiCoder } from "@ethersproject/abi";
import { utils } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ISuperfluid, SuperfluidOwnableGovernance } from "../typechain";
import { impersonateAddress } from "./rpc";

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
  hostAddress: string,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
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
