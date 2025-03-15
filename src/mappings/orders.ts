import { log, Address, BigInt } from '@graphprotocol/graph-ts'
import { 
  StorefrontOrderFulfilled,
  StorefrontOrderFulfilled as StorefrontOrderFulfilledEvent
} from '../generated/templates/Storefront/SimpleERC1155StorefrontV2'
import { 
  StorefrontOrderFulfilled as AffiliateOrderFulfilledEvent 
} from '../generated/templates/AffiliateERC1155Storefront/AffiliateERC1155Storefront'
import { Order, Storefront, OrderEscrow } from '../generated/schema'

/**
 * Handle order fulfillment for regular storefronts (V2)
 */
export function handleStorefrontOrderFulfilled(event: StorefrontOrderFulfilledEvent): void {
  log.info("Processing order: {}", [event.transaction.hash.toHexString()])
  
  let storefront = Storefront.load(event.address)
  if (!storefront) {
    log.warning("Storefront not found: {}", [event.address.toHexString()])
    return
  }

  let order = new Order(event.transaction.hash)
  order.buyer = event.params.buyer
  order.seller = storefront.owner
  order.storefront = storefront.id
  order.tokenId = event.params.tokenId
  order.amount = event.params.amount
  order.timestamp = event.block.timestamp
  order.blockNumber = event.block.number
  
  // For simple orders, no escrow or affiliate
  order.escrowContract = null
  order.affiliate = null
  order.affiliateShare = 0
  
  order.save()
  
  log.info("Simple order saved: {}. Buyer: {}, Seller: {}", [
    order.id.toHexString(),
    order.buyer.toHexString(),
    order.seller.toHexString()
  ])owner
  order.storefront = storefront.id
  order.tokenId = event.params.tokenId
  order.amount = event.params.amount
  order.timestamp = event.block.timestamp
  order.blockNumber = event.block.number
  
  // Store escrow contract if available (for linking later)
  if (event.params.escrowContract) {
    order.escrowContract = event.params.escrowContract
    
    // Try to find and link the OrderEscrow
    let escrow = OrderEscrow.load(event.params.escrowContract.toHexString())
    if (escrow) {
      escrow.order = order.id
      escrow.save()
    }
  }
  
  // Initialize affiliate fields to null
  order.affiliate = null
  order.affiliateShare = 0
  
  order.save()
  
  log.info("Order saved: {}. Buyer: {}, Seller: {}", [
    order.id.toHexString(),
    order.buyer.toHexString(),
    order.seller.toHexString()
  ])
}

/**
 * Handle order fulfillment for affiliate-enabled storefronts
 */
export function handleAffiliateOrderFulfilled(event: AffiliateOrderFulfilledEvent): void {
  log.info("Processing affiliate order: {}", [event.transaction.hash.toHexString()])
  
  let storefront = Storefront.load(event.address)
  if (!storefront) {
    log.warning("Storefront not found: {}", [event.address.toHexString()])
    return
  }

  let order = new Order(event.transaction.hash)
  order.buyer = event.params.buyer
  order.seller = storefront.owner
  order.storefront = storefront.id
  order.tokenId = event.params.tokenId
  order.amount = event.params.amount
  order.timestamp = event.block.timestamp
  order.blockNumber = event.block.number
  
  // Store escrow contract
  order.escrowContract = event.params.escrowContract

  // Store affiliate information
  order.affiliate = event.params.affiliate
  order.affiliateShare = event.params.affiliateShare
  
  order.save()
  
  // Try to find and link the OrderEscrow
  let escrow = OrderEscrow.load(event.params.escrowContract.toHexString())
  if (escrow) {
    escrow.order = order.id
    escrow.save()
  }
  
  log.info("Affiliate order saved: {}. Buyer: {}, Seller: {}, Affiliate: {}", [
    order.id.toHexString(),
    order.buyer.toHexString(),
    order.seller.toHexString(),
    order.affiliate ? order.affiliate.toHexString() : "none"
  ])
}

/**
 * Handle order fulfillment for simple storefronts
 */
export function handleSimpleOrderFulfilled(event: StorefrontOrderFulfilledEvent): void {
  log.info("Processing simple order: {}", [event.transaction.hash.toHexString()])
  
  let storefront = Storefront.load(event.address)
  if (!storefront) {
    log.warning("Storefront not found: {}", [event.address.toHexString()])
    return
  }

  let order = new Order(event.transaction.hash)
  order.buyer = event.params.buyer
  order.seller = storefront.
