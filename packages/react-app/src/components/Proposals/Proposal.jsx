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
  Typography,
} from "antd";
import { useContractReader } from "eth-hooks";
import { utils } from "ethers";
import { useState } from "react";
const { Title, Paragraph, Text, Link } = Typography;

function ProposalCard({ proposal, onAdd, onStake, stakedOnProposal, minStake, voterStaked }) {
  const [amount, setAmount] = useState(0);
  const active = minStake && stakedOnProposal?.gt(minStake);
  const raised = 10000;
  const rate = 100;
  const stakeTokenSymbol = "GTC";
  const requestTokenSymbol = "DAI";

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
                <Statistic title="Raising…" value={raised} suffix={requestTokenSymbol}></Statistic>
              </Col>
              <Col span={12}>
                <Statistic title="Rate per month" value={rate} suffix={requestTokenSymbol}></Statistic>
              </Col>
            </Row>
          ) : (
            <Row>
              <Col span={12}>
                <Progress type="circle" percent={80} status="active" />
              </Col>
              <Col span={12}>
                <Statistic
                  title="staked"
                  value={`${stakedOnProposal || 0}/${minStake}`}
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
                Staking {utils.parseUnits(voterStaked, 18, { commify: true })} {stakeTokenSymbol}…
              </Button>
            ) : (
              <Button block size="large" type="primary" onClick={showModal}>
                Stake ${stakeTokenSymbol}
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
                <Statistic title="Your balance" value={100} suffix={stakeTokenSymbol}></Statistic>
                <Button size="small" type="link">
                  Request more
                </Button>
              </Col>
              <Col span={12} align="center">
                <Statistic title="Staked on other proposals" value={50} suffix={stakeTokenSymbol}></Statistic>
                <Button size="small" type="link">
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
                    <Slider defaultValue={amount} onChange={setAmount} />
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
export default function Proposal({ proposal, tx, readContracts, writeContracts, address }) {
  function onAdd(proposal) {
    console.log(`https://gitcoin.co/grants/${proposal.id}`, proposal.admin_address);
    tx(writeContracts?.OsmoticFunding.addProposal(`https://gitcoin.co/grants/${proposal.id}`, proposal.admin_address));
  }
  function onStake(proposal) {
    tx(writeContracts.OsmoticFunding.stakeOnProposal(proposal.index, proposal.beneficiary));
  }

  const minStake = useContractReader(readContracts, "OsmoticFunding", "minStake");
  const voterStaked = useContractReader(readContracts, "OsmoticFunding", "getProposalVoterStake", [
    proposal.index,
    address,
  ]);
  const stakedOnProposal = useContractReader(readContracts, "OsmoticFunding", "getProposal", [
    proposal.index,
  ])?.stakedTokens;
  console.log(minStake, stakedOnProposal, stakedOnProposal);
  return (
    <ProposalCard
      proposal={proposal}
      onAdd={onAdd}
      onStake={onStake}
      minStake={minStake}
      voterStaked={voterStaked}
      stakedOnProposal={stakedOnProposal}
    ></ProposalCard>
  );
}
