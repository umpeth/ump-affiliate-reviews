import { BigInt, Address, Bytes, store, log } from "@graphprotocol/graph-ts"
import {
  CurationCreated as CurationCreatedEvent,
  CuratorAdded as CuratorAddedEvent,
  CuratorRemoved as CuratorRemovedEvent,
  ListingCurated as ListingCuratedEvent,
  ListingUpdated as ListingUpdatedEvent,
  PaymentAddressUpdated as PaymentAddressUpdatedEvent,
  MetadataUpdated as MetadataUpdatedEvent,
  Transfer as TransferEvent
} from "../generated/CurationStorefront/CurationStorefront"
import { 
  CurationStorefront, 
  Curator, 
  CuratorAction,
  CurationListing, 
  Storefront,
  TokenListing
} from "../generated/schema"

export function handleCurationCreated(event: CurationCreatedEvent): void {
  let curationId = event.params.curationId.toString()
  let curation = new CurationStorefront(curationId)
  
  curation.name = event.params.name
  curation.description = event.params.description
  curation.paymentAddress = event.params.paymentAddress
  curation.owner = event.transaction.from
  curation.createdAt = event.block.timestamp
  curation.createdTxHash = event.transaction.hash
  
  curation.save()
  
  // Also create the initial curator (the owner)
  let curatorId = curationId + "-" + event.transaction.from.toHexString()
  let curator = new Curator(curatorId)
  curator.curation = curationId
  curator.curator = event.transaction.from
  curator.isActive = true
  curator.addedAt = event.block.timestamp
  curator.addedTxHash = event.transaction.hash
  curator.save()
  
  // Create a curator action record
  let actionId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let action = new CuratorAction(actionId)
  action.curation = curationId
  action.curator = curatorId
  action.actionType = "ADDED"
  action.timestamp = event.block.timestamp
  action.transactionHash = event.transaction.hash
  action.save()
  
  log.info("Created curation: {}, Owner: {}", [
    curationId,
    event.transaction.from.toHexString()
  ])
}

export function handleCuratorAdded(event: CuratorAddedEvent): void {
  let curationId = event.params.curationId.toString()
  let curatorAddress = event.params.curator
  let curatorId = curationId + "-" + curatorAddress.toHexString()
  
  // Check if curator already exists
  let curator = Curator.load(curatorId)
  
  if (curator === null) {
    // Create new curator
    curator = new Curator(curatorId)
    curator.curation = curationId
    curator.curator = curatorAddress
    curator.addedAt = event.block.timestamp
    curator.addedTxHash = event.transaction.hash
  } else if (!curator.isActive) {
    // If reactivating a previously removed curator
    curator.addedAt = event.block.timestamp
    curator.addedTxHash = event.transaction.hash
  }
  
  curator.isActive = true
  curator.removedAt = null
  curator.removedTxHash = null
  curator.save()
  
  // Create a curator action record
  let actionId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let action = new CuratorAction(actionId)
  action.curation = curationId
  action.curator = curatorId
  action.actionType = "ADDED"
  action.timestamp = event.block.timestamp
  action.transactionHash = event.transaction.hash
  action.save()
  
  log.info("Added curator: {} to curation: {}", [
    curatorAddress.toHexString(),
    curationId
  ])
}

export function handleCuratorRemoved(event: CuratorRemovedEvent): void {
  let curationId = event.params.curationId.toString()
  let curatorAddress = event.params.curator
  let curatorId = curationId + "-" + curatorAddress.toHexString()
  
  let curator = Curator.load(curatorId)
  if (curator !== null) {
    curator.isActive = false
    curator.removedAt = event.block.timestamp
    curator.removedTxHash = event.transaction.hash
    curator.save()
    
    // Create a curator action record
    let actionId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    let action = new CuratorAction(actionId)
    action.curation = curationId
    action.curator = curatorId
    action.actionType = "REMOVED"
    action.timestamp = event.block.timestamp
    action.transactionHash = event.transaction.hash
    action.save()
    
    log.info("Removed curator: {} from curation: {}", [
      curatorAddress.toHexString(),
      curationId
    ])
  }
}

export function handleListingCurated(event: ListingCuratedEvent): void {
  let curationId = event.params.curationId.toString()
  let listingId = event.params.listingId
  let id = curationId + "-" + listingId.toString()
  let storefrontAddress = event.params.storefrontAddress
  let tokenId = event.params.tokenId
  
  // First check if the referenced storefront exists - Note: Using Bytes for entity IDs
  let storefrontId = storefrontAddress.toHexString()
  let storefront = Storefront.load(Bytes.fromHexString(storefrontId))
  
  if (storefront === null) {
    log.warning("Storefront not found: {}", [storefrontId])
    return
  }
  
  // Create the curation listing
  let curationListing = new CurationListing(id)
  curationListing.curation = curationId
  curationListing.listingId = listingId
  curationListing.storefront = storefrontAddress // Storing the actual Bytes address
  curationListing.tokenId = tokenId
  curationListing.active = true
  curationListing.createdAt = event.block.timestamp
  curationListing.createdTxHash = event.transaction.hash
  
  // Try to find the original token listing to mirror its data
  let tokenListingId = storefrontAddress.toHexString() + "-" + tokenId.toString()
  let tokenListing = TokenListing.load(tokenListingId)
  
  if (tokenListing !== null) {
    curationListing.price = tokenListing.price
    curationListing.paymentToken = tokenListing.paymentToken
    curationListing.affiliateFee = tokenListing.affiliateFee
    curationListing.tokenURI = tokenListing.tokenURI
    curationListing.contractURI = tokenListing.contractURI
    curationListing.erc1155Token = storefront.erc1155Token
    
    if (tokenListing.tokenMetadata) {
      curationListing.tokenMetadata = tokenListing.tokenMetadata
    }
    
    if (tokenListing.contractMetadata) {
      curationListing.contractMetadata = tokenListing.contractMetadata
    }
  } else {
    log.warning("Original token listing not found: {}", [tokenListingId])
    curationListing.erc1155Token = storefront.erc1155Token
  }
  
  curationListing.save()
  
  log.info("Added listing: {} to curation: {}, Storefront: {}, TokenId: {}", [
    listingId.toString(),
    curationId,
    storefrontAddress.toHexString(),
    tokenId.toString()
  ])
}

export function handleListingUpdated(event: ListingUpdatedEvent): void {
  let curationId = event.params.curationId.toString()
  let listingId = event.params.listingId
  let id = curationId + "-" + listingId.toString()
  
  let curationListing = CurationListing.load(id)
  if (curationListing !== null) {
    curationListing.active = event.params.active
    curationListing.lastUpdatedAt = event.block.timestamp
    curationListing.lastUpdatedTxHash = event.transaction.hash
    
    // If the listing was updated, we might want to refresh the token data
    // because the original listing might have been updated too
    if (curationListing.storefront && curationListing.tokenId) {
      let storefrontAddress = curationListing.storefront
      let tokenId = curationListing.tokenId
      let tokenListingId = storefrontAddress.toHexString() + "-" + tokenId.toString()
      let tokenListing = TokenListing.load(tokenListingId)
      
      if (tokenListing !== null) {
        curationListing.price = tokenListing.price
        curationListing.paymentToken = tokenListing.paymentToken
        curationListing.affiliateFee = tokenListing.affiliateFee
        
        if (tokenListing.tokenMetadata) {
          curationListing.tokenMetadata = tokenListing.tokenMetadata
        }
      }
    }
    
    curationListing.save()
    
    log.info("Updated listing: {} in curation: {}, Active: {}", [
      listingId.toString(),
      curationId,
      event.params.active.toString()
    ])
  }
}

export function handlePaymentAddressUpdated(event: PaymentAddressUpdatedEvent): void {
  let curationId = event.params.curationId.toString()
  let curation = CurationStorefront.load(curationId)
  
  if (curation !== null) {
    curation.paymentAddress = event.params.newAddress
    curation.save()
    
    log.info("Updated payment address for curation: {}, New Address: {}", [
      curationId,
      event.params.newAddress.toHexString()
    ])
  }
}

export function handleMetadataUpdated(event: MetadataUpdatedEvent): void {
  let curationId = event.params.curationId.toString()
  let curation = CurationStorefront.load(curationId)
  
  if (curation !== null) {
    curation.tokenURI = event.params.newTokenURI
    curation.save()
    
    log.info("Updated metadata for curation: {}", [curationId])
  }
}

// Handle transfer events to update ownership
export function handleTransfer(event: TransferEvent): void {
  let tokenId = event.params.tokenId.toString()
  let curation = CurationStorefront.load(tokenId)
  
  if (curation !== null) {
    curation.owner = event.params.to
    curation.save()
    
    log.info("Transferred curation: {} from: {} to: {}", [
      tokenId,
      event.params.from.toHexString(),
      event.params.to.toHexString()
    ])
  } else if (event.params.from == Address.zero()) {
    // This is a mint event but we didn't catch it with CurationCreated
    // This could happen if there was an issue with the event indexing
    log.warning("Transfer event detected for unknown curation: {}", [tokenId])
  }
}
