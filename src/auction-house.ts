import { BigInt, Bytes, log, ByteArray, crypto } from "@graphprotocol/graph-ts"
import {
  AuctionCreated as AuctionCreatedEvent,
  BidCreated as BidCreatedEvent,
  AuctionEncryptedMessage as AuctionEncryptedMessageEvent,
  PremiumPaid as PremiumPaidEvent,
  AuctionExtended as AuctionExtendedEvent,
  AuctionEnded as AuctionEndedEvent,
  AuctionCancelled as AuctionCancelledEvent,
  AuctionHouseMetadataUpdated as AuctionHouseMetadataUpdatedEvent,
  SettlementDeadlineUpdated as SettlementDeadlineUpdatedEvent,
  AuctionHouse as AuctionHouseContract
} from "../generated/templates/AuctionHouse/AuctionHouse"
import {
  AuctionHouse,
  Auction,
  Bid,
  EncryptedMessage,
  PremiumPayment,
  AuctionItemERC721,
  AuctionItemERC721Token,
  AuctionItemERC721Metadata,
  OrderEscrow
} from "../generated/schema"
import { AuctionItemERC721 as AuctionItemERC721Contract } from "../generated/templates/AuctionHouse/AuctionItemERC721"

export function handleAuctionCreated(event: AuctionCreatedEvent): void {
  let auctionHouse = AuctionHouse.load(event.address)
  if (auctionHouse === null) {
    log.error("AuctionHouse not found: {}", [event.address.toHexString()])
    return
  }
  
  // Create auction ID using auctionHouse address + auctionId
  let auctionId = event.address.toHexString() + "-" + event.params.auctionId.toString()
  let auction = new Auction(auctionId)
  
  auction.auctionId = event.params.auctionId
  auction.auctionHouse = event.address
  auction.tokenId = event.params.tokenId
  auction.tokenContract = event.params.tokenContract
  auction.duration = event.params.duration
  auction.reservePrice = event.params.reservePrice
  auction.affiliateFee = event.params.affiliateFee
  auction.auctionOwner = event.params.auctionOwner
  auction.arbiter = event.params.arbiter
  auction.escrowAddress = event.params.escrowAddress
  auction.isPremiumAuction = event.params.isPremiumAuction
  
  // Fetch the full auction data from the contract to get additional fields
  let auctionHouseContract = AuctionHouseContract.bind(event.address)
  let auctionData = auctionHouseContract.try_getAuctionData(event.params.auctionId)
  
  if (!auctionData.reverted) {
    // Access properties from the structured auction data
    auction.highestBid = auctionData.value.highestBid
    auction.startTime = auctionData.value.startTime
    auction.endTime = auction.startTime.plus(auction.duration)
    auction.auctionCurrency = auctionData.value.auctionCurrency
    auction.minBidIncrementBps = auctionData.value.minBidIncrementBps
    auction.premiumBps = auctionData.value.premiumBps
    auction.timeExtension = auctionData.value.timeExtension
    auction.paymentAmount = auctionData.value.paymentAmount
  } else {
    // Set defaults if we can't fetch from contract
    auction.highestBid = BigInt.fromI32(0)
    auction.startTime = BigInt.fromI32(0)
    auction.endTime = BigInt.fromI32(0)
    auction.auctionCurrency = Bytes.empty()
    auction.minBidIncrementBps = 0
    auction.premiumBps = 0
    auction.timeExtension = BigInt.fromI32(0)
    auction.paymentAmount = BigInt.fromI32(0)
  }
  
  // Initialize other fields with defaults
  auction.highestBidAmount = BigInt.fromI32(0)
  auction.status = "CREATED"
  auction.totalBidCount = 0
  auction.totalPremiumPaid = BigInt.fromI32(0)
  auction.wasExtended = false
  auction.extensionCount = 0
  auction.currentWinningBid = null
  
  auction.createdAt = event.block.timestamp
  auction.createdAtBlock = event.block.number
  auction.creationTx = event.transaction.hash
  auction.lastUpdatedAt = event.block.timestamp
  auction.lastUpdatedTx = event.transaction.hash
  
  // Try to link to token reference entity if it exists
  let tokenEntityId = event.params.tokenContract.toHexString() + "-" + event.params.tokenId.toString()
  let tokenEntity = AuctionItemERC721Token.load(tokenEntityId)
  if (tokenEntity !== null) {
    auction.tokenReference = tokenEntityId
  }
  
  // Try to get token metadata
  if (event.params.tokenContract != Bytes.empty()) {
    let tokenContract = AuctionItemERC721Contract.bind(event.params.tokenContract)
    let tokenURIResult = tokenContract.try_tokenURI(event.params.tokenId)
    
    if (!tokenURIResult.reverted) {
      // Parse and store metadata
      let metadataId = tokenURIResult.value
      let metadata = parseTokenMetadata(metadataId)
      if (metadata != '') {
        auction.tokenMetadata = metadata
      }
    }
  }
  
  auction.save()
  
  log.info("Created auction: {}, Token ID: {}, Reserve: {}, Premium: {}", [
    auctionId,
    event.params.tokenId.toString(),
    event.params.reservePrice.toString(),
    event.params.isPremiumAuction ? "true" : "false"
  ])
}

function parseTokenMetadata(uri: string): string {
  // Create a unique ID based on the URI
  let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
  
  // Check if metadata entity already exists
  let metadata = AuctionItemERC721Metadata.load(id)
  
  if (metadata === null) {
    // Create new metadata entity
    metadata = new AuctionItemERC721Metadata(id)
    metadata.rawJson = uri
    
    // Simple extraction from URI (not comprehensive)
    let nameStart = uri.indexOf("name")
    if (nameStart >= 0) {
      let valueStart = uri.indexOf(":", nameStart) + 1
      let valueEnd = uri.indexOf(",", valueStart)
      if (valueEnd > valueStart) {
        let value = uri.substring(valueStart, valueEnd).trim()
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        metadata.name = value
      }
    }
    
    let descStart = uri.indexOf("description")
    if (descStart >= 0) {
      let valueStart = uri.indexOf(":", descStart) + 1
      let valueEnd = uri.indexOf(",", valueStart)
      if (valueEnd > valueStart) {
        let value = uri.substring(valueStart, valueEnd).trim()
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        metadata.description = value
      }
    }
    
    let imageStart = uri.indexOf("image")
    if (imageStart >= 0) {
      let valueStart = uri.indexOf(":", imageStart) + 1
      let valueEnd = uri.indexOf(",", valueStart)
      if (valueEnd == -1) {
        valueEnd = uri.indexOf("}", valueStart)
      }
      if (valueEnd > valueStart) {
        let value = uri.substring(valueStart, valueEnd).trim()
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        metadata.image = value
      }
    }
    
    metadata.save()
  }
  
  return id
}

export function handleBidCreated(event: BidCreatedEvent): void {
  let auctionId = event.address.toHexString() + "-" + event.params.auctionId.toString()
  let auction = Auction.load(auctionId)
  if (auction === null) {
    log.error("Auction not found: {}", [auctionId])
    return
  }
  
  // Create bid ID
  let bidId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let bid = new Bid(bidId)
  
  bid.auction = auctionId
  bid.bidder = event.params.bidder
  bid.amount = event.params.bidAmount
  bid.affiliate = event.params.affiliate
  bid.isWinningBid = false // Will be updated if this becomes the winning bid
  bid.timestamp = event.block.timestamp
  bid.blockNumber = event.block.number
  bid.transactionHash = event.transaction.hash
  
  // Create encrypted message entity from the bid data
  let messageId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString() + "-msg"
  let message = new EncryptedMessage(messageId)
  message.auction = auctionId
  message.bidder = event.params.bidder
  message.encryptedData = event.params.encryptedData
  message.ephemeralPublicKey = event.params.ephemeralPublicKey
  message.iv = event.params.iv
  message.verificationHash = event.params.verificationHash
  message.isFinal = event.params.isFinal
  message.timestamp = event.block.timestamp
  message.blockNumber = event.block.number
  message.transactionHash = event.transaction.hash
  message.save()
  
  // Link the bid to the encrypted message
  bid.encryptedMessage = messageId
  
  // Update auction state
  if (event.params.bidAmount.gt(auction.highestBidAmount)) {
    // If there's a current winning bid, mark it as no longer winning
    if (auction.currentWinningBid !== null) {
      let previousWinningBidId = auction.currentWinningBid as string
      let previousWinningBid = Bid.load(previousWinningBidId)
      if (previousWinningBid !== null) {
        previousWinningBid.isWinningBid = false
        previousWinningBid.save()
      }
    }
    
    auction.highestBidAmount = event.params.bidAmount
    auction.currentBidder = event.params.bidder
    auction.currentAffiliate = event.params.affiliate
    auction.currentWinningBid = bidId
    auction.highestBid = event.params.bidAmount // Update the contract's highestBid value too
    bid.isWinningBid = true
  }
  
  auction.totalBidCount = auction.totalBidCount + 1
  auction.lastUpdatedAt = event.block.timestamp
  auction.lastUpdatedTx = event.transaction.hash
  
  // Update auction status if this is the first bid
  if (auction.totalBidCount == 1) {
    auction.status = "ACTIVE"
  }
  
  bid.save()
  auction.save()
  
  log.info("New bid on auction: {}, Bidder: {}, Amount: {}, Affiliate: {}", [
    auctionId,
    event.params.bidder.toHexString(),
    event.params.bidAmount.toString(),
    event.params.affiliate ? event.params.affiliate.toHexString() : "none"
  ])
}

export function handleAuctionEncryptedMessage(event: AuctionEncryptedMessageEvent): void {
  let auctionId = event.address.toHexString() + "-" + event.params.auctionId.toString()
  let auction = Auction.load(auctionId)
  if (auction === null) {
    log.error("Auction not found for encrypted message: {}", [auctionId])
    return
  }
  
  let messageId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let message = new EncryptedMessage(messageId)
  
  message.auction = auctionId
  message.bidder = event.params.bidder
  message.encryptedData = event.params.encryptedData
  message.ephemeralPublicKey = event.params.ephemeralPublicKey
  message.iv = event.params.iv
  message.verificationHash = event.params.verificationHash
  message.isFinal = event.params.isFinal
  message.timestamp = event.block.timestamp
  message.blockNumber = event.block.number
  message.transactionHash = event.transaction.hash
  
  message.save()
  
  log.info("Encrypted message added for auction: {}, Bidder: {}, IsFinal: {}", [
    auctionId,
    event.params.bidder.toHexString(),
    event.params.isFinal.toString()
  ])
}

export function handlePremiumPaid(event: PremiumPaidEvent): void {
  let auctionId = event.address.toHexString() + "-" + event.params.auctionId.toString()
  let auction = Auction.load(auctionId)
  if (auction === null) {
    log.error("Auction not found for premium payment: {}", [auctionId])
    return
  }
  
  let premiumId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let premium = new PremiumPayment(premiumId)
  
  premium.auction = auctionId
  premium.outbidUser = event.params.outbidUser
  premium.newBidder = event.params.newBidder
  premium.originalBid = event.params.originalBid
  premium.premiumAmount = event.params.premiumAmount
  premium.timestamp = event.block.timestamp
  premium.blockNumber = event.block.number
  premium.transactionHash = event.transaction.hash
  
  premium.save()
  
  // Update auction total premium paid
  auction.totalPremiumPaid = auction.totalPremiumPaid.plus(event.params.premiumAmount)
  auction.save()
  
  log.info("Premium paid for auction: {}, OutbidUser: {}, Premium: {}", [
    auctionId,
    event.params.outbidUser.toHexString(),
    event.params.premiumAmount.toString()
  ])
}

export function handleAuctionExtended(event: AuctionExtendedEvent): void {
  let auctionId = event.address.toHexString() + "-" + event.params.auctionId.toString()
  let auction = Auction.load(auctionId)
  if (auction === null) {
    log.error("Auction not found for extension: {}", [auctionId])
    return
  }
  
  auction.endTime = event.params.newEndTime
  auction.wasExtended = true
  auction.extensionCount = auction.extensionCount + 1
  auction.lastUpdatedAt = event.block.timestamp
  auction.lastUpdatedTx = event.transaction.hash
  
  auction.save()
  
  log.info("Auction extended: {}, New end time: {}", [
    auctionId,
    event.params.newEndTime.toString()
  ])
}

export function handleAuctionEnded(event: AuctionEndedEvent): void {
  let auctionId = event.address.toHexString() + "-" + event.params.auctionId.toString()
  let auction = Auction.load(auctionId)
  if (auction === null) {
    log.error("Auction not found for end event: {}", [auctionId])
    return
  }
  
  auction.status = "COMPLETED"
  auction.paymentAmount = event.params.finalAmount
  auction.endedAt = event.block.timestamp
  auction.endedAtBlock = event.block.number
  auction.endedTx = event.transaction.hash
  auction.lastUpdatedAt = event.block.timestamp
  auction.lastUpdatedTx = event.transaction.hash
  
  // Create or update order escrow entity
  // Handle escrow address
  if (auction.escrowAddress) {
    let escrowAddressString = auction.escrowAddress as Bytes
    let escrowId = escrowAddressString.toHexString()
    let escrow = OrderEscrow.load(escrowId)
    if (escrow === null) {
      escrow = new OrderEscrow(escrowId)
      escrow.escrowAddress = escrowAddressString
      escrow.payee = auction.auctionOwner
      escrow.sourceAddress = event.address
      escrow.sourceType = "AUCTION_HOUSE"
      escrow.arbiter = auction.arbiter
      escrow.isDisputed = false
      escrow.isRefunded = false
      escrow.blockNumber = event.block.number
      escrow.blockTimestamp = event.block.timestamp
      escrow.transactionHash = event.transaction.hash
    }
    
    // Link the escrow to the auction
    escrow.auction = auctionId
    escrow.affiliate = event.params.affiliate
    // Set a default value for the affiliate share
    escrow.affiliateShare = BigInt.fromI32(0)
    
    escrow.save()
    
    // Link the auction to the escrow
    auction.escrow = escrow.id
  }
  
  // Update token ownership
  if (auction.tokenReference) {
    let token = AuctionItemERC721Token.load(auction.tokenReference as string)
    if (token !== null) {
      token.owner = event.params.winner
      token.lastTransferredAt = event.block.timestamp
      token.lastTransferredTx = event.transaction.hash
      token.save()
    }
  }
  
  auction.save()
  
  log.info("Auction ended: {}, Winner: {}, Final amount: {}, Affiliate: {}", [
    auctionId,
    event.params.winner.toHexString(),
    event.params.finalAmount.toString(),
    event.params.affiliate ? event.params.affiliate.toHexString() : "none"
  ])
}

export function handleAuctionCancelled(event: AuctionCancelledEvent): void {
  let auctionId = event.address.toHexString() + "-" + event.params.auctionId.toString()
  let auction = Auction.load(auctionId)
  if (auction === null) {
    log.error("Auction not found for cancellation: {}", [auctionId])
    return
  }
  
  auction.status = "CANCELLED"
  auction.endedAt = event.block.timestamp
  auction.endedAtBlock = event.block.number
  auction.endedTx = event.transaction.hash
  auction.lastUpdatedAt = event.block.timestamp
  auction.lastUpdatedTx = event.transaction.hash
  
  auction.save()
  
  log.info("Auction canceled: {}, Owner: {}", [
    auctionId,
    event.params.owner.toHexString()
  ])
}

export function handleAuctionHouseMetadataUpdated(event: AuctionHouseMetadataUpdatedEvent): void {
  let auctionHouse = AuctionHouse.load(event.params.auctionHouse)
  if (auctionHouse === null) {
    log.error("AuctionHouse not found for metadata update: {}", [event.params.auctionHouse.toHexString()])
    return
  }
  
  auctionHouse.name = event.params.name
  auctionHouse.image = event.params.image
  auctionHouse.description = event.params.description
  auctionHouse.lastUpdatedAt = event.block.timestamp
  auctionHouse.lastUpdatedTx = event.transaction.hash
  
  auctionHouse.save()
  
  log.info("Auction house metadata updated: {}, Name: {}", [
    event.params.auctionHouse.toHexString(),
    event.params.name
  ])
}

export function handleSettlementDeadlineUpdated(event: SettlementDeadlineUpdatedEvent): void {
  let auctionHouse = AuctionHouse.load(event.address)
  if (auctionHouse === null) {
    log.error("AuctionHouse not found for settlement deadline update: {}", [event.address.toHexString()])
    return
  }
  
  auctionHouse.settlementDeadline = event.params.newDeadline
  auctionHouse.lastUpdatedAt = event.block.timestamp
  auctionHouse.lastUpdatedTx = event.transaction.hash
  
  auctionHouse.save()
  
  log.info("Settlement deadline updated for auction house: {}, New deadline: {}", [
    event.address.toHexString(),
    event.params.newDeadline.toString()
  ])
}
