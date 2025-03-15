import { log } from '@graphprotocol/graph-ts'
import { AffiliateEscrowCreated as AffiliateEscrowCreatedEvent } from "../generated/AffiliateEscrowFactory/AffiliateEscrowFactory"
import { OrderEscrow, Order } from "../generated/schema"
import { AffiliateEscrow } from "../generated/templates"

/**
 * Handle escrow creation events from AffiliateEscrowFactory
 */
export function handleAffiliateEscrowCreated(event: AffiliateEscrowCreatedEvent): void {
  log.info("Creating affiliate escrow: {}", [event.params.escrowAddress.toHexString()])
  
  let orderEscrow = new OrderEscrow(event.params.escrowAddress.toHexString())
  orderEscrow.escrowAddress = event.params.escrowAddress
  orderEscrow.payee = event.params.payee
  orderEscrow.storefront = event.params.storefront
  orderEscrow.arbiter = event.params.arbiter
  orderEscrow.isDisputed = false
  orderEscrow.isRefunded = false
  
  // Initialize affiliate fields
  orderEscrow.affiliate = null
  orderEscrow.affiliateShare = 0
  
  orderEscrow.blockNumber = event.block.number
  orderEscrow.blockTimestamp = event.block.timestamp
  orderEscrow.transactionHash = event.transaction.hash
  
  // Initialize order reference to null
  orderEscrow.order = null
  
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
  
  log.info("Created affiliate escrow: {}, Payee: {}", [
    orderEscrow.id,
    orderEscrow.payee.toHexString()
  ])
}
