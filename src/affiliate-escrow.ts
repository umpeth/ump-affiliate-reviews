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
} from "../generated/templates/AffiliateEscrow/AffiliateEscrow"
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
  ArbiterChange,
  Auction,
  AuctionHouse
} from "../generated/schema"
import { log, Address, Bytes } from "@graphprotocol/graph-ts"

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
  
  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Ensure the payer is consistent with the auction winner
      // FIX: Cast to non-null before using equals()
      if (auction.currentBidder !== null) {
        let currentBidder = auction.currentBidder as Bytes;
        if (!currentBidder.equals(event.params.payer)) {
        log.warning("Escrow payer does not match auction winner. Escrow: {}, Auction: {}", [
          orderEscrow.id,
          auction.id
        ])
      }
    }
      
      // Update auction with the settle deadline
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Updated auction escrow payer. Auction: {}, Payer: {}", [
        auction.id,
        event.params.payer.toHexString()
      ])
    }
  }

  payment.save()
}

export function handleAffiliateSettled(event: SettledEvent): void {
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

  // Update affiliate info in the escrow
  orderEscrow.affiliate = event.params.affiliate
  orderEscrow.affiliateShare = event.params.affiliateAmount
  
  // Check if this escrow is associated with an auction
  let isAuction = false
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      isAuction = true
      
      // Mark the auction as fully settled
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction payment settled. Auction: {}, Amount: {}, Affiliate: {}, AffiliateAmount: {}", [
        auction.id,
        event.params.amount.toString(),
        event.params.affiliate ? event.params.affiliate.toHexString() : "none",
        event.params.affiliateAmount.toString()
      ])
    }
  }
  
  if (!isAuction) {
    // If not an auction, check if it's a storefront order
    if (orderEscrow.order !== null) {
      // FIX: Cast to Bytes before using toHexString()
      let orderBytes = orderEscrow.order as Bytes;
      log.info("Storefront order settled. Order: {}, Amount: {}", [
        orderBytes.toHexString(),
        event.params.amount.toString()
      ])
    }
  }
  
  orderEscrow.save()
  entity.save()
}

export function handleRefunded(event: RefundedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

  orderEscrow.isRefunded = true
  
  // Check if this escrow is associated with an auction
  let isAuction = false
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      isAuction = true
      
      // Mark the auction as refunded in some way if needed
      auction.status = "CANCELLED" // or create a new status like "REFUNDED"
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction payment refunded. Auction: {}, Amount: {}, To: {}", [
        auction.id,
        event.params.amount.toString(),
        event.params.to.toHexString()
      ])
    }
  }
  
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
  
  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Track dispute in auction
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction payment disputed. Auction: {}, Initiator: {}", [
        auction.id,
        event.params.disputeInitiator.toHexString()
      ])
    }
  }
  
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
  
  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Track dispute removal in auction
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction payment dispute removed. Auction: {}, Remover: {}", [
        auction.id,
        event.params.disputeRemover.toHexString()
      ])
    }
  }
  
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

  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Track dispute resolution in auction
      // If settled=true, payment went to seller, if false it went to buyer
      if (event.params.settled) {
        // Payment went to seller
        auction.status = "COMPLETED"
      } else {
        // Payment went to buyer
        auction.status = "CANCELLED" // or "REFUNDED"
      }
      
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction payment dispute resolved. Auction: {}, Resolver: {}, Settled: {}", [
        auction.id,
        event.params.resolver.toHexString(),
        event.params.settled ? "true" : "false"
      ])
    }
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
  
  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Track escape address setting in auction metadata
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction escape address set. Auction: {}, EscapeAddress: {}", [
        auction.id,
        event.params.escapeAddress.toHexString()
      ])
    }
  }
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
  
  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Track escape in auction - maybe add a new status? TODO: fix this
      auction.status = "CANCELLED" // or "ESCAPED"
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction payment escaped. Auction: {}, To: {}, Amount: {}", [
        auction.id,
        event.params.to.toHexString(),
        event.params.amount.toString()
      ])
    }
  }
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
  arbiterChange.newArbiter = null
  arbiterChange.approved = false
  arbiterChange.approver = null
  arbiterChange.blockNumber = event.block.number
  arbiterChange.blockTimestamp = event.block.timestamp
  arbiterChange.transactionHash = event.transaction.hash
  arbiterChange.save()
  
  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Track arbiter change proposal in auction metadata
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction arbiter change proposed. Auction: {}, OldArbiter: {}, ProposedArbiter: {}", [
        auction.id,
        event.params.oldArbiter.toHexString(),
        event.params.proposedArbiter.toHexString()
      ])
    }
  }
}

export function handleArbiterChangeApproved(event: ArbiterChangeApprovedEvent): void {
  let orderEscrow = OrderEscrow.load(event.address.toHexString())
  if (orderEscrow === null) {
    return
  }

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
  
  // Check if this escrow is associated with an auction
  if (orderEscrow.auction !== null) {
    let auction = Auction.load(orderEscrow.auction as string)
    if (auction !== null) {
      // Update the auction arbiter
      auction.arbiter = event.params.newArbiter
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Auction arbiter changed. Auction: {}, NewArbiter: {}", [
        auction.id,
        event.params.newArbiter.toHexString()
      ])
    }
  }
}
