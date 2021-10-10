import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";

export * from "./adaptiveFlowAgreement";

export const MINUTE = 60;
export const HOUR = MINUTE * 60;
export const DAY = HOUR * 24;
export const MONTH = DAY * 30;

export const getLatestTimestamp = async (
  signer: SignerWithAddress
): Promise<number> => {
  const block = await signer.provider.getBlock("latest");

  return block.timestamp;
};
