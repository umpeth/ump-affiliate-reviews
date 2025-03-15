import {
  PayerSet as PayerSetEvent,
  Settled as SettledEvent,
  Refunded as RefundedEvent,
  Disputed as DisputedEvent,
  DisputeResolved as DisputeResolvedEvent,
  EscapeAddressSet as EscapeAddressSetEvent,
  Escaped as EscapedEvent,
  DisputeRemoved as DisputeRemovedEvent,
  ArbiterChangeProposed as ArbiterChangeProposedEvent,
  ArbiterChangeApproved as ArbiterChangeApprovedEvent
} from "../generated/templates/SimpleEscrow/SimpleEscrow"
import {
  OrderEscrow,
  OrderPayment,
  Settled,
  Refunded,
  Disputed,
  DisputeRemoved,
  DisputeResolved,
  EscapeAddressSet,
  Escaped,
  OrderFulfilled,
  ArbiterChange
} from "../generated/schema"

export function handlePayerSet(event: PayerSetEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  let payment = new OrderPayment(event.transaction.hash.toHexString())
  payment.escrow = orderEscrow.id
  payment.payer = event.params.payer
  payment.settleDeadline = event.params.settleDeadline
  payment.blockNumber = event.block.number
  payment.blockTimestamp = event.block.timestamp
  payment.transactionHash = event.transaction.hash

  let orderFulfilled = OrderFulfilled.load(event.transaction.hash.toHexString())
  if (orderFulfilled !== null) {
    payment.orderFulfilled = orderFulfilled.id
    orderFulfilled.payment = payment.id
    orderFulfilled.save()
  }

  payment.save()
}

export function handleSettled(event: SettledEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  let entity = new Settled(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
  entity.escrow = orderEscrow.id
  entity.to = event.params.to
  entity.token = event.params.token
  entity.amount = event.params.amount
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save()
}


export function handleRefunded(event: RefundedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  orderEscrow.isRefunded = true
  orderEscrow.save()

  let entity = new Refunded(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
  entity.escrow = orderEscrow.id
  entity.to = event.params.to
  entity.token = event.params.token
  entity.amount = event.params.amount
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save()
}


export function handleDisputed(event: DisputedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  orderEscrow.isDisputed = true
  orderEscrow.save()

  let entity = new Disputed(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
  entity.escrow = orderEscrow.id
  entity.disputeInitiator = event.params.disputeInitiator
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save()
}

export function handleDisputeRemoved(event: DisputeRemovedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  orderEscrow.isDisputed = false
  orderEscrow.save()

  let entity = new DisputeRemoved(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
  entity.escrow = orderEscrow.id
  entity.disputeRemover = event.params.disputeRemover
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save()
}

export function handleDisputeResolved(event: DisputeResolvedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  let entity = new DisputeResolved(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
  entity.escrow = orderEscrow.id
  entity.resolver = event.params.resolver
  entity.settled = event.params.settled
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save()
}

export function handleEscapeAddressSet(event: EscapeAddressSetEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  let entity = new EscapeAddressSet(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
  entity.escrow = orderEscrow.id
  entity.escapeAddress = event.params.escapeAddress
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save()
}

export function handleEscaped(event: EscapedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  let entity = new Escaped(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
  entity.escrow = orderEscrow.id
  entity.to = event.params.to
  entity.token = event.params.token
  entity.amount = event.params.amount
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save()
}


export function handleArbiterChangeProposed(event: ArbiterChangeProposedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  let arbiterChange = new ArbiterChange(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  arbiterChange.escrow = orderEscrow.id
  arbiterChange.oldArbiter = event.params.oldArbiter
  arbiterChange.proposedArbiter = event.params.proposedArbiter
  arbiterChange.newArbiter = null // Will be set when approved
  arbiterChange.approved = false
  arbiterChange.approver = null
  arbiterChange.blockNumber = event.block.number
  arbiterChange.blockTimestamp = event.block.timestamp
  arbiterChange.transactionHash = event.transaction.hash
  arbiterChange.save()
}

export function handleArbiterChangeApproved(event: ArbiterChangeApprovedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  // Update the escrow's arbiter
  orderEscrow.arbiter = event.params.newArbiter
  orderEscrow.save()

  let arbiterChange = new ArbiterChange(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  arbiterChange.escrow = orderEscrow.id
  arbiterChange.oldArbiter = event.params.oldArbiter
  arbiterChange.proposedArbiter = event.params.newArbiter
  arbiterChange.newArbiter = event.params.newArbiter
  arbiterChange.approved = true
  arbiterChange.approver = event.params.approver
  arbiterChange.blockNumber = event.block.number
  arbiterChange.blockTimestamp = event.block.timestamp
  arbiterChange.transactionHash = event.transaction.hash
  arbiterChange.save()
}
