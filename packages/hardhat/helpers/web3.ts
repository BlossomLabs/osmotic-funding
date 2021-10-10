import { BigNumber } from "@ethersproject/bignumber";

/**
 * Taken from decentral-ee web3-helpers repo
 * (https://github.com/decentral-ee/web3-helpers/blob/master/src/math-utils.js)
 */

function splitDecimalNumber(num: any): Array<string> {
  let sign = "";
  if (typeof num == "number") {
    // to avoid scientific notion (e-) of Number.toString()
    // > 0.00000001.toString()
    // '1e-8'
    num = num.toFixed(50);
  }
  if (num.startsWith("-")) {
    sign = "-";
    num = num.slice(1);
  }
  const [whole = "", dec = ""] = num.toString().split(".");
  return [
    sign,
    whole.replace(/^0*/, ""), // trim leading zeroes
    dec.replace(/0*$/, ""), // trim trailing zeroes
  ];
}

export const toDecimals = (
  num: string | number | BigNumber,
  decimals = 18,
  { truncate = true } = {}
): BigNumber => {
  const parsedNum = String(num);
  const [sign, whole, dec] = splitDecimalNumber(parsedNum);
  if (!whole && !dec) {
    return BigNumber.from("0");
  }

  const wholeLengthWithBase = whole.length + decimals;
  const withoutDecimals = (whole + dec).padEnd(wholeLengthWithBase, "0");
  const wholeWithBase = withoutDecimals.slice(0, wholeLengthWithBase);

  if (!truncate && wholeWithBase.length < withoutDecimals.length) {
    return BigNumber.from(
      `${sign}${wholeWithBase}.${withoutDecimals.slice(wholeLengthWithBase)}`
    );
  } else {
    return BigNumber.from((sign + wholeWithBase).replace(/^0*/, ""));
  }
};

export const fromDecimals = (
  num: string | number | BigNumber,
  decimals = 18,
  { truncate = true } = {}
): string => {
  const parsedNum = String(num);
  const [sign, whole, dec] = splitDecimalNumber(parsedNum);
  if (!whole && !dec) {
    return "0";
  }

  const paddedWhole = whole.padStart(decimals + 1, "0");
  const decimalIndex = paddedWhole.length - decimals;
  const wholeWithoutBase = paddedWhole.slice(0, decimalIndex);
  const decWithoutBase = paddedWhole.slice(decimalIndex);

  if (!truncate && dec) {
    // We need to keep all the zeroes in this case
    return `${sign}${wholeWithoutBase}.${decWithoutBase}${dec}`;
  }

  // Trim any trailing zeroes from the new decimals
  const decWithoutBaseTrimmed = decWithoutBase.replace(/0*$/, "");
  if (decWithoutBaseTrimmed) {
    return `${sign}${wholeWithoutBase}.${decWithoutBaseTrimmed}`;
  } else {
    return sign + wholeWithoutBase;
  }
};
