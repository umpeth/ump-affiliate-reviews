import { log, BigInt } from '@graphprotocol/graph-ts'
import { AffiliateEscrowCreated as AffiliateEscrowCreatedEvent } from "../generated/AffiliateEscrowFactory/AffiliateEscrowFactory"
import { OrderEscrow, Order, Storefront, AuctionHouse, Auction } from "../generated/schema"
import { AffiliateEscrow } from "../generated/templates"

/**
 * Handle escrow creation events from AffiliateEscrowFactory
 */
export function handleAffiliateEscrowCreated(event: AffiliateEscrowCreatedEvent): void {
  log.info("Creating affiliate escrow: {}", [event.params.escrowAddress.toHexString()])
  
  let orderEscrow = new OrderEscrow(event.params.escrowAddress.toHexString())
  orderEscrow.escrowAddress = event.params.escrowAddress
  orderEscrow.payee = event.params.payee
  orderEscrow.sourceAddress = event.params.storefront
  orderEscrow.arbiter = event.params.arbiter
  orderEscrow.isDisputed = false
  orderEscrow.isRefunded = false
  
  // Determine if this escrow is for a storefront or an auction house
  let storefront = Storefront.load(event.params.storefront)
  let auctionHouse = AuctionHouse.load(event.params.storefront)
  
  if (storefront !== null) {
    orderEscrow.sourceType = "STOREFRONT"
    log.info("Escrow created for storefront: {}", [event.params.storefront.toHexString()])
  } else if (auctionHouse !== null) {
    orderEscrow.sourceType = "AUCTION_HOUSE"
    log.info("Escrow created for auction house: {}", [event.params.storefront.toHexString()])
    
    // The TypedMap access approach was incorrect
    // Instead, manually check for auctions in the same transaction
    // Just look for auctions created in the same transaction
    let auctionIdPrefix = auctionHouse.id.toHexString() + "-"
    
    // Try a few recent auction IDs based on timestamp
    for (let i = 0; i < 10; i++) {
      let possibleAuctionId = auctionIdPrefix + i.toString()
      let possibleAuction = Auction.load(possibleAuctionId)
      if (possibleAuction && possibleAuction.creationTx.equals(event.transaction.hash)) {
        orderEscrow.auction = possibleAuction.id
        
        // Update the auction with the escrow reference
        possibleAuction.escrowAddress = event.params.escrowAddress
        possibleAuction.escrow = orderEscrow.id
        possibleAuction.save()
        
        log.info("Linked escrow to auction: {}", [possibleAuction.id])
        break
      }
    }
  } else {
    // Default to storefront if we can't determine the type
    log.warning("Could not determine source type for escrow: {}, source: {}", [
      event.params.escrowAddress.toHexString(),
      event.params.storefront.toHexString()
    ])
    orderEscrow.sourceType = "STOREFRONT"
  }
  
  // Initialize affiliate fields
  orderEscrow.affiliate = null
  orderEscrow.affiliateShare = BigInt.fromI32(0)
  
  orderEscrow.blockNumber = event.block.number
  orderEscrow.blockTimestamp = event.block.timestamp
  orderEscrow.transactionHash = event.transaction.hash
  
  // Initialize references to null
  orderEscrow.order = null
  // Note: auction is already set above if it's an auction escrow
  
  // See if we can find an order that references this escrow
  // The order creation might happen in the same transaction as this event
  let pendingOrder = Order.load(event.transaction.hash)
  if (pendingOrder !== null) {
    orderEscrow.order = pendingOrder.id
    log.info("Linked escrow to order in same transaction: {}", [pendingOrder.id.toHexString()])
  }
  
  orderEscrow.save()
  
  // Create tracking template
  AffiliateEscrow.create(event.params.escrowAddress)
  
  log.info("Created affiliate escrow: {}, Payee: {}, Source: {}, Type: {}", [
    orderEscrow.id,
    orderEscrow.payee.toHexString(),
    orderEscrow.sourceAddress.toHexString(),
    orderEscrow.sourceType
  ])
}
