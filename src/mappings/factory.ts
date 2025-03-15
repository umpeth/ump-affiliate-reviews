import { BigInt, log } from '@graphprotocol/graph-ts'
import { StorefrontCreated } from '../../generated/StorefrontFactory/SimpleERC1155StorefrontFactoryV2'
import { StorefrontCreated as AffiliateStorefrontCreatedEvent } from '../../generated/AffiliateERC1155StorefrontFactory/AffiliateERC1155StorefrontFactory'
import { Storefront as StorefrontTemplate } from '../../generated/templates'
import { AffiliateERC1155Storefront as AffiliateStorefrontTemplate } from '../../generated/templates'
import { Storefront } from '../../generated/schema'

/**
 * Creates a storefront from a StorefrontCreated event
 * Common handler for all storefront factory types
 */
function createStorefront(
  storefrontAddress: Bytes,
  owner: Bytes, 
  erc1155Token: Bytes,
  escrowFactory: Bytes | null,
  affiliateVerifier: Bytes | null,
  isAffiliateEnabled: boolean,
  blockTimestamp: BigInt,
  blockNumber: BigInt,
  txHash: Bytes
): void {
  log.info("Creating storefront: {}", [storefrontAddress.toHexString()])
  
  let storefront = new Storefront(storefrontAddress)
  storefront.storefrontAddress = storefrontAddress
  storefront.owner = owner
  storefront.erc1155Token = erc1155Token
  
  // Set default values
  storefront.arbiter = Bytes.empty()
  storefront.minSettleTime = BigInt.zero()
  storefront.settleDeadline = BigInt.zero()
  storefront.ready = false
  storefront.seaport = Bytes.empty()
  
  // Set escrow factory
  if (escrowFactory) {
    storefront.escrowFactory = escrowFactory
  } else {
    storefront.escrowFactory = Bytes.empty()
  }
  
  // Set affiliate data
  storefront.isAffiliateEnabled = isAffiliateEnabled
  if (affiliateVerifier) {
    storefront.affiliateVerifier = affiliateVerifier
  } else {
    storefront.affiliateVerifier = Bytes.empty()
  }
  
  // Set creation metadata
  storefront.createdAt = blockTimestamp
  storefront.createdAtBlock = blockNumber
  storefront.creationTx = txHash
  
  // Initialize review stats
  storefront.totalRating = BigInt.fromI32(0)
  storefront.reviewCount = BigInt.fromI32(0)
  
  storefront.save()
  
  log.info("Created storefront: {}, Owner: {}, Affiliate Enabled: {}", [
    storefront.id.toHexString(),
    storefront.owner.toHexString(),
    storefront.isAffiliateEnabled ? "true" : "false"
  ])
}

/**
 * Handle storefront creation events from SimpleERC1155StorefrontFactoryV2
 */
export function handleStorefrontCreated(event: StorefrontCreated): void {
  // Create template instance to track events
  StorefrontTemplate.create(event.params.storefront)
  
  // Create the storefront entity
  createStorefront(
    event.params.storefront,
    event.params.owner,
    event.params.erc1155Token, 
    event.params.escrowFactory,
    null,  // No affiliate verifier for simple storefronts
    false, // Not affiliate enabled
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}

/**
 * Handle storefront creation events from AffiliateERC1155StorefrontFactory
 */
export function handleAffiliateStorefrontCreated(event: AffiliateStorefrontCreatedEvent): void {
  // Create template instance to track events
  AffiliateStorefrontTemplate.create(event.params.storefront)
  
  // Create the storefront entity
  createStorefront(
    event.params.storefront,
    event.params.owner,
    event.params.erc1155Token,
    event.params.escrowFactory,
    event.params.affiliateVerifier,
    true, // Affiliate enabled
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}
