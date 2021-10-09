import { BigInt, Address } from "@graphprotocol/graph-ts";
import {
  OsmoticFunding,
  ProposalAdded,
} from "../generated/OsmoticFunding/OsmoticFunding";
import { Proposal, Beneficiary } from "../generated/schema";

export function handleProposalAdded(event: ProposalAdded): void {
  let beneficiaryString = event.params.beneficiary.toHexString();

  let beneficiary = Beneficiary.load(beneficiaryString);

  if (beneficiary === null) {
    beneficiary = new Beneficiary(beneficiaryString);
    beneficiary.address = event.params.beneficiary;
    beneficiary.createdAt = event.block.timestamp;
    beneficiary.proposalCount = BigInt.fromI32(1);
  } else {
    beneficiary.proposalCount = beneficiary.proposalCount.plus(BigInt.fromI32(1));
  }

  let proposal = new Proposal(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  proposal.link = event.params.link;
  proposal.beneficiary = beneficiaryString;
  proposal.createdAt = event.block.timestamp;
  proposal.transactionHash = event.transaction.hash.toHex();

  proposal.save();
  beneficiary.save();
}
