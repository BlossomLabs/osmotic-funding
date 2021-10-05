import { BigNumber } from "@ethersproject/bignumber";

export const toDecimals = (
  amount: number | string,
  decimals = 18
): BigNumber => {
  const [integer, decimal] = String(amount).split(".");
  return BigNumber.from(
    (integer != "0" ? integer : "") + (decimal || "").padEnd(decimals, "0")
  );
};
