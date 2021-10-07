import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { impersonateAddress } from "../helpers/rpc";
import { ERC20Mock, ISuperToken, OsmoticFunding } from "../typechain";

use(solidity);

describe("My Dapp", async function () {
  let osmoticFunding: OsmoticFunding;
  let stakeToken: ERC20Mock;
  let requestToken: ISuperToken;
  let owner: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  const proposal = {
    title: "Super Proposal",
    link: ethers.utils.toUtf8Bytes("https://ipfs.io/ipfs/Qm"),
    requestedAmount: String(2e18),
  };

  const setUpTests = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture();

      const {
        ERC20Mock: ERC20MockDeployment,
        OsmoticFunding: OsmoticFundingDeployment,
      } = await deployments.all();

      const requestTokenAddress = await deployments.read(
        "OsmoticFunding",
        "requestToken"
      );
      const requestTokenSigner = await impersonateAddress(requestTokenAddress);

      return {
        stakeToken: (await ethers.getContractAt(
          "ERC20Mock",
          ERC20MockDeployment.address,
          owner
        )) as ERC20Mock,
        osmoticFunding: (await ethers.getContractAt(
          "OsmoticFunding",
          OsmoticFundingDeployment.address,
          owner
        )) as OsmoticFunding,
        requestToken: (await ethers.getContractAt(
          "ISuperToken",
          requestTokenAddress,
          requestTokenSigner
        )) as ISuperToken,
      };
    }
  );

  const createProposal = async (proposal) => {
    const { title, link, requestedAmount } = proposal;
    await osmoticFunding.addProposal(
      title,
      link,
      requestedAmount,
      beneficiary.address
    );
  };

  const stakeOnProposal = async (proposalId) => {
    await stakeToken.approve(osmoticFunding.address, String(1e18));
    await osmoticFunding.stakeToProposal(proposalId, String(1e18));
  };

  before(async () => {
    [owner, beneficiary] = await ethers.getSigners();
  });

  beforeEach(async () => {
    ({ osmoticFunding, stakeToken, requestToken } = await setUpTests());
  });

  describe("OsmoticFunding", function () {
    it("Should deploy OsmoticFunding", async function () {
      const { tester } = await getNamedAccounts();
      const mintedTokens = String(100e18);

      await requestToken.selfMint(tester, mintedTokens, "0x");
      await requestToken.selfMint(osmoticFunding.address, mintedTokens, "0x");

      expect(await requestToken.balanceOf(tester)).to.be.equal(mintedTokens);
    });

    describe("setConvictionSettings()", function () {
      it("Should be able to set new settings", async function () {
        const newDecay = String(0.99999e18);
        const newMaxRatio = String(0.1e18);
        const newMinStakeRatio = String(0.002e18);

        await osmoticFunding.setConvictionSettings(
          newDecay,
          newMaxRatio,
          newMinStakeRatio
        );
        expect(
          (await osmoticFunding.getConvictionSettings()).map((bn) =>
            bn.toString()
          )
        ).to.deep.equal([newDecay, newMaxRatio, newMinStakeRatio]);
      });
    });

    describe("addProposal()", function () {
      it("Should create a new proposal", async function () {
        const { requestedAmount } = proposal;
        await createProposal(proposal);
        const [
          _requestedAmount,
          _beneficiary,
          stakedTokens,
          convictionLast,
          timeLast,
          active,
          submitter,
        ] = await osmoticFunding.getProposal(0);
        expect(_requestedAmount).to.be.equal(requestedAmount);
        expect(_beneficiary).to.be.equal(beneficiary.address);
        expect(stakedTokens).to.be.equal(0);
        expect(convictionLast).to.be.equal(0);
        expect(timeLast).to.be.equal(0);
        expect(active).to.be.true;
        expect(submitter).to.be.equal(owner.address);
      });
    });

    describe("stakeToProposal()", function () {
      it("Should stake on proposal", async function () {
        const ownerBalance = await stakeToken.balanceOf(owner.address);

        await createProposal(proposal);
        await stakeOnProposal(0);

        const [, , stakedTokens] = await osmoticFunding.getProposal(0);
        const ownerStake = await osmoticFunding.getProposalVoterStake(
          0,
          owner.address
        );
        const totalOwnerStake = await osmoticFunding.getTotalVoterStake(
          owner.address
        );

        expect(await stakeToken.balanceOf(owner.address)).to.be.equal(
          ownerBalance.sub(String(1e18))
        );
        expect(stakedTokens).to.be.equal(String(1e18));
        expect(ownerStake).to.be.equal(String(1e18));
        expect(totalOwnerStake).to.be.equal(String(1e18));
      });
    });

    describe("calculateConviction()", function () {
      it("Should calculate conviction growth correctly after 1 day", async function () {
        const a =
          parseFloat(
            (await osmoticFunding.getConvictionSettings())[0].toString()
          ) / 1e18;
        const timePassed = 24 * 60 * 60; // 1 day
        const lastConv = 0; // conviction starts from scratch
        const amount = 1e18; // staking 1 token
        const conviction = await osmoticFunding.calculateConviction(
          timePassed,
          String(lastConv),
          String(amount)
        );
        const expectedConviction =
          lastConv * a ** timePassed +
          (amount * (1 - a ** timePassed)) / (1 - a) ** 2;
        expect(
          parseFloat(ethers.utils.formatUnits(conviction, 18))
        ).to.be.closeTo(expectedConviction / 1e18, 1.5);
      });

      it("Should calculate conviction growth correctly after 2 days from previous conviction", async function () {
        const a =
          parseFloat(
            (await osmoticFunding.getConvictionSettings())[0].toString()
          ) / 1e18;
        const timePassed = 24 * 60 * 60; // 1 day
        const lastConv = await osmoticFunding.calculateConviction(
          timePassed,
          0,
          String(1e18)
        );
        const amount = 1e18; // staking 1 token
        const conviction = await osmoticFunding.calculateConviction(
          timePassed,
          String(lastConv),
          String(amount)
        );
        const expectedConviction =
          (lastConv as any) * a ** timePassed +
          (amount * (1 - a ** timePassed)) / (1 - a) ** 2;
        const expectedConviction2 =
          (amount * (1 - a ** (timePassed * 2))) / (1 - a) ** 2;
        expect(expectedConviction / expectedConviction2).to.be.closeTo(
          1,
          1e-10
        );
        expect(
          parseFloat(ethers.utils.formatUnits(conviction, 18))
        ).to.be.closeTo(expectedConviction / 1e18, 1.5);
      });

      it("Should calculate conviction decay correctly after 1 day", async function () {
        const a =
          parseFloat(
            (await osmoticFunding.getConvictionSettings())[0].toString()
          ) / 1e18;
        const timePassed = 24 * 60 * 60; // 1 day
        const lastConv = await osmoticFunding.calculateConviction(
          timePassed,
          0,
          String(1e18)
        ); // 1 day accrued conviction
        const amount = 0; // staking 0 tokens
        const conviction = await osmoticFunding.calculateConviction(
          timePassed,
          String(lastConv),
          String(amount)
        );
        const expectedConviction =
          (lastConv as any) * a ** timePassed +
          (amount * (1 - a ** timePassed)) / (1 - a) ** 2;
        expect(
          parseFloat(ethers.utils.formatUnits(conviction, 18))
        ).to.be.closeTo(expectedConviction / 1e18, 1.5);
      });
    });

    describe("calculateTargetRatio()", function () {
      beforeEach(async () => {
        await createProposal(proposal);
        await stakeOnProposal(0);
      });

      it("Should calculate properly the target rate based on the staked tokens", async function () {
        const b =
          parseFloat(
            (await osmoticFunding.getConvictionSettings())[1].toString()
          ) / 1e18;
        const m =
          parseFloat(
            (await osmoticFunding.getConvictionSettings())[2].toString()
          ) / 1e18;
        const totalStaked =
          parseFloat((await osmoticFunding.totalStaked()).toString()) / 1e18;
        const staked = 1e18;
        const funds = 100;
        const targetRate = await osmoticFunding.calculateTargetRate(
          String(staked)
        );
        const expectedTargetRate =
          funds * b * (1 - Math.sqrt((m * totalStaked) / (staked / 1e18)));
        expect(parseFloat(targetRate.toString()) / 1e18).to.be.closeTo(
          expectedTargetRate,
          1e-4
        );
      });

      it("Should return zero if there are no staked tokens", async function () {
        const targetRate = await osmoticFunding.calculateTargetRate(0);
        expect(targetRate).to.be.equal(0);
      });

      it("Should return zero if the amount of staked tokens is below the min stake", async function () {
        const m =
          parseFloat(
            (await osmoticFunding.getConvictionSettings())[2].toString()
          ) / 1e18;
        const totalStaked =
          parseFloat((await osmoticFunding.totalStaked()).toString()) / 1e18;
        const targetRate = await osmoticFunding.calculateTargetRate(
          String(Math.floor(m * totalStaked * 1e18 - 100))
        );
        expect(targetRate).to.be.equal(0);
        const targetRate2 = await osmoticFunding.calculateTargetRate(
          String(m * totalStaked * 1e18)
        );
        expect(targetRate2).to.not.be.equal(0);
      });
    });

    describe("withdrawFromProposal()", function () {
      it("Should widthdraw from a proposal", async function () {
        await createProposal(proposal);
        await stakeOnProposal(0);
        const ownerBalance = await stakeToken.balanceOf(owner.address);
        await osmoticFunding.withdrawFromProposal(0, String(0.6e18));
        const [, , stakedTokens] = await osmoticFunding.getProposal(0);
        const ownerStake = await osmoticFunding.getProposalVoterStake(
          0,
          owner.address
        );
        const totalOwnerStake = await osmoticFunding.getTotalVoterStake(
          owner.address
        );
        expect(await stakeToken.balanceOf(owner.address)).to.be.equal(
          ownerBalance.add(String(0.6e18))
        );
        expect(stakedTokens).to.be.equal(String(0.4e18));
        expect(ownerStake).to.be.equal(String(0.4e18));
        expect(totalOwnerStake).to.be.equal(String(0.4e18));
      });
    });

    describe("withdrawInactiveStakedTokens()", function () {
      it("Should withdraw tokens from executed proposals", async function () {
        await osmoticFunding.withdrawInactiveStakedTokens(owner.address);
        const [, , stakedTokens] = await osmoticFunding.getProposal(0);
        const ownerStake = await osmoticFunding.getProposalVoterStake(
          0,
          owner.address
        );
        const totalOwnerStake = await osmoticFunding.getTotalVoterStake(
          owner.address
        );
        expect(await stakeToken.balanceOf(owner.address)).to.be.equal(
          String(100e18)
        );
        expect(stakedTokens).to.be.equal(String(0));
        expect(ownerStake).to.be.equal(String(0));
        expect(totalOwnerStake).to.be.equal(String(0));
      });
    });
  });
});
