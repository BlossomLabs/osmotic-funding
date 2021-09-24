pragma solidity >=0.6.0 <0.8.0;
//SPDX-License-Identifier: GPLv3+

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
  uint256 public minActiveStake;
  uint256 public proposalCounter;
  uint256 public totalStaked;

  mapping(uint256 => Proposal) internal proposals;
  mapping(address => uint256) internal totalVoterStake;
  mapping(address => EnumerableSet.UintSet) internal voterStakedProposals;

  event ConvictionSettingsChanged(uint256 decay, uint256 maxRatio, uint256 weight, uint256 minThresholdStakePercentage);
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
    uint256 _weight,
    uint256 _minActiveStake
  ) public {
    require(address(_stakeToken) != _requestToken, "STAKE_AND_REQUEST_TOKENS_MUST_BE_DIFFERENT");
    stakeToken = _stakeToken;
    requestToken = _requestToken;
    setConvictionCalculationSettings(_decay, _maxRatio, _weight, _minActiveStake);
  }

  function setConvictionCalculationSettings(
    uint256 _decay,
    uint256 _maxRatio,
    uint256 _weight,
    uint256 _minActiveStake
  )
    public onlyOwner
  {
    decay = _decay;
    maxRatio = _maxRatio;
    weight = _weight;
    minActiveStake = _minActiveStake;

    emit ConvictionSettingsChanged(_decay, _maxRatio, _weight, _minActiveStake);
  }

  function addProposal(
    string calldata _title,
    bytes calldata _link,
    uint256 _requestedAmount,
    address _beneficiary
  )
    external
  {
    proposals[proposalCounter] = Proposal(
      _requestedAmount,
      _beneficiary,
      0,
      0,
      0,
      true,
      msg.sender
    );

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
    _calculateAndSetConviction(proposal, proposal.stakedTokens);
    require(proposal.convictionLast > calculateThreshold(proposal.requestedAmount), "INSUFFICIENT_CONVICION");

    proposal.active = false;
    IERC20(requestToken).safeTransfer(proposal.beneficiary, proposal.requestedAmount);

    emit ProposalExecuted(_proposalId, proposal.convictionLast);
  }

  function cancelProposal(uint256 _proposalId) external activeProposal(_proposalId) {
    Proposal storage proposal = proposals[_proposalId];
    require(proposal.submitter == msg.sender, "SENDER_CANNOT_CANCEL");
    proposal.active = false;

    emit ProposalCancelled(_proposalId);
  }

  function calculateConviction(
    uint256 _timePassed,
    uint256 _lastConv,
    uint256 _oldAmount
  )
    public view returns(uint256)
  {
    uint256 t = uint256(_timePassed);
    // atTWO_128 = 2^128 * a^t
    uint256 atTWO_128 = _pow((decay << 128).div(D), t);
    // solium-disable-previous-line
    // conviction = (atTWO_128 * _lastConv + _oldAmount * D * (2^128 - atTWO_128) / (D - aD) + 2^127) / 2^128
    return (atTWO_128.mul(_lastConv).add(_oldAmount.mul(D).mul(TWO_128.sub(atTWO_128)).div(D - decay))).add(TWO_127) >> 128;
  }

  function calculateThreshold(uint256 _requestedAmount) public view returns (uint256 _threshold) {
    uint256 funds = IERC20(requestToken).balanceOf(address(this));
    require(maxRatio.mul(funds) > _requestedAmount.mul(D), "AMOUNT_OVER_MAX_RATIO");
    // denom = maxRatio * 2 ** 64 / D  - requestedAmount * 2 ** 64 / funds
    uint256 denom = (maxRatio << 64).div(D).sub((_requestedAmount << 64).div(funds));
    // _threshold = (weight * 2 ** 128 / D) / (denom ** 2 / 2 ** 64) * totalStaked * D / 2 ** 128
    _threshold = ((weight << 128).div(D).div(denom.mul(denom) >> 64)).mul(D).div(D.sub(decay)).mul(_totalStaked()) >> 64;
  }

  function _totalStaked() internal view returns (uint256) {
    return totalStaked < minActiveStake ? minActiveStake : totalStaked;
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
   * @param _oldStaked Amount of tokens staked on a proposal until now
   */
  function _calculateAndSetConviction(Proposal storage _proposal, uint256 _oldStaked) internal {
    assert(_proposal.timeLast <= now);
    if (_proposal.timeLast == now) {
      return; // Conviction already stored
    }
    // calculateConviction and store it
    uint256 conviction = calculateConviction(
      now - _proposal.timeLast, // we assert it doesn't overflow above
      _proposal.convictionLast,
      _oldStaked
    );
    _proposal.timeLast = now;
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
      _withdrawInactiveStakedTokens(_amount.sub(unstakedAmount), _from);
    }

    require(totalVoterStake[_from].add(_amount) <= stakeToken.balanceOf(_from), "STAKING_MORE_THAN_AVAILABLE");

    uint256 previousStake = proposal.stakedTokens;
    _updateVoterStakedProposals(_proposalId, _from, _amount, true);

    if (proposal.timeLast == 0) {
      proposal.timeLast = now;
    } else {
      _calculateAndSetConviction(proposal, previousStake);
    }

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

    uint256 previousStake = proposal.stakedTokens;
    _updateVoterStakedProposals(_proposalId, _from, _amount, false);

    if (proposal.active) {
      _calculateAndSetConviction(proposal, previousStake);
    }

    emit StakeWithdrawn(_from, _proposalId, _amount, proposal.voterStake[_from], proposal.stakedTokens, proposal.convictionLast);
  }

  /**
   * @dev Withdraw staked tokens from executed proposals until a target amount is reached.
   * @param _targetAmount Target at which to stop withdrawing tokens
   * @param _from Account to withdraw from
   */
  function _withdrawInactiveStakedTokens(uint256 _targetAmount, address _from) internal {
    uint256 i = 0;
    uint256 toWithdraw;
    uint256 withdrawnAmount = 0;

    EnumerableSet.UintSet storage voterStakedProposalsCopy = voterStakedProposals[_from];
    uint256[] memory voterStakedProposalsArray = new uint256[](voterStakedProposalsCopy.length());
    for(i = 0; i < voterStakedProposalsCopy.length(); i++) {
      voterStakedProposalsArray[i] = voterStakedProposalsCopy.at(i);
    }
    i = 0;
    while (i < voterStakedProposalsArray.length && withdrawnAmount < _targetAmount) {
      uint256 proposalId = voterStakedProposalsArray[i];
      Proposal storage proposal = proposals[proposalId];

      if (!proposal.active) {
        toWithdraw = proposal.voterStake[_from];
        if (toWithdraw > 0) {
          _withdrawFromProposal(proposalId, toWithdraw, _from);
          withdrawnAmount = withdrawnAmount.add(toWithdraw);
        }
      }
      i++;
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

