import { utils } from "ethers";

export function format(bn) {
  return Number.parseFloat(utils.formatUnits(bn || 0, 18)).toFixed(2);
}
