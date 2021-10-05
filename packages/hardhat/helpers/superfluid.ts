import { defaultAbiCoder } from "@ethersproject/abi";
import { utils } from "ethers";

export const createAppKey = (
  deployer: string,
  registrationKey: string
): string => {
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
