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
    link: ethers.utils.toUtf8Bytes("https://ipfs.io/ipfs/Qm"),
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
    const { link } = proposal;
    await osmoticFunding.addProposal(link, beneficiary.address);
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

    describe("setFundingSettings()", function () {
      it("Should be able to set new settings", async function () {
        const newDecay = String(0.99999e18);
        const newMaxRatio = String(0.1e18);
        const newMinStakeRatio = String(0.002e18);

        await osmoticFunding.setFundingSettings(
          newDecay,
          newMaxRatio,
          newMinStakeRatio
        );
        expect(
          (await osmoticFunding.getFundingSettings()).map((bn) => bn.toString())
        ).to.deep.equal([newDecay, newMaxRatio, newMinStakeRatio]);
      });
    });

    describe("addProposal()", function () {
      it("Should create a new proposal", async function () {
        await createProposal(proposal);
        const [
          _beneficiary,
          stakedTokens,
          lastRate,
          lastTime,
          active,
          submitter,
        ] = await osmoticFunding.getProposal(0);
        expect(_beneficiary).to.be.equal(beneficiary.address);
        expect(stakedTokens).to.be.equal(0);
        expect(lastRate).to.be.equal(0);
        expect(lastTime).to.be.equal(0);
        expect(active).to.be.true;
        expect(submitter).to.be.equal(owner.address);
      });
    });

    describe("stakeToProposal()", function () {
      it("Should stake on proposal", async function () {
        const ownerBalance = await stakeToken.balanceOf(owner.address);

        await createProposal(proposal);
        await stakeOnProposal(0);

        const [, stakedTokens] = await osmoticFunding.getProposal(0);
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

    describe("calculateRate()", function () {
      it("Should calculate rate growth correctly after 1 day", async function () {
        const a =
          parseFloat(
            (await osmoticFunding.getFundingSettings())[0].toString()
          ) / 1e18;
        const timePassed = 24 * 60 * 60; // 1 day
        const initialRate = 0; // rate starts at 0
        const targetRate = 1e18; // target rate is 1 token/s
        const rateIn1day = await osmoticFunding.calculateRate(
          timePassed,
          String(initialRate),
          String(targetRate)
        );
        const expectedRate =
          initialRate * a ** timePassed + targetRate * (1 - a ** timePassed);
        expect(
          parseFloat(ethers.utils.formatUnits(rateIn1day, 18))
        ).to.be.closeTo(expectedRate / 1e18, 1.5);
      });

      it("Should calculate rate growth correctly after 2 days from previous rate", async function () {
        const a =
          parseFloat(
            (await osmoticFunding.getFundingSettings())[0].toString()
          ) / 1e18;
        const timePassed = 24 * 60 * 60; // 1 day
        const rateDay1 = await osmoticFunding.calculateRate(
          timePassed,
          0,
          String(1e18)
        );
        const targetRate = 1e18; // target rate of 1 token/s
        const rateDay2 = await osmoticFunding.calculateRate(
          timePassed,
          String(rateDay1),
          String(targetRate)
        );
        const expectedRate =
          parseFloat(String(rateDay1)) * a ** timePassed +
          targetRate * (1 - a ** timePassed);
        const expectedRate2 = targetRate * (1 - a ** (timePassed * 2));
        expect(expectedRate / expectedRate2).to.be.closeTo(1, 1e-10);
        expect(
          parseFloat(ethers.utils.formatUnits(rateDay2, 18))
        ).to.be.closeTo(expectedRate / 1e18, 1.5);
      });

      it("Should calculate rate decay correctly after 1 day", async function () {
        const a =
          parseFloat(
            (await osmoticFunding.getFundingSettings())[0].toString()
          ) / 1e18;
        const timePassed = 24 * 60 * 60; // 1 day
        const rateDay1 = await osmoticFunding.calculateRate(
          timePassed,
          0,
          String(1e18)
        ); // Rate after 1 day
        const targetRate = 0; // target rate is 0 tokens/s
        const rateDay2 = await osmoticFunding.calculateRate(
          timePassed,
          String(rateDay1),
          String(targetRate)
        );
        const expectedRate =
          parseFloat(String(rateDay1)) * a ** timePassed +
          targetRate * (1 - a ** timePassed);
        expect(
          parseFloat(ethers.utils.formatUnits(rateDay2, 18))
        ).to.be.closeTo(expectedRate / 1e18, 1.5);
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
            (await osmoticFunding.getFundingSettings())[1].toString()
          ) / 1e18;
        const m =
          parseFloat(
            (await osmoticFunding.getFundingSettings())[2].toString()
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
            (await osmoticFunding.getFundingSettings())[2].toString()
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
        const [, stakedTokens] = await osmoticFunding.getProposal(0);
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
        const [, stakedTokens] = await osmoticFunding.getProposal(0);
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
