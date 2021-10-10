import { BigNumber } from "@ethersproject/bignumber";
import { fromDecimals } from "../../helpers/web3";
import { FlowData } from "../types";

export const calculateRealtimeRate = (flow: FlowData, time: number): number => {
  const { adaptivePeriod, lastRate, targetRate } = flow;
  const at = Math.pow(BNtoNumber(adaptivePeriod), time);

  return at * BNtoNumber(lastRate) + BNtoNumber(targetRate) * (1 - at);
};

export const calculateSuperTokenBalance = (
  flow: FlowData,
  time: number
): number => {
  const { adaptivePeriod, lastRate, targetRate } = flow;
  const oneSubAt = 1 - Math.pow(BNtoNumber(adaptivePeriod), time);
  const lna = Math.log(1 / BNtoNumber(adaptivePeriod));

  return (
    (1 / lna) *
    ((oneSubAt + time * lna) * BNtoNumber(targetRate) +
      oneSubAt * BNtoNumber(lastRate))
  );
};

export const BNtoNumber = (bn: BigNumber): number => Number(fromDecimals(bn));
