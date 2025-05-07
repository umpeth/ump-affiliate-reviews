import { AuctionItemERC721Created as AuctionItemERC721CreatedEvent } from "../generated/AuctionItemERC721Factory/AuctionItemERC721Factory"
import { AuctionItemERC721, AuctionItemERC721Token } from "../generated/schema"
import { AuctionItemERC721 as AuctionItemERC721Template } from "../generated/templates"
import { AuctionItemERC721 as AuctionItemERC721Contract } from "../generated/AuctionItemERC721Factory/AuctionItemERC721"
import { log } from "@graphprotocol/graph-ts"

export function handleAuctionItemERC721Created(event: AuctionItemERC721CreatedEvent): void {
  let contract = new AuctionItemERC721(event.params.tokenContract)
  
  contract.tokenAddress = event.params.tokenContract
  contract.owner = event.params.owner
  
  // Get contract details by querying the new contract
  let erc721Contract = AuctionItemERC721Contract.bind(event.params.tokenContract)
  
  let nameResult = erc721Contract.try_name()
  if (!nameResult.reverted) {
    contract.name = nameResult.value
  } else {
    contract.name = "Unknown"
  }
  
  let symbolResult = erc721Contract.try_symbol()
  if (!symbolResult.reverted) {
    contract.symbol = symbolResult.value
  } else {
    contract.symbol = "UNKNOWN"
  }
  
  let contractURIResult = erc721Contract.try_contractURI()
  if (!contractURIResult.reverted) {
    contract.contractURI = contractURIResult.value
  }
  
  contract.createdAt = event.block.timestamp
  contract.createdAtBlock = event.block.number
  contract.creationTx = event.transaction.hash
  
  contract.save()
  
  // Create template instance to track events from this token contract
  AuctionItemERC721Template.create(event.params.tokenContract)
  
  log.info("Created new AuctionItemERC721: {}, Owner: {}, Name: {}", [
    event.params.tokenContract.toHexString(),
    event.params.owner.toHexString(),
    contract.name
  ])
}
