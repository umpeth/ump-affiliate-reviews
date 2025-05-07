import { BigInt, Bytes, log, ByteArray, crypto, json, JSONValue, TypedMap, Value } from "@graphprotocol/graph-ts"
import {
  Transfer as TransferEvent,
  ContractURIUpdated as ContractURIUpdatedEvent,
  OwnershipChanged as OwnershipChangedEvent,
  TokenMetadataUpdated as TokenMetadataUpdatedEvent
} from "../generated/templates/AuctionItemERC721/AuctionItemERC721"
import { AuctionItemERC721 as AuctionItemERC721Contract } from "../generated/templates/AuctionItemERC721/AuctionItemERC721"
import {
  AuctionItemERC721,
  AuctionItemERC721Token,
  AuctionItemERC721Metadata,
  Auction
} from "../generated/schema"

function parseTokenMetadata(uri: string): string {
  let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
  let metadata = AuctionItemERC721Metadata.load(id)
  
  if (metadata === null) {
    metadata = new AuctionItemERC721Metadata(id)
    metadata.rawJson = uri
    
    // Parse the base64-encoded JSON if it's a data URI
    if (uri.startsWith("data:application/json;base64,")) {
      let base64Data = uri.replace("data:application/json;base64,", "")
      // The Graph doesn't have base64 decoding built-in
      // We'll just store the raw data and extract what we can
      
      // For the raw JSON, we'll just store the base64-encoded data
      metadata.rawJson = base64Data
      
      // We'll try to extract some fields using string operations as a fallback
      // This is very brittle but better than nothing
      // Note: a proper implementation would decode base64 first
      
      // These simple extractions are just placeholders
      // They won't work well on base64 data
      let nameStart = uri.indexOf('"name":"')
      if (nameStart >= 0) {
        nameStart += 8 // Length of '"name":"'
        let nameEnd = uri.indexOf('"', nameStart)
        if (nameEnd > nameStart) {
          metadata.name = uri.substring(nameStart, nameEnd)
        }
      }
      
      let descStart = uri.indexOf('"description":"')
      if (descStart >= 0) {
        descStart += 15 // Length of '"description":"'
        let descEnd = uri.indexOf('"', descStart)
        if (descEnd > descStart) {
          metadata.description = uri.substring(descStart, descEnd)
        }
      }
      
      let imageStart = uri.indexOf('"image":"')
      if (imageStart >= 0) {
        imageStart += 9 // Length of '"image":"'
        let imageEnd = uri.indexOf('"', imageStart)
        if (imageEnd > imageStart) {
          metadata.image = uri.substring(imageStart, imageEnd)
        }
      }
      
      let tosStart = uri.indexOf('"trait_type":"Terms of Service"')
      if (tosStart >= 0) {
        let valueStart = uri.indexOf('"value":"', tosStart)
        if (valueStart >= 0) {
          valueStart += 9 // Length of '"value":"'
          let valueEnd = uri.indexOf('"', valueStart)
          if (valueEnd > valueStart) {
            metadata.termsOfService = uri.substring(valueStart, valueEnd)
          }
        }
      }
    } else {
      // Try to parse direct JSON string
      let jsonResult = json.try_fromString(uri)
      if (!jsonResult.isError && jsonResult.value.kind == 4) { // 4 = OBJECT
        let jsonObject = jsonResult.value.toObject()
        
        // Extract name
        let nameValue = jsonObject.get("name")
        if (nameValue !== null && nameValue.kind == 3) { // 3 = STRING
          metadata.name = nameValue.toString()
        }
        
        // Extract description
        let descValue = jsonObject.get("description")
        if (descValue !== null && descValue.kind == 3) { // 3 = STRING
          metadata.description = descValue.toString()
        }
        
        // Extract image
        let imageValue = jsonObject.get("image")
        if (imageValue !== null && imageValue.kind == 3) { // 3 = STRING
          metadata.image = imageValue.toString()
        }
        
        // Extract terms of service from attributes
        let attributesValue = jsonObject.get("attributes")
        if (attributesValue !== null && attributesValue.kind == 5) { // 5 = ARRAY
          let attributesArray = attributesValue.toArray()
          for (let i = 0; i < attributesArray.length; i++) {
            let attribute = attributesArray[i].toObject()
            let traitType = attribute.get("trait_type")
            let value = attribute.get("value")
            
            if (traitType !== null && traitType.kind == 3) { // 3 = STRING
              if (traitType.toString() == "Terms of Service" && value !== null && value.kind == 3) { // 3 = STRING
                metadata.termsOfService = value.toString()
              } else if (traitType.toString() == "Supplemental Images" && value !== null && value.kind == 5) { // 5 = ARRAY
                let images = value.toArray()
                let supplementalImages: string[] = []
                for (let j = 0; j < images.length; j++) {
                  if (images[j].kind == 3) { // 3 = STRING
                    supplementalImages.push(images[j].toString())
                  }
                }
                metadata.supplementalImages = supplementalImages
              }
            }
          }
        }
      }
    }
    
    metadata.save()
  }
  
  return id
}

export function handleTransfer(event: TransferEvent): void {
  let contract = AuctionItemERC721.load(event.address)
  if (contract === null) {
    log.warning("AuctionItemERC721 contract not found: {}", [event.address.toHexString()])
    return
  }
  
  let tokenId = event.address.toHexString() + "-" + event.params.tokenId.toString()
  let token = AuctionItemERC721Token.load(tokenId)
  
  if (token === null) {
    // Create new token entity if it doesn't exist (minting)
    token = new AuctionItemERC721Token(tokenId)
    token.contract = event.address
    token.tokenId = event.params.tokenId
    token.createdAt = event.block.timestamp
    token.createdAtBlock = event.block.number
    token.creationTx = event.transaction.hash
    
    // Try to get token metadata
    let tokenContract = AuctionItemERC721Contract.bind(event.address)
    let uriResult = tokenContract.try_tokenURI(event.params.tokenId)
    if (!uriResult.reverted) {
      let metadataId = parseTokenMetadata(uriResult.value)
      token.metadata = metadataId
    }
    
    // Try to get token metadata with alternative method
    let metadataResult = tokenContract.try_getTokenMetadata(event.params.tokenId)
    if (!metadataResult.reverted) {
      // If we have direct access to the metadata struct
      let structMetadata = metadataResult.value
      
      let metadataId = token.metadata
      if (metadataId) {
        let metadata = AuctionItemERC721Metadata.load(metadataId)
        if (metadata) {
          metadata.name = structMetadata.name
          metadata.description = structMetadata.description
          metadata.image = structMetadata.image
          metadata.termsOfService = structMetadata.termsOfService
          
          // Handle supplemental images if available
          if (structMetadata.supplementalImages.length > 0) {
            let images: string[] = []
            for (let i = 0; i < structMetadata.supplementalImages.length; i++) {
              images.push(structMetadata.supplementalImages[i])
            }
            metadata.supplementalImages = images
          }
          
          metadata.save()
        }
      }
    }
  }
  
  // Update token owner
  token.owner = event.params.to
  token.lastTransferredAt = event.block.timestamp
  token.lastTransferredTx = event.transaction.hash
  
  token.save()
  
  // Check if this token is involved in any auctions
  // Check for active auctions directly instead of using token relationship
  let contractAddressHex = event.address.toHexString()
  let tokenIdNum = event.params.tokenId
  
  // Only check transfers (not mints)
  if (!event.params.from.equals(Bytes.fromHexString("0x0000000000000000000000000000000000000000"))) {
    // Look for auctions for this token by manually constructing potential IDs
    // inefficient but works better than trying to use relationships
    for (let i = 0; i < 5; i++) {
      let possibleAuctionId = "0x" + i.toString(16).padStart(40, '0') + "-" + tokenIdNum.toString()
      let auction = Auction.load(possibleAuctionId)
      
      if (auction !== null && 
          auction.tokenContract.toHexString() == contractAddressHex && 
          auction.tokenId.equals(tokenIdNum) &&
          auction.status == "ACTIVE") {
        // If an active auction's NFT was transferred outside the auction system
        // This could indicate a problem - mark it in some way
        log.warning("Token transferred during active auction: {}, Token: {}", [
          auction.id,
          tokenId
        ])
      }
    }
  }
  
  log.info("Token transferred: {}, From: {}, To: {}", [
    tokenId,
    event.params.from.toHexString(),
    event.params.to.toHexString()
  ])
}

export function handleContractURIUpdated(event: ContractURIUpdatedEvent): void {
  let contract = AuctionItemERC721.load(event.address)
  if (contract === null) {
    log.warning("AuctionItemERC721 contract not found for URI update: {}", [event.address.toHexString()])
    return
  }
  
  contract.contractURI = event.params.newURI
  contract.lastUpdatedAt = event.block.timestamp
  contract.lastUpdatedTx = event.transaction.hash
  
  contract.save()
  
  log.info("Contract URI updated for: {}, New URI: {}", [
    event.address.toHexString(),
    event.params.newURI
  ])
}

export function handleOwnershipChanged(event: OwnershipChangedEvent): void {
  let contract = AuctionItemERC721.load(event.address)
  if (contract === null) {
    log.warning("AuctionItemERC721 contract not found for ownership change: {}", [event.address.toHexString()])
    return
  }
  
  contract.owner = event.params.newOwner
  contract.lastUpdatedAt = event.block.timestamp
  contract.lastUpdatedTx = event.transaction.hash
  
  contract.save()
  
  log.info("Ownership changed for: {}, Old owner: {}, New owner: {}", [
    event.address.toHexString(),
    event.params.previousOwner.toHexString(),
    event.params.newOwner.toHexString()
  ])
}

// Handle the new TokenMetadataUpdated event
export function handleTokenMetadataUpdated(event: TokenMetadataUpdatedEvent): void {
  let contract = AuctionItemERC721.load(event.address)
  if (contract === null) {
    log.warning("AuctionItemERC721 contract not found for metadata update: {}", [event.address.toHexString()])
    return
  }
  
  let tokenId = event.address.toHexString() + "-" + event.params.tokenId.toString()
  let token = AuctionItemERC721Token.load(tokenId)
  
  if (token === null) {
    // If the token doesn't exist, create it
    token = new AuctionItemERC721Token(tokenId)
    token.contract = event.address
    token.tokenId = event.params.tokenId
    token.owner = Bytes.fromHexString("0x0000000000000000000000000000000000000000") // Will be updated on Transfer
    token.createdAt = event.block.timestamp
    token.createdAtBlock = event.block.number
    token.creationTx = event.transaction.hash
  }
  
  // Create or update the metadata entity
  let metadataId = crypto.keccak256(ByteArray.fromUTF8(
    event.params.tokenId.toString() + "-" + event.block.timestamp.toString()
  )).toHexString()
  
  let metadata = new AuctionItemERC721Metadata(metadataId)
  metadata.name = event.params.name
  metadata.description = event.params.description
  metadata.image = event.params.image
  metadata.termsOfService = event.params.termsOfService
  
  // We don't have the supplemental images in the event TODO: fix this
  let supplementalImages: string[] = []
  metadata.supplementalImages = supplementalImages
  
  // Generate a placeholder for rawJson that includes the important fields
  metadata.rawJson = `{"name":"${event.params.name}","description":"${event.params.description}","image":"${event.params.image}","attributes":[{"trait_type":"Terms of Service","value":"${event.params.termsOfService}"}]}`
  
  metadata.save()
  
  // Link the metadata to the token
  token.metadata = metadataId
  token.lastTransferredAt = event.block.timestamp
  token.lastTransferredTx = event.transaction.hash
  
  token.save()
  
  // Check if any auctions reference this token and update them
  let contractAddressHex = event.address.toHexString()
  let tokenIdNum = event.params.tokenId
  
  for (let i = 0; i < 5; i++) {
    let possibleAuctionId = "0x" + i.toString(16).padStart(40, '0') + "-" + tokenIdNum.toString()
    let auction = Auction.load(possibleAuctionId)
    
    if (auction !== null && 
        auction.tokenContract.toHexString() == contractAddressHex && 
        auction.tokenId.equals(tokenIdNum)) {
      auction.tokenMetadata = metadataId
      auction.lastUpdatedAt = event.block.timestamp
      auction.lastUpdatedTx = event.transaction.hash
      auction.save()
      
      log.info("Updated auction metadata reference: {}, Token: {}", [
        auction.id,
        tokenId
      ])
    }
  }
  
  log.info("Token metadata updated: {}, Name: {}", [
    tokenId,
    event.params.name
  ])
}
