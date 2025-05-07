import { AuctionHouseCreated as AuctionHouseCreatedEvent } from "../generated/AuctionHouseFactory/AuctionHouseFactory"
import { AuctionHouse } from "../generated/schema"
import { AuctionHouse as AuctionHouseTemplate } from "../generated/templates"
import { log, BigInt } from "@graphprotocol/graph-ts"

export function handleAuctionHouseCreated(event: AuctionHouseCreatedEvent): void {
  let auctionHouse = new AuctionHouse(event.params.auctionHouse)
  
  auctionHouse.auctionHouseAddress = event.params.auctionHouse
  auctionHouse.owner = event.params.owner
  
  // Capture all the enhanced metadata fields from the event
  auctionHouse.name = event.params.name
  auctionHouse.image = event.params.image
  auctionHouse.description = event.params.description
  auctionHouse.contractURI = event.params.contractURI
  auctionHouse.symbol = event.params.symbol
  auctionHouse.settlementDeadline = event.params.settlementDeadline
  auctionHouse.version = "1.0.0"  // Default version
  
  auctionHouse.createdAt = event.block.timestamp
  auctionHouse.createdAtBlock = event.block.number
  auctionHouse.creationTx = event.transaction.hash
  
  auctionHouse.save()
  
  // Create template instance to track events from this auction house
  AuctionHouseTemplate.create(event.params.auctionHouse)
  
  log.info("Created new auction house: {}, Owner: {}, Name: {}", [
    event.params.auctionHouse.toHexString(),
    event.params.owner.toHexString(),
    event.params.name
  ])
}
