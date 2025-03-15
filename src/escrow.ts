import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  EscrowCreated as EscrowCreatedEvent,
  PayerSet as PayerSetEvent,
  Settled as SettledEvent,
  Refunded as RefundedEvent,
  Disputed as DisputedEvent,
  DisputeResolved as DisputeResolvedEvent,
  EscapeAddressSet as EscapeAddressSetEvent,
  Escaped as EscapedEvent
} from "../generated/templates/SimpleEscrow/SimpleEscrow"
import {
  EscrowCreated,
  PayerSet,
  Settled,
  Refunded,
  Disputed,
  DisputeResolved,
  EscapeAddressSet,
  Escaped
} from "../generated/schema"

export function handleEscrowCreated(event: EscrowCreatedEvent): void {
  let escrow = new EscrowCreated(event.params.escrowAddress.toHexString())
  escrow.escrowAddress = event.params.escrowAddress
  escrow.payee = event.params.payee
  escrow.storefront = event.params.storefront
  escrow.escrowAgent = event.params.escrowAgent
  escrow.blockNumber = event.block.number
  escrow.blockTimestamp = event.block.timestamp
  escrow.transactionHash = event.transaction.hash
  escrow.save()
}

export function handlePayerSet(event: PayerSetEvent): void {
  let payerSet = new PayerSet(event.transaction.hash.toHexString())
  payerSet.escrow = event.address.toHexString()
  payerSet.payer = event.params.payer
  payerSet.settleDeadline = event.params.settleDeadline
  payerSet.blockNumber = event.block.number
  payerSet.blockTimestamp = event.block.timestamp
  payerSet.transactionHash = event.transaction.hash
  payerSet.save()
}

export function handleSettled(event: SettledEvent): void {
  let settled = new Settled(event.transaction.hash.toHexString())
  settled.escrow = event.address.toHexString()
  settled.to = event.params.to
  settled.token = event.params.token
  settled.tokenId = event.params.tokenId
  settled.amount = event.params.amount
  settled.blockNumber = event.block.number
  settled.blockTimestamp = event.block.timestamp
  settled.transactionHash = event.transaction.hash
  settled.save()
}

export function handleRefunded(event: RefundedEvent): void {
  let refunded = new Refunded(event.transaction.hash.toHexString())
  refunded.escrow = event.address.toHexString()
  refunded.to = event.params.to
  refunded.token = event.params.token
  refunded.tokenId = event.params.tokenId
  refunded.amount = event.params.amount
  refunded.blockNumber = event.block.number
  refunded.blockTimestamp = event.block.timestamp
  refunded.transactionHash = event.transaction.hash
  refunded.save()
}

export function handleDisputed(event: DisputedEvent): void {
  let disputed = new Disputed(event.transaction.hash.toHexString())
  disputed.escrow = event.address.toHexString()
  disputed.disputeInitiator = event.params.disputeInitiator
  disputed.blockNumber = event.block.number
  disputed.blockTimestamp = event.block.timestamp
  disputed.transactionHash = event.transaction.hash
  disputed.save()
}

export function handleDisputeResolved(event: DisputeResolvedEvent): void {
  let disputeResolved = new DisputeResolved(event.transaction.hash.toHexString())
  disputeResolved.escrow = event.address.toHexString()
  disputeResolved.resolver = event.params.resolver
  disputeResolved.settled = event.params.settled
  disputeResolved.blockNumber = event.block.number
  disputeResolved.blockTimestamp = event.block.timestamp
  disputeResolved.transactionHash = event.transaction.hash
  disputeResolved.save()
}

export function handleEscapeAddressSet(event: EscapeAddressSetEvent): void {
  let escapeAddressSet = new EscapeAddressSet(event.transaction.hash.toHexString())
  escapeAddressSet.escrow = event.address.toHexString()
  escapeAddressSet.escapeAddress = event.params.escapeAddress
  escapeAddressSet.blockNumber = event.block.number
  escapeAddressSet.blockTimestamp = event.block.timestamp
  escapeAddressSet.transactionHash = event.transaction.hash
  escapeAddressSet.save()
}

export function handleEscaped(event: EscapedEvent): void {
  let escaped = new Escaped(event.transaction.hash.toHexString())
  escaped.escrow = event.address.toHexString()
  escaped.to = event.params.to
  escaped.token = event.params.token
  escaped.tokenId = event.params.tokenId
  escaped.amount = event.params.amount
  escaped.blockNumber = event.block.number
  escaped.blockTimestamp = event.block.timestamp
  escaped.transactionHash = event.transaction.hash
  escaped.save()
}
