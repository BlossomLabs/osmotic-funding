import { InfoCircleOutlined } from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Image,
  InputNumber,
  Modal,
  Progress,
  Row,
  Slider,
  Space,
  Statistic,
  Tooltip,
  Typography,
} from "antd";
import { useContractReader } from "eth-hooks";
import { utils } from "ethers";
import { useState } from "react";
import { format } from "../../helpers/format";
const { Title, Paragraph, Text, Link } = Typography;

function ProposalCard({
  proposal,
  onAdd,
  onStake,
  stakedOnProposal,
  minStake,
  voterStaked,
  raised,
  rate,
  withdrawAll,
  voterBalance,
  targetRate,
  totalVoterStake,
  faucet,
}) {
  const active = minStake && stakedOnProposal?.gt(minStake);
  const stakeTokenSymbol = "GTC";
  const requestTokenSymbol = "DAI";
  const _minStake = format(minStake);
  const _voterStaked = format(voterStaked);
  const _stakedOnProposal = format(stakedOnProposal);
  const percent = (minStake && minStake.gt(0) && stakedOnProposal?.mul(100).div(minStake)) || 0;
  const _raised = utils.formatUnits(raised || 0, 18);
  const _rate = utils.formatUnits(rate?.mul(2_592_000) || 0, 18);
  const _targetRate = format(targetRate?.mul(2_592_000));
  const _stakeOnOtherProposals = format(totalVoterStake?.sub(voterStaked || 0));
  const _availableToStake = format(voterBalance?.sub(totalVoterStake || 0).sub(voterStaked || 0));
  const _voterBalance = format(voterBalance);
  const [amount, setAmount] = useState(_voterStaked);
  const added = proposal.index >= 0;

  const [isModalVisible, setIsModalVisible] = useState(false);

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = () => {
    setIsModalVisible(false);
    onStake(proposal, amount);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  return (
    <Badge.Ribbon text={active ? "Active" : added ? "Accruing support…" : null} color={active ? "#77D970" : "grey"}>
      <Card style={{ borderColor: active ? "#77D970" : "grey", borderWidth: 2 }}>
        <a
          href={`https://gitcoin.co/grants/${proposal.id}/${proposal.slug}/`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image preview={false} width="100%" height="200px" style={{ objectFit: "cover" }} src={proposal.logo} />
          <div style={{ height: 100, display: "flex" }}>
            <Title level={3} style={{ alignSelf: "center", textAlign: "center", width: "100%" }}>
              {proposal ? proposal.title : null}
            </Title>
          </div>
        </a>
        <Paragraph>{proposal.description.substr(0, 141)}</Paragraph>
        <Divider />
        <Space style={{ height: 100 }}>
          {active ? (
            <Row gutter="40">
              <Col span={12}>
                <Statistic title="Raising…" value={_raised} suffix={requestTokenSymbol}></Statistic>
              </Col>
              <Col span={12}>
                <Statistic
                  title={
                    <>
                      Rate per month{" "}
                      <Tooltip
                        title={`Because ${_stakedOnProposal} ${stakeTokenSymbol} are staked in total, the monthly rate will grow up to ${_targetRate} ${requestTokenSymbol}/month`}
                      >
                        <InfoCircleOutlined />
                      </Tooltip>
                    </>
                  }
                  value={_rate}
                  suffix={requestTokenSymbol}
                ></Statistic>
              </Col>
            </Row>
          ) : (
            <Row>
              <Col span={12}>
                <Progress type="circle" percent={percent} status="active" />
              </Col>
              <Col span={12}>
                <Statistic
                  title="staked"
                  value={`${_stakedOnProposal}/${_minStake}`}
                  suffix={stakeTokenSymbol}
                ></Statistic>
              </Col>
            </Row>
          )}
        </Space>
        <Divider />
        <Row>
          {added ? (
            voterStaked?.gt(0) ? (
              <Button block size="large" onClick={showModal}>
                Staking {_voterStaked} {stakeTokenSymbol}…
              </Button>
            ) : (
              <Button block size="large" type="primary" onClick={showModal}>
                Stake {stakeTokenSymbol}
              </Button>
            )
          ) : (
            <Button block size="large" type="dashed" onClick={() => onAdd(proposal)}>
              Add proposal
            </Button>
          )}
          <Modal
            title={`Staking on grant "${proposal.title}"`}
            visible={isModalVisible}
            onOk={handleOk}
            onCancel={handleCancel}
          >
            <Row>
              <Col span={12} align="center">
                <Statistic title="Your balance" value={_voterBalance} suffix={stakeTokenSymbol}></Statistic>
                <Button size="small" type="link" onClick={faucet}>
                  Request more
                </Button>
              </Col>
              <Col span={12} align="center">
                <Statistic
                  title="Staked on other proposals"
                  value={_stakeOnOtherProposals}
                  suffix={stakeTokenSymbol}
                ></Statistic>
                <Button size="small" type="link" onClick={withdrawAll}>
                  Withdraw all
                </Button>
              </Col>
            </Row>
            <Divider />
            <Row>
              <Space direction="vertical">
                <Col span={24} align="center">
                  <Statistic title="Staked on this proposal" value={amount} suffix={stakeTokenSymbol}></Statistic>
                </Col>
                <Col span={24}>
                  <Text>How much of your remaining ${stakeTokenSymbol} do you want to stake on this proposal?</Text>
                </Col>
                <Row>
                  <Col flex="auto">
                    <Slider defaultValue={amount} max={parseFloat(_availableToStake)} onChange={setAmount} />
                  </Col>
                  <Col span={5} align="right">
                    <InputNumber value={amount} onChange={setAmount} />
                  </Col>
                </Row>
              </Space>
            </Row>
          </Modal>
        </Row>
      </Card>
    </Badge.Ribbon>
  );
}
export default function Proposal({
  proposal,
  tx,
  readContracts,
  writeContracts,
  address,
  totalVoterStake,
  voterBalance,
}) {
  function onAdd(proposal) {
    tx(writeContracts?.OsmoticFunding.addProposal(`https://gitcoin.co/grants/${proposal.id}`, proposal.admin_address));
  }
  async function onStake(proposal, _amount) {
    const amount = utils.parseUnits(String(_amount), 18);
    await tx(writeContracts.StakeToken.approve(writeContracts.OsmoticFunding.address, amount));
    await tx(writeContracts.OsmoticFunding.setStake(proposal.index, amount));
  }

  function faucet() {
    tx(writeContracts.OsmoticFunding.faucet());
  }

  function withdrawAll() {
    tx(writeContracts.OsmoticFunding.withdrawStake(address, false));
  }

  const minStake = useContractReader(readContracts, "OsmoticFunding", "minStake");
  const voterStaked = useContractReader(readContracts, "OsmoticFunding", "getProposalVoterStake", [
    proposal.index,
    address,
  ]);
  const stakedOnProposal = useContractReader(readContracts, "OsmoticFunding", "getProposal", [
    proposal.index,
  ])?.stakedTokens;

  const raised = useContractReader(readContracts, "OsmoticFunding", "claimable", [proposal.index]);
  const rate = useContractReader(readContracts, "OsmoticFunding", "rate", [proposal.index]);
  const targetRate = useContractReader(readContracts, "OsmoticFunding", "targetRate", [proposal.index]);

  return (
    <ProposalCard
      proposal={proposal}
      onAdd={onAdd}
      onStake={onStake}
      minStake={minStake}
      voterStaked={voterStaked}
      stakedOnProposal={stakedOnProposal}
      raised={raised}
      rate={rate}
      totalVoterStake={totalVoterStake}
      voterBalance={voterBalance}
      faucet={faucet}
      withdrawAll={withdrawAll}
      targetRate={targetRate}
    ></ProposalCard>
  );
}
