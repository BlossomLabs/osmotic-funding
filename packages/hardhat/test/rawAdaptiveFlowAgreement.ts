import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, network } from "hardhat";
import { getConfigByNetworkId } from "../helpers/configuration";
import { impersonateAddress } from "../helpers/rpc";
import { fromDecimals, toDecimals } from "../helpers/web3";
import { AdaptiveFlowAgreementV1, ISuperToken } from "../typechain";
import {
  BNtoNumber,
  calculateRealtimeRate,
  calculateSuperTokenBalance,
  DAY,
  getLatestTimestamp,
  MONTH,
} from "./helpers/";
import { AdaptiveFlowAgreementV1Fixture, FlowData } from "./types";

use(solidity);

const DELTA = 1e-8;

xdescribe("RawAdaptiveFlowAgreementV1", async () => {
  let fixture: AdaptiveFlowAgreementV1Fixture;

  const setupTests = deployments.createFixture(
    async ({ ethers, deployments }) => {
      await deployments.fixture("AdaptiveFlowAgreementV1");
      const { tester0, tester1, sender0, sender1, receiver0, receiver1 } =
        await ethers.getNamedSigners();
      const { requestSuperToken: superTokenAddress } = getConfigByNetworkId(
        network.config.chainId
      );
      const { AdaptiveFlowAgreementV1: afaDeployment } =
        await deployments.all();
      // const superAppDeployment = await deployments.get("SuperAppMock");

      const superTokenSigner = await impersonateAddress(superTokenAddress);

      const superToken = (await ethers.getContractAt(
        "ISuperToken",
        superTokenAddress,
        superTokenSigner
      )) as ISuperToken;

      await superToken.selfMint(tester0.address, toDecimals("10000"), "0x");
      await superToken.selfMint(sender0.address, toDecimals("10000"), "0x");
      await superToken.selfMint(sender1.address, toDecimals("10000"), "0x");
      await superToken.selfMint(receiver0.address, toDecimals("10000"), "0x");
      await superToken.selfMint(receiver1.address, toDecimals("10000"), "0x");

      return {
        afa: (await ethers.getContractAt(
          "AdaptiveFlowAgreementV1",
          afaDeployment.address,
          tester0
        )) as AdaptiveFlowAgreementV1,
        // superApp: (await ethers.getContractAt(
        //   "SuperAppMock",
        //   superAppDeployment.address,
        //   tester0
        // )) as SuperAppMock,
        superToken,
        sender0,
        sender1,
        receiver0,
        receiver1,
        tester0,
        tester1,
      };
    }
  );

  const createFlow = async ({
    token,
    sender,
    receiver,
    lastRate,
    targetRate,
    adaptivePeriod,
  }: {
    token?: string;
    sender?: SignerWithAddress;
    receiver?: SignerWithAddress;
    lastRate?: BigNumber;
    targetRate?: BigNumber;
    adaptivePeriod?: BigNumber;
  } = {}): Promise<FlowData> => {
    const { afa, superToken, tester0, tester1 } = fixture;
    // Create flow
    const flow = {
      token: token || superToken.address,
      sender: sender?.address || tester0.address,
      receiver: receiver?.address || tester1.address,
      lastRate: lastRate || BigNumber.from(0),
      targetRate: targetRate || toDecimals(5000 / MONTH),
      contractAdaptivePeriod: await afa.AP_1_MONTH(),
      adaptivePeriod: adaptivePeriod || toDecimals("0.9999973349745084"),
    };

    fixture.afa = afa.connect(sender || tester0);
    await fixture.afa.createFlow(
      flow.token,
      flow.receiver,
      flow.targetRate,
      flow.contractAdaptivePeriod,
      "0x"
    );

    return flow;
  };

  beforeEach(async () => {
    fixture = await setupTests();
  });

  it("should create a flow", async () => {
    const zeroBN = BigNumber.from(0);

    const flow = await createFlow();

    const fetchedFlow = await fixture.afa.getFlow(
      flow.token,
      flow.sender,
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

  it("should get the real time rate", async () => {
    const { afa, tester0 } = fixture;

    const flow = await createFlow();

    const deltaTime = DAY * 3;
    const time = (await getLatestTimestamp(tester0)) + deltaTime;

    const expectedRealtimeRate = calculateRealtimeRate(flow, deltaTime);
    const currentRate = await afa.realtimeRate(
      flow.token,
      flow.sender,
      flow.receiver,
      time
    );

    expect(BNtoNumber(currentRate)).to.be.closeTo(expectedRealtimeRate, DELTA);
  });

  it("should get the real time balance", async () => {
    const { afa, tester0 } = fixture;
    const flow = await createFlow();

    const deltaTime = DAY * 1;
    const time = (await getLatestTimestamp(tester0)) + deltaTime;

    const [currentBalance] = await afa.realtimeBalanceOf(
      flow.token,
      flow.receiver,
      time
    );
    const expectedCurrentBalance = calculateSuperTokenBalance(flow, deltaTime);

    expect(Number(fromDecimals(currentBalance))).to.be.closeTo(
      expectedCurrentBalance,
      DELTA
    );
  });

  it("should get the real time balance when having multiple flows", async () => {
    const { afa, tester0, sender0, sender1, receiver0, receiver1 } = fixture;
    const deltaTime = 4 * DAY;
    const time = (await getLatestTimestamp(tester0)) + deltaTime;
    const multipleFlowsAccount = receiver0;
    const flow0 = await createFlow({
      sender: sender0,
      receiver: multipleFlowsAccount,
      targetRate: toDecimals(1500 / MONTH),
    });
    const flow1 = await createFlow({
      sender: sender1,
      receiver: multipleFlowsAccount,
      targetRate: toDecimals(1000 / MONTH),
    });
    const flow2 = await createFlow({
      sender: multipleFlowsAccount,
      receiver: receiver1,
      targetRate: toDecimals(500 / MONTH),
    });

    const [realtimeBalanceOf] = await afa.realtimeBalanceOf(
      flow0.token,
      receiver0.address,
      time
    );

    const expectedRealtimeBalance = [flow0, flow1, flow2].reduce(
      (accumulatedBalance, flow) => {
        const isInflow = multipleFlowsAccount.address === flow.receiver;
        const balance =
          calculateSuperTokenBalance(flow, deltaTime) * (isInflow ? 1 : -1);
        return accumulatedBalance + balance;
      },
      0
    );

    expect(realtimeBalanceOf).to.be.closeTo(expectedRealtimeBalance, DELTA);
  });

  it("should update the flow", async () => {
    const { afa } = fixture;
    const flow = await createFlow();
    const { token, sender, receiver } = flow;
    const newTargetRate = toDecimals(7500 / MONTH);

    const oldFlow = await afa.getFlow(token, sender, receiver);

    await afa.updateFlow(flow.token, flow.receiver, newTargetRate, "0x");

    const newFlow = await afa.getFlow(token, sender, receiver);

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
    const { afa } = fixture;
    const flow = await createFlow();
    const { token, sender, receiver } = flow;

    await afa.deleteFlow(token, sender, receiver, "0x");

    const fetchedFlow = await afa.getFlow(token, sender, receiver);

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
