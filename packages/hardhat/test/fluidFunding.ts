import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, network } from "hardhat";
import { getConfigByNetworkId } from "../helpers/configuration";
import { impersonateAddress } from "../helpers/rpc";
import { fromDecimals, toDecimals } from "../helpers/web3";
import {
  AdaptiveFlowAgreementV1,
  FluidFunding,
  ISuperToken,
} from "../typechain";
import {
  BNtoNumber,
  calculateRealtimeRate,
  calculateSuperTokenBalance,
  DAY,
  getLatestTimestamp,
  MONTH,
} from "./helpers/";
import { FlowData, FluidFundingFixture } from "./types";

use(solidity);

const DELTA = 1e-7;

describe("FluidFunding", async () => {
  let fixture: FluidFundingFixture;

  const setupTests = deployments.createFixture(
    async ({ ethers, deployments }) => {
      await deployments.fixture("FluidFunding");
      const { tester0, tester1, receiver0, receiver1 } =
        await ethers.getNamedSigners();
      const { requestSuperToken: superTokenAddress } = getConfigByNetworkId(
        network.config.chainId
      );

      const {
        FluidFunding: fluidFundingDeployment,
        AdaptiveFlowAgreementV1: afaDeployment,
      } = await deployments.all();

      // Mint request tokens for the funding pool
      const superTokenSigner = await impersonateAddress(superTokenAddress);
      const superToken = (await ethers.getContractAt(
        "ISuperToken",
        superTokenAddress,
        superTokenSigner
      )) as ISuperToken;
      await superToken.selfMint(
        fluidFundingDeployment.address,
        toDecimals(100_000),
        "0x"
      );

      return {
        afa: (await ethers.getContractAt(
          "AdaptiveFlowAgreementV1",
          afaDeployment.address,
          tester0
        )) as AdaptiveFlowAgreementV1,
        fluidFunding: (await ethers.getContractAt(
          "FluidFunding",
          fluidFundingDeployment.address,
          tester0
        )) as FluidFunding,
        superToken,
        beneficiary0: receiver0,
        beneficiary1: receiver1,
        tester0,
        tester1,
      };
    }
  );

  const createFlow = async ({
    token,
    receiver,
    lastRate,
    targetRate,
    adaptivePeriod,
  }: {
    token?: string;
    receiver?: SignerWithAddress;
    lastRate?: BigNumber;
    targetRate?: BigNumber;
    adaptivePeriod?: BigNumber;
  } = {}): Promise<FlowData> => {
    const { afa, fluidFunding, superToken, tester1 } = fixture;
    // Create flow
    const flow = {
      token: token || superToken.address,
      sender: fluidFunding.address,
      receiver: receiver?.address || tester1.address,
      lastRate: lastRate || BigNumber.from(0),
      targetRate: targetRate || toDecimals(5000 / MONTH),
      contractAdaptivePeriod: await afa.AP_1_MONTH(),
      adaptivePeriod: adaptivePeriod || toDecimals("0.9999973349745084"),
    };

    await fluidFunding.createFlow(
      flow.token,
      flow.receiver,
      flow.targetRate,
      flow.contractAdaptivePeriod
    );

    return flow;
  };

  beforeEach(async () => {
    fixture = await setupTests();
  });

  it("should create a flow", async () => {
    const { fluidFunding } = fixture;
    const zeroBN = BigNumber.from(0);

    const flow = await createFlow();

    const fetchedFlow = await fluidFunding.getFlow(
      flow.token,
      fluidFunding.address,
      flow.receiver
    );

    expect([
      fetchedFlow.lastRate,
      fetchedFlow.targetRate,
      fetchedFlow.adaptivePeriod,
      fetchedFlow.flowRate,
    ]).to.be.eql([
      zeroBN, // last rate
      flow.targetRate,
      flow.contractAdaptivePeriod,
      zeroBN, // current flow rate
    ]);
  });

  it("should get the funding flow rate", async () => {
    const { fluidFunding, tester0 } = fixture;

    const flow = await createFlow();

    const deltaTime = DAY * 3;
    const time = (await getLatestTimestamp(tester0)) + deltaTime;

    const expectedRealtimeRate = calculateRealtimeRate(flow, deltaTime);
    const currentRate = await fluidFunding.getFundingFlowRate(
      flow.token,
      flow.receiver,
      time
    );

    expect(BNtoNumber(currentRate)).to.be.closeTo(expectedRealtimeRate, DELTA);
  });

  it("should get the real time balance", async () => {
    const { fluidFunding, superToken } = fixture;

    const flow = await createFlow();

    const createdFlow = await fluidFunding.getFlow(
      superToken.address,
      fluidFunding.address,
      flow.receiver
    );
    const flowTimestamp = createdFlow.timestamp.toNumber();

    const deltaTime = DAY * 4;
    const time = flowTimestamp + deltaTime;

    const [dynamicBalance] = await fluidFunding.getBeneficiaryBalance(
      flow.token,
      flow.receiver,
      time
    );
    const expectedDynamicBalance = calculateSuperTokenBalance(flow, deltaTime);

    expect(Number(fromDecimals(dynamicBalance))).to.be.closeTo(
      expectedDynamicBalance,
      DELTA
    );
  });

  it("should update the flow", async () => {
    const { fluidFunding } = fixture;
    const flow = await createFlow();
    const { token, sender, receiver } = flow;
    const newTargetRate = toDecimals(7500 / MONTH);

    const oldFlow = await fluidFunding.getFlow(token, sender, receiver);

    await fluidFunding.updateFlow(flow.token, flow.receiver, newTargetRate);

    const newFlow = await fluidFunding.getFlow(token, sender, receiver);

    const expectedLastRate = calculateRealtimeRate(
      flow,
      newFlow.timestamp.sub(oldFlow.timestamp).toNumber()
    );

    expect(BNtoNumber(newFlow.lastRate)).to.be.closeTo(expectedLastRate, DELTA);
    expect(BNtoNumber(newFlow.targetRate)).to.be.closeTo(
      BNtoNumber(newTargetRate),
      DELTA
    );
    expect(newFlow.adaptivePeriod).to.be.eq(oldFlow.adaptivePeriod);
  });

  it("should delete the flow", async () => {
    const { fluidFunding } = fixture;
    const flow = await createFlow();
    const { token, sender, receiver } = flow;

    await fluidFunding.deleteFlow(token, sender, receiver);

    const fetchedFlow = await fluidFunding.getFlow(token, sender, receiver);

    const zeroBN = BigNumber.from(0);

    expect([
      fetchedFlow.timestamp,
      fetchedFlow.lastRate,
      fetchedFlow.targetRate,
      fetchedFlow.adaptivePeriod,
      fetchedFlow.flowRate,
    ]).to.be.eql(Array(5).fill(zeroBN));
  });
});
