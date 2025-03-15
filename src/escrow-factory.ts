import { log } from '@graphprotocol/graph-ts'
import { EscrowCreated as EscrowCreatedEvent } from "../generated/EscrowFactory/EscrowFactory"
import { OrderEscrow, Order } from "../generated/schema"
import { SimpleEscrow } from "../generated/templates"

/**
 * Handle escrow creation events from SimpleEscrowFactory
 */
export function handleEscrowCreated(event: EscrowCreatedEvent): void {
  log.info("Creating simple escrow: {}", [event.params.escrowAddress.toHexString()])
  
  let orderEscrow = new OrderEscrow(event.params.escrowAddress.toHexString())
  orderEscrow.escrowAddress = event.params.escrowAddress
  orderEscrow.payee = event.params.payee
  orderEscrow.storefront = event.params.storefront
  orderEscrow.arbiter = event.params.arbiter
  orderEscrow.isDisputed = false
  orderEscrow.isRefunded = false
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
  SimpleEscrow.create(event.params.escrowAddress)
  
  log.info("Created simple escrow: {}, Payee: {}", [
    orderEscrow.id,
    orderEscrow.payee.toHexString()
  ])
}
