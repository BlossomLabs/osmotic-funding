// SPDX-License-Identifier: AGPLv3
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

contract SuperConvictionVoting is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.UintSet;

  uint256 constant public D = 10000000;
  uint256 constant private TWO_128 = 0x100000000000000000000000000000000; // 2^128
  uint256 constant private TWO_127 = 0x80000000000000000000000000000000; // 2^127
  uint256 constant private TWO_64 = 0x10000000000000000; // 2^64
  uint64 constant public MAX_STAKED_PROPOSALS = 10;

  struct Proposal {
    uint256 requestedAmount;
    address beneficiary;
    uint256 stakedTokens;
    uint256 convictionLast;
    uint256 timeLast;
    bool active;
    mapping(address => uint256) voterStake;
    address submitter;
  }

  IERC20 public stakeToken;
  address public requestToken;
  uint256 public decay;
  uint256 public maxRatio;
  uint256 public weight;
  uint256 public proposalCounter;
  uint256 public totalStaked;

  mapping(uint256 => Proposal) internal proposals;
  mapping(address => uint256) internal totalVoterStake;
  mapping(address => EnumerableSet.UintSet) internal voterStakedProposals;

  event ConvictionSettingsChanged(uint256 decay, uint256 maxRatio, uint256 weight);
  event ProposalAdded(address indexed entity, uint256 indexed id, string title, bytes link, uint256 amount, address beneficiary);
  event StakeAdded(address indexed entity, uint256 indexed id, uint256  amount, uint256 tokensStaked, uint256 totalTokensStaked, uint256 conviction);
  event StakeWithdrawn(address entity, uint256 indexed id, uint256 amount, uint256 tokensStaked, uint256 totalTokensStaked, uint256 conviction);
  event ProposalExecuted(uint256 indexed id, uint256 conviction);
  event ProposalCancelled(uint256 indexed id);

  modifier proposalExists(uint256 _proposalId) {
    require(proposals[_proposalId].submitter != address(0), "PROPOSAL_DOES_NOT_EXIST");
    _;
  }

  modifier activeProposal(uint256 _proposalId) {
    require(proposals[_proposalId].active, "PROPOSAL_NOT_ACTIVE");
    _;
  }

  constructor(
    IERC20 _stakeToken,
    address _requestToken,
    uint256 _decay,
    uint256 _maxRatio,
    uint256 _weight
  ) {
    require(address(_stakeToken) != _requestToken, "STAKE_AND_REQUEST_TOKENS_MUST_BE_DIFFERENT");
    stakeToken = _stakeToken;
    requestToken = _requestToken;
    setConvictionSettings(_decay, _maxRatio, _weight);
  }

  function setConvictionSettings(
    uint256 _decay,
    uint256 _maxRatio,
    uint256 _weight
  )
    public onlyOwner
  {
    decay = _decay;
    maxRatio = _maxRatio;
    weight = _weight;

    emit ConvictionSettingsChanged(_decay, _maxRatio, _weight);
  }

  function addProposal(
    string calldata _title,
    bytes calldata _link,
    uint256 _requestedAmount,
    address _beneficiary
  )
    external
  {
    Proposal storage p = proposals[proposalCounter];
    p.requestedAmount = _requestedAmount;
    p.beneficiary = _beneficiary;
    p.stakedTokens = 0;
    p.convictionLast = 0;
    p.timeLast = 0;
    p.active = true;
    p.submitter = msg.sender;

    emit ProposalAdded(msg.sender, proposalCounter, _title, _link, _requestedAmount, _beneficiary);
    proposalCounter++;
  }

  function stakeToProposal(uint256 _proposalId, uint256 _amount) external activeProposal(_proposalId) {
    _stakeToProposal(_proposalId, _amount, msg.sender);
  }

  function withdrawFromProposal(uint256 _proposalId, uint256 _amount) external proposalExists(_proposalId) {
    _withdrawFromProposal(_proposalId, _amount, msg.sender);
  }

  function executeProposal(uint256 _proposalId) external activeProposal(_proposalId) {
    Proposal storage proposal = proposals[_proposalId];

    require(proposal.requestedAmount > 0, "CANNOT_EXECUTE_ZERO_VALUE_PROPOSAL");
    updateConviction(proposal);
    require(proposal.requestedAmount <= calculateReward(proposal.convictionLast), "INSUFFICIENT_CONVICION");

    proposal.active = false;
    IERC20(requestToken).safeTransfer(proposal.beneficiary, proposal.requestedAmount);

    emit ProposalExecuted(_proposalId, proposal.convictionLast);
  }

  function cancelProposal(uint256 _proposalId) external activeProposal(_proposalId) {
    Proposal storage proposal = proposals[_proposalId];
    require(proposal.submitter == msg.sender || owner() == msg.sender, "SENDER_CANNOT_CANCEL");
    proposal.active = false;

    emit ProposalCancelled(_proposalId);
  }

  /**
    * @dev Get proposal details
    * @param _proposalId Proposal id
    * @return requestedAmount Requested amount
    * @return beneficiary Beneficiary address
    * @return stakedTokens Current total stake of tokens on this proposal
    * @return convictionLast Conviction this proposal had last time calculateAndSetConviction was called
    * @return timeLast Time when calculateAndSetConviction was called
    * @return active True if proposal has already been executed
    * @return submitter Submitter of the proposal
    */
    function getProposal(uint256 _proposalId) public view returns (
      uint256 requestedAmount,
      address beneficiary,
      uint256 stakedTokens,
      uint256 convictionLast,
      uint256 timeLast,
      bool active,
      address submitter
    )
    {
      Proposal storage proposal = proposals[_proposalId];
      return (
        proposal.requestedAmount,
        proposal.beneficiary,
        proposal.stakedTokens,
        proposal.convictionLast,
        proposal.timeLast,
        proposal.active,
        proposal.submitter
      );
    }

  /**
   * @notice Get stake of voter `_voter` on proposal #`_proposalId`
   * @param _proposalId Proposal id
   * @param _voter Voter address
   * @return Proposal voter stake
   */
  function getProposalVoterStake(uint256 _proposalId, address _voter) public view returns (uint256) {
    return proposals[_proposalId].voterStake[_voter];
  }

  /**
   * @notice Get the total stake of voter `_voter` on all proposals
   * @param _voter Voter address
   * @return Total voter stake
   */
  function getTotalVoterStake(address _voter) public view returns (uint256) {
    return totalVoterStake[_voter];
  }

  function calculateConviction(
    uint256 _timePassed,
    uint256 _lastConv,
    uint256 _oldAmount
  )
    public view returns(uint256)
  {
    // atTWO_128 = 2^128 * a^t
    uint256 atTWO_128 = _pow((decay << 128).div(D), _timePassed);
    uint256 DsubA = D.sub(decay);
    // solium-disable-previous-line
    // conviction = (atTWO_128 * _lastConv + _oldAmount * D * (2^128 - atTWO_128) / ((D - aD)^2 * D) + 2^127) / 2^128
    return (atTWO_128.mul(_lastConv).add(_oldAmount.mul(D).mul(TWO_128.sub(atTWO_128)).div(DsubA.mul(DsubA)).mul(D))).add(TWO_127) >> 128;
  }

  function calculateReward(uint256 _conviction) public view returns (uint256 _amount) {
    if (_conviction == 0) {
      return 0;
    }
    uint256 funds = IERC20(requestToken).balanceOf(address(this));
    uint256 p = _sqrt(weight.mul(totalStaked).mul(D).div(_conviction));
    _amount = maxRatio > p ? maxRatio.sub(p).mul(funds).div(D) : 0;
  }

  function _sqrt(uint256 y) internal pure returns (uint256 z) {
    if (y > 3) {
      z = y;
      uint256 x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
    } else if (y != 0) {
      z = 1;
    }
  }

  /**
   * Multiply _a by _b / 2^128.  Parameter _a should be less than or equal to
   * 2^128 and parameter _b should be less than 2^128.
   * @param _a left argument
   * @param _b right argument
   * @return _result _a * _b / 2^128
   */
  function _mul(uint256 _a, uint256 _b) internal pure returns (uint256 _result) {
    require(_a <= TWO_128, "_a should be less than or equal to 2^128");
    require(_b < TWO_128, "_b should be less than 2^128");
    return _a.mul(_b).add(TWO_127) >> 128;
  }

  /**
   * Calculate (_a / 2^128)^_b * 2^128.  Parameter _a should be less than 2^128.
   *
   * @param _a left argument
   * @param _b right argument
   * @return _result (_a / 2^128)^_b * 2^128
   */
  function _pow(uint256 _a, uint256 _b) internal pure returns (uint256 _result) {
    require(_a < TWO_128, "_a should be less than 2^128");
    uint256 a = _a;
    uint256 b = _b;
    _result = TWO_128;
    while (b > 0) {
      if (b & 1 == 0) {
        a = _mul(a, a);
        b >>= 1;
      } else {
        _result = _mul(_result, a);
        b -= 1;
      }
    }
  }

  /**
   * @dev Calculate conviction and store it on the proposal
   * @param _proposal Proposal
   */
  function updateConviction(Proposal storage _proposal) internal {
    uint256 _oldStaked = _proposal.stakedTokens;
    assert(_proposal.timeLast <= block.timestamp);
    if (_proposal.timeLast == block.timestamp) {
      return; // Conviction already stored
    }
    // calculateConviction and store it
    uint256 conviction = calculateConviction(
      block.timestamp - _proposal.timeLast, // we assert it doesn't overflow above
      _proposal.convictionLast,
      _oldStaked
    );
    _proposal.timeLast = block.timestamp;
    _proposal.convictionLast = conviction;
  }

  /**
   * @dev Support with an amount of tokens on a proposal
   * @param _proposalId Proposal id
   * @param _amount Amount of staked tokens
   * @param _from Account from which we stake
   */
  function _stakeToProposal(uint256 _proposalId, uint256 _amount, address _from) internal {
    Proposal storage proposal = proposals[_proposalId];
    require(_amount > 0, "AMOUNT_CAN_NOT_BE_ZERO");

    uint256 unstakedAmount = stakeToken.balanceOf(_from).sub(totalVoterStake[_from]);
    if (_amount > unstakedAmount) {
      withdrawInactiveStakedTokens(_from);
    }

    require(totalVoterStake[_from].add(_amount) <= stakeToken.balanceOf(_from), "STAKING_MORE_THAN_AVAILABLE");

    if (proposal.timeLast == 0) {
      proposal.timeLast = block.timestamp;
    } else {
      updateConviction(proposal);
    }

    _updateVoterStakedProposals(_proposalId, _from, _amount, true);

    emit StakeAdded(_from, _proposalId, _amount, proposal.voterStake[_from], proposal.stakedTokens, proposal.convictionLast);
  }

  /**
    * @dev Withdraw an amount of tokens from a proposal
    * @param _proposalId Proposal id
    * @param _amount Amount of withdrawn tokens
    * @param _from Account to withdraw from
    */
  function _withdrawFromProposal(uint256 _proposalId, uint256 _amount, address _from) internal {
    Proposal storage proposal = proposals[_proposalId];
    require(proposal.voterStake[_from] >= _amount, "WITHDRAW_MORE_THAN_STAKED");
    require(_amount > 0, "AMOUNT_CAN_NOT_BE_ZERO");

    if (proposal.active) {
      updateConviction(proposal);
    }

    _updateVoterStakedProposals(_proposalId, _from, _amount, false);

    emit StakeWithdrawn(_from, _proposalId, _amount, proposal.voterStake[_from], proposal.stakedTokens, proposal.convictionLast);
  }

  /**
   * @dev Withdraw all staked tokens from executed proposals.
   * @param _voter Account to withdraw from
   */
  function withdrawInactiveStakedTokens(address _voter) public {
    uint256 amount;
    uint256 i;
    uint256 len = voterStakedProposals[_voter].length();
    uint256[] memory voterStakedProposalsCopy = new uint256[](len);
    for(i = 0; i < len; i++) {
      voterStakedProposalsCopy[i] = voterStakedProposals[_voter].at(i);
    }
    for(i = 0; i < len; i++) {
      uint256 proposalId = voterStakedProposalsCopy[i];
      Proposal storage proposal = proposals[proposalId];
      if (!proposal.active) {
        amount = proposal.voterStake[_voter];
        if (amount > 0) {
          _withdrawFromProposal(proposalId, amount, _voter);
        }
      }
    }
  }

  function _updateVoterStakedProposals(uint256 _proposalId, address _from, uint256 _amount, bool _support) internal {
    Proposal storage proposal = proposals[_proposalId];
    EnumerableSet.UintSet storage voterStakedProposalsSet = voterStakedProposals[_from];

    if (_support) {
      stakeToken.safeTransferFrom(msg.sender, address(this), _amount);
      proposal.stakedTokens = proposal.stakedTokens.add(_amount);
      proposal.voterStake[_from] = proposal.voterStake[_from].add(_amount);
      totalVoterStake[_from] = totalVoterStake[_from].add(_amount);
      totalStaked = totalStaked.add(_amount);
      
      if (!voterStakedProposalsSet.contains(_proposalId)) {
        require(voterStakedProposalsSet.length() < MAX_STAKED_PROPOSALS, "MAX_PROPOSALS_REACHED");
        voterStakedProposalsSet.add(_proposalId);
      }
    } else {
      stakeToken.safeTransfer(msg.sender, _amount);
      proposal.stakedTokens = proposal.stakedTokens.sub(_amount);
      proposal.voterStake[_from] = proposal.voterStake[_from].sub(_amount);
      totalVoterStake[_from] = totalVoterStake[_from].sub(_amount);
      totalStaked = totalStaked.sub(_amount);

      if (proposal.voterStake[_from] == 0) {
        voterStakedProposalsSet.remove(_proposalId);
      }
    }
  }
}

