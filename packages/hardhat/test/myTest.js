const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

// const {
//   BN,           // Big Number support
//   constants,    // Common constants, like the zero address and largest integers
//   expectEvent,  // Assertions for emitted events
//   expectRevert, // Assertions for transactions that should fail
// } = require('@openzeppelin/test-helpers');


use(solidity);

describe("My Dapp", async function () {
  let myContract;
  let stakeToken;
  let requestToken;
  let owner;
  let beneficiary;

  before(async () => {
    ([owner, beneficiary] = await ethers.getSigners());
  })

  describe("SuperConvictionVoting", function () {
    it("Should deploy SuperConvictionVoting", async function () {
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      const SuperConvictionVoting = await ethers.getContractFactory("SuperConvictionVoting");

      stakeToken = await ERC20Mock.deploy("Stake Token", "STK", owner.address, String(100e18));
      requestToken = await ERC20Mock.deploy("Request SuperToken", "RST", owner.address, String(100e18));
      const decay = 0.9999999e7;
      const maxRatio = 0.2e7;
      const weight = 0.0025e7;
      const minActiveStake = 0.05e7;
      
      myContract = await SuperConvictionVoting.deploy(stakeToken.address, requestToken.address, decay, maxRatio, weight, minActiveStake);
    });

    describe("setConvictionSettings()", function () {
      it("Should be able to set new settings", async function () {
        const newDecay = 0.99999e7;
        const newMaxRatio = 0.1e7;
        const newWeight = 0.002e7;
        const newMinActiveStake = 0.05e7;

        await myContract.setConvictionSettings(newDecay, newMaxRatio, newWeight, newMinActiveStake);
        expect(await myContract.decay()).to.equal(newDecay);
        expect(await myContract.maxRatio()).to.equal(newMaxRatio);
        expect(await myContract.weight()).to.equal(newWeight);
        expect(await myContract.minActiveStake()).to.equal(newMinActiveStake);
      });
    });

    describe("addProposal()", function() {
      it("Should create a new proposal", async function () {
        const title = "Super Proposal";
        const link = ethers.utils.toUtf8Bytes("https://ipfs.io/ipfs/Qm");
        const requestedAmount = String(2e18);
        await myContract.addProposal(title, link, requestedAmount, beneficiary.address);
        const [_requestedAmount, _beneficiary, stakedTokens, convictionLast, timeLast, active, submitter] = await myContract.getProposal(0);
        expect(_requestedAmount).to.be.equal(requestedAmount);
        expect(_beneficiary).to.be.equal(beneficiary.address);
        expect(stakedTokens).to.be.equal(0);
        expect(convictionLast).to.be.equal(0);
        expect(timeLast).to.be.equal(0);
        expect(active).to.be.true;
        expect(submitter).to.be.equal(owner.address);
      });
    });

    describe("stakeToProposal()", function() {
      it("Should stake on proposal", async function() {
        const ownerBalance = await stakeToken.balanceOf(owner.address);
        await stakeToken.approve(myContract.address, String(1e18));
        await myContract.stakeToProposal(0, String(1e18));
        const [,, stakedTokens] = await myContract.getProposal(0);
        const ownerStake = await myContract.getProposalVoterStake(0, owner.address);
        const totalOwnerStake = await myContract.getTotalVoterStake(owner.address);
        expect(await stakeToken.balanceOf(owner.address)).to.be.equal(ownerBalance.sub(String(1e18)));
        expect(stakedTokens).to.be.equal(String(1e18));
        expect(ownerStake).to.be.equal(String(1e18));
        expect(totalOwnerStake).to.be.equal(String(1e18));
      });
    });

    describe("calculateConviction()", function() {
      it("Should calculate conviction growth correctly after 1 day", async function() {
        const a = (await myContract.decay()).toNumber() / 1e7;
        const timePassed = 24 * 60 * 60; // 1 day
        const lastConv = 0; // conviction starts from scratch
        const amount = 1e18; // staking 1 token
        const conviction = await myContract.calculateConviction(timePassed, String(lastConv), String(amount));
        const expectedConviction = lastConv * a ** timePassed + amount * (1 - a ** timePassed) / (1 - a) ** 2;
        expect(parseFloat(ethers.utils.formatUnits(conviction, 18))).to.be.closeTo(expectedConviction / 1e18, 0.1);
      });

      it("Should calculate conviction growth correctly after 2 days from previous conviction", async function() {
        const a = (await myContract.decay()).toNumber() / 1e7;
        const timePassed = 24 * 60 * 60; // 1 day
        const lastConv = await myContract.calculateConviction(timePassed, 0, String(1e18));
        const amount = 1e18; // staking 1 token
        const conviction = await myContract.calculateConviction(timePassed, String(lastConv), String(amount));
        const expectedConviction = lastConv * a ** timePassed + amount * (1 - a ** timePassed) / (1 - a) ** 2;
        const expectedConviction2 = amount * (1 - a ** (timePassed * 2)) / ((1 - a) ** 2);
        expect(expectedConviction / expectedConviction2).to.be.closeTo(1, 1e-10);
        expect(parseFloat(ethers.utils.formatUnits(conviction, 18))).to.be.closeTo(expectedConviction / 1e18, 0.1);
      });

      it("Should calculate conviction decay correctly after 1 day", async function() {
        const a = (await myContract.decay()).toNumber() / 1e7;
        const timePassed = 24 * 60 * 60; // 1 day
        const lastConv = await myContract.calculateConviction(timePassed, 0, String(1e18)); // 1 day accrued conviction
        const amount = 0; // staking 0 tokens
        const conviction = await myContract.calculateConviction(timePassed, String(lastConv), String(amount));
        const expectedConviction = lastConv * a ** timePassed + amount * (1 - a ** timePassed) / (1 - a) ** 2;
        expect(parseFloat(ethers.utils.formatUnits(conviction, 18))).to.be.closeTo(expectedConviction / 1e18, 0.1);
      });
    });

    describe.skip("updateConviction()", function() {
      it("Should update last conviction and last time", async function() {

      });
    });

    describe("withdrawFromProposal()", function() {
      it("Should widthdraw from a proposal", async function() {
        const ownerBalance = await stakeToken.balanceOf(owner.address);
        await myContract.withdrawFromProposal(0, String(0.6e18));
        const [,, stakedTokens] = await myContract.getProposal(0);
        const ownerStake = await myContract.getProposalVoterStake(0, owner.address);
        const totalOwnerStake = await myContract.getTotalVoterStake(owner.address);
        expect(await stakeToken.balanceOf(owner.address)).to.be.equal(ownerBalance.add(String(0.6e18)));
        expect(stakedTokens).to.be.equal(String(0.4e18));
        expect(ownerStake).to.be.equal(String(0.4e18));
        expect(totalOwnerStake).to.be.equal(String(0.4e18));
      });
    });

    describe.skip("executeProposal()", function() {
      it("Should execute a proposal", async function() {
        await myContract.executeProposal(0);
      });
    });

    describe("withdrawInactiveStakedTokens()", function() {
      it("Should withdraw tokens from executed proposals", async function() {
        await myContract.withdrawInactiveStakedTokens(owner.address);
      })
    })
  });
});
