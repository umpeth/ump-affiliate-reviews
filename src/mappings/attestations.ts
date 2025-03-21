import { BigInt, Bytes, log } from '@graphprotocol/graph-ts'

/**
 * Safely get a string representation of an address that might be null
 */
function safeAddressToString(address: Bytes | null): string {
  if (address === null) {
    return "null";
  }
  return address.toHexString();
}

import { SaleAttestation, Review, Order, Storefront, OrderEscrow } from '../../generated/schema'
import { ReviewSubmitted } from '../../generated/ReviewResolver/ReviewResolver'
import { SaleAttested } from '../../generated/SaleResolver/SaleAttestationResolver'

/**
 * Handle sale attestation events from the SaleAttestationResolver
 */
export function handleSaleAttested(event: SaleAttested): void {
  log.info("Processing sale attestation - UID: {}, Seller: {}, Buyer: {}, TX Hash: {}", [
    event.params.uid.toHexString(),
    event.params.seller.toHexString(), 
    event.params.buyer.toHexString(),
    event.params.transactionHash.toHexString()
  ])

  // Look up the order using transaction hash
  let order = Order.load(event.params.transactionHash)
  if (order === null) {
    log.error("Order not found for sale attestation. TX Hash: {}", [
      event.params.transactionHash.toHexString()
    ])
    return
  }

  // Get the OrderEscrow entity - we need to make sure it exists before creating the attestation
  let escrowEntity = OrderEscrow.load(event.params.escrowContract.toHexString())
  if (escrowEntity === null) {
    log.error("Escrow contract not found: {}", [event.params.escrowContract.toHexString()])
    return
  }

  // Set all existing attestations for this order to isLatest = false
  let existingAttestations = SaleAttestation.load(event.params.uid)
  

  // Create the sale attestation entity
  let attestation = new SaleAttestation(event.params.uid)
  attestation.transactionHash = event.params.transactionHash
  attestation.attestationTxHash = event.transaction.hash
  attestation.order = order.id
  attestation.buyer = event.params.buyer
  attestation.seller = event.params.seller
  attestation.storefront = order.storefront
  attestation.escrowContract = event.params.escrowContract.toHexString() // Reference the OrderEscrow entity by ID
  attestation.storefrontContract = event.params.storefrontContract
  attestation.timestamp = event.block.timestamp
  attestation.blockNumber = event.block.number
  
  // Set as the latest attestation for this order
  attestation.isLatest = true
  
  // Try to get the fee paid for this attestation from the transaction
  let txGasPrice = event.transaction.gasPrice
  attestation.attestationFee = txGasPrice

  attestation.save()

  // Check if we need to update the order with the correct buyer
  if (!order.buyer.equals(event.params.buyer)) {
    log.warning(
      "Buyer mismatch detected! Order buyer: {}, Attestation buyer: {}. Fixing...",
      [order.buyer.toHexString(), event.params.buyer.toHexString()]
    );
    
    // Update the order with the correct buyer from the attestation
    order.buyer = event.params.buyer;
    order.save();
    
    log.info("Order buyer field updated to: {}", [order.buyer.toHexString()]);
  }

  // We've already checked that the escrow contract exists 
  // and we've linked the attestation to it.
  // Now update the order field on the escrow if it's not already set
  if (escrowEntity.order === null) {
    escrowEntity.order = order.id
    escrowEntity.save()
    log.info("Linked escrow contract to order: {}", [escrowEntity.id])
  }

  log.info("Created sale attestation - UID: {}, Order ID: {}, Buyer: {}, Seller: {}, Storefront: {}", [
    attestation.id.toHexString(),
    order.id.toHexString(), 
    attestation.buyer.toHexString(),
    attestation.seller.toHexString(),
    attestation.storefront.toHexString()
  ])
}

/**
 * Handle review submission events from the ReviewResolver
 */
export function handleReviewSubmitted(event: ReviewSubmitted): void {
  log.info("Processing review - UID: {}, Sale UID: {}, Reviewer: {}, Recipient: {}", [
    event.params.reviewUID.toHexString(),
    event.params.saleUID.toHexString(),
    event.params.reviewer.toHexString(),
    event.params.recipient.toHexString()
  ])

  // Look up the sale attestation first
  let saleAttestation = SaleAttestation.load(event.params.saleUID)
  if (saleAttestation === null) {
    log.error("Sale attestation not found for review. Sale UID: {}", [
      event.params.saleUID.toHexString()
    ])
    return
  }

  // Load the storefront to connect the review
  let order = Order.load(saleAttestation.order)
  if (order === null) {
    log.error("Order not found for review. Order ID: {}", [
      saleAttestation.order.toHexString()
    ])
    return
  }

  let storefront = Storefront.load(order.storefront)
  if (storefront === null) {
    log.error("Storefront not found for review. Storefront ID: {}", [
      order.storefront.toHexString()
    ])
    return
  }
  
  // Create the review entity
  let review = new Review(event.params.reviewUID)
  review.saleAttestation = event.params.saleUID
  review.reviewer = event.params.reviewer
  review.reviewType = event.params.reviewer.equals(saleAttestation.buyer) ? "buyer" : "seller"
  review.storefront = order.storefront
  review.overallRating = event.params.overallRating
  review.qualityRating = event.params.qualityRating
  review.communicationRating = event.params.communicationRating
  review.deliveryRating = event.params.deliveryRating 
  review.packagingRating = event.params.packagingRating
  review.asDescribed = event.params.asDescribed
  review.reviewText = event.params.reviewText
  review.timestamp = event.block.timestamp
  review.blockNumber = event.block.number
  
  // Add the new transaction hash fields
  review.attestationTxHash = event.transaction.hash
  review.transactionHash = saleAttestation.transactionHash

  review.save()

  // Update storefront stats (only for buyer reviews)
  if (review.reviewType == "buyer") {
    // Update rating totals
    let newTotalRating = storefront.totalRating.plus(BigInt.fromI32(review.overallRating))
    let newReviewCount = storefront.reviewCount.plus(BigInt.fromI32(1))
    
    storefront.totalRating = newTotalRating
    storefront.reviewCount = newReviewCount
    storefront.save()
    
    log.info("Updated storefront review stats - ID: {}, Total: {}, Count: {}", [
      storefront.id.toHexString(),
      storefront.totalRating.toString(),
      storefront.reviewCount.toString()
    ]);
  }

  log.info("Created review - UID: {}, Type: {}, Rating: {}/5", [
    review.id.toHexString(),
    review.reviewType,
    review.overallRating.toString()
  ])
}
