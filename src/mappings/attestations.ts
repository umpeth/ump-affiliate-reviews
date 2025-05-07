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

import { SaleAttestation, Review, Order, Storefront, OrderEscrow, Auction, AuctionHouse } from '../../generated/schema'
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

  // Look up the order or auction using transaction hash
  let order = Order.load(event.params.transactionHash)
  let escrowEntity = OrderEscrow.load(event.params.escrowContract.toHexString())
  
  if (escrowEntity === null) {
    log.error("Escrow contract not found: {}", [event.params.escrowContract.toHexString()])
    return
  }

  // Create the sale attestation entity
  let attestation = new SaleAttestation(event.params.uid)
  attestation.transactionHash = event.params.transactionHash
  attestation.attestationTxHash = event.transaction.hash
  attestation.buyer = event.params.buyer
  attestation.seller = event.params.seller
  attestation.escrowContract = event.params.escrowContract.toHexString()
  attestation.storefrontContract = event.params.storefrontContract
  attestation.timestamp = event.block.timestamp
  attestation.blockNumber = event.block.number
  
  // Check if this is for a storefront or auction
  if (order !== null) {
    // This is for a storefront order
    attestation.order = order.id
    attestation.storefront = order.storefront
    
    // Determine if this is the latest attestation based on timestamp
    let isLatest = true
    
    // If there's already a latest attestation ID stored in the order
    if (order.latestAttestationId) {
      let currentLatestId = order.latestAttestationId as Bytes
      let currentLatest = SaleAttestation.load(currentLatestId)
      if (currentLatest) {
        isLatest = event.block.timestamp.gt(currentLatest.timestamp)
      }
    }
    
    // Set the isLatest flag based on our determination
    attestation.isLatest = isLatest
    
    // If this is the latest attestation, update the order
    if (isLatest) {
      order.latestAttestationId = event.params.uid
      order.latestAttestationTimestamp = event.block.timestamp
      
      // Check if we need to update the order with the correct buyer
      if (!order.buyer.equals(event.params.buyer)) {
        log.warning(
          "Buyer mismatch detected! Order buyer: {}, Attestation buyer: {}. Fixing...",
          [order.buyer.toHexString(), event.params.buyer.toHexString()]
        )
        
        // Update the order with the correct buyer from the attestation
        order.buyer = event.params.buyer
      }
      
      order.save()
      log.info("Updated order with latest attestation ID: {}", [event.params.uid.toHexString()])
    }
  } else if (escrowEntity.auction !== null) {
    // This is for an auction
    let auction = Auction.load(escrowEntity.auction as string)
    if (auction !== null) {
      attestation.storefront = auction.auctionHouse // Using auctionHouse as storefront for consistency
      
      // For auctions, we typically only have one attestation per auction
      attestation.isLatest = true
      
      // Record the attestation in the auction entity if needed
      // Fix null check to handle Bytes | null properly
      if (auction.currentBidder !== null) {
        let currentBidder = auction.currentBidder as Bytes
        if (!currentBidder.equals(event.params.buyer)) {
          log.warning(
            "Buyer mismatch detected! Auction winner: {}, Attestation buyer: {}. Fixing...",
            [currentBidder.toHexString(), event.params.buyer.toHexString()]
          )
        }
      }
      
      // Update auction with attestation information
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Created auction attestation - Auction: {}, UID: {}", [
        auction.id,
        attestation.id.toHexString()
      ])
    }
  } else {
    log.warning("Neither order nor auction found for sale attestation: {}", [
      event.params.transactionHash.toHexString()
    ])
    // Still proceed with creating the attestation
    attestation.storefront = event.params.storefrontContract
    attestation.isLatest = true
  }

  // Try to get the fee paid for this attestation from the transaction
  let txGasPrice = event.transaction.gasPrice
  attestation.attestationFee = txGasPrice

  attestation.save()

  // Update the escrow entity's order/auction reference if needed
  if (escrowEntity.order === null && order !== null) {
    escrowEntity.order = order.id
    escrowEntity.save()
    log.info("Linked escrow contract to order: {}", [escrowEntity.id])
  }

  log.info("Created sale attestation - UID: {}, IsLatest: {}", [
    attestation.id.toHexString(),
    attestation.isLatest.toString()
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

  // Determine if this is for a storefront or auction house
  let storefrontEntity: Storefront | null = null
  let auctionHouseEntity: AuctionHouse | null = null
  
  if (saleAttestation.order !== null) {
    // This is for a storefront
    let order = Order.load(saleAttestation.order)
    if (order !== null) {
      storefrontEntity = Storefront.load(order.storefront)
    }
  } else {
    // Check if this is for an auction house
    auctionHouseEntity = AuctionHouse.load(saleAttestation.storefront)
  }
  
  if (storefrontEntity === null && auctionHouseEntity === null) {
    log.error("Neither storefront nor auction house found for review. Storefront/AuctionHouse ID: {}", [
      saleAttestation.storefront.toHexString()
    ])
    return
  }
  
  // Create the review entity
  let review = new Review(event.params.reviewUID)
  review.saleAttestation = event.params.saleUID
  review.reviewer = event.params.reviewer
  review.reviewType = event.params.reviewer.equals(saleAttestation.buyer) ? "buyer" : "seller"
  review.storefront = saleAttestation.storefront // This can be either storefront or auction house address
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
    if (storefrontEntity !== null) {
      // Update rating totals for storefront
      let newTotalRating = storefrontEntity.totalRating.plus(BigInt.fromI32(review.overallRating))
      let newReviewCount = storefrontEntity.reviewCount.plus(BigInt.fromI32(1))
      
      storefrontEntity.totalRating = newTotalRating
      storefrontEntity.reviewCount = newReviewCount
      storefrontEntity.save()
      
      log.info("Updated storefront review stats - ID: {}, Total: {}, Count: {}", [
        storefrontEntity.id.toHexString(),
        storefrontEntity.totalRating.toString(),
        storefrontEntity.reviewCount.toString()
      ]);
    } else if (auctionHouseEntity !== null) {
      // For auction houses, we could track review stats similar to storefronts
      // This would require adding totalRating and reviewCount fields to AuctionHouse entity
      // For now, just log that this is an auction house review
      log.info("Review submitted for auction house: {}, Rating: {}/5", [
        auctionHouseEntity.id.toHexString(),
        review.overallRating.toString()
      ]);
      
      // If in the future we add review stats to AuctionHouse entity, update them here
      // Example:
      // auctionHouseEntity.totalRating = auctionHouseEntity.totalRating.plus(BigInt.fromI32(review.overallRating))
      // auctionHouseEntity.reviewCount = auctionHouseEntity.reviewCount.plus(BigInt.fromI32(1))
      // auctionHouseEntity.save()
    }
  }

  log.info("Created review - UID: {}, Type: {}, Rating: {}/5", [
    review.id.toHexString(),
    review.reviewType,
    review.overallRating.toString()
  ])
}
