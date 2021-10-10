import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import {
  AdaptiveFlowAgreementV1,
  FluidFunding,
  ISuperToken,
} from "../typechain";

interface TestBase {
  superToken: ISuperToken;
  tester0: SignerWithAddress;
  tester1: SignerWithAddress;
}
export interface Fixture {
  afa: AdaptiveFlowAgreementV1;
}

export interface AdaptiveFlowAgreementV1Fixture extends TestBase {
  afa: AdaptiveFlowAgreementV1;
  receiver0: SignerWithAddress;
  receiver1: SignerWithAddress;
  sender0: SignerWithAddress;
  sender1: SignerWithAddress;
}

export interface FluidFundingFixture extends TestBase {
  afa: AdaptiveFlowAgreementV1;
  fluidFunding: FluidFunding;
  beneficiary0: SignerWithAddress;
  beneficiary1: SignerWithAddress;
}

export interface FlowData {
  token: string;
  sender: string;
  receiver: string;
  lastRate: BigNumber;
  targetRate: BigNumber;
  adaptivePeriod: BigNumber;
  contractAdaptivePeriod: BigNumber;
}
