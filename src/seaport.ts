import { BigInt, Address, JSONValue, TypedMap, log, ByteArray, crypto, Bytes } from "@graphprotocol/graph-ts"
import {
  OrderFulfilled as OrderFulfilledEvent
} from "../generated/Seaport/Seaport"
import {
  OrderFulfilled,
  OfferItem,
  ConsiderationItem,
  OrderPayment,
  Storefront,
  ERC1155ContractMetadata,
  ERC1155TokenMetadata
} from "../generated/schema"
import { ReceiptERC1155 } from "../generated/Seaport/ReceiptERC1155"
import { json } from '@graphprotocol/graph-ts'

function parseContractMetadata(uri: string): string {
  let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
  let metadata = new ERC1155ContractMetadata(id)
  
  // Store the raw JSON string
  metadata.rawJson = uri
  
  // Basic JSON parsing using string operations
  // Extract values between quotes after specific keys
  
  // Extract name
  let nameStart = uri.indexOf('"name"')
  if (nameStart >= 0) {
    nameStart = uri.indexOf(':', nameStart) + 1
    // Skip whitespace
    while (nameStart < uri.length && (uri.charAt(nameStart) == ' ' || uri.charAt(nameStart) == '\t')) {
      nameStart++
    }
    
    if (nameStart < uri.length && uri.charAt(nameStart) == '"') {
      nameStart++ // Skip opening quote
      let nameEnd = uri.indexOf('"', nameStart)
      if (nameEnd > nameStart) {
        metadata.name = uri.substring(nameStart, nameEnd)
      }
    }
  }
  
  // Extract description
  let descStart = uri.indexOf('"description"')
  if (descStart >= 0) {
    descStart = uri.indexOf(':', descStart) + 1
    // Skip whitespace
    while (descStart < uri.length && (uri.charAt(descStart) == ' ' || uri.charAt(descStart) == '\t')) {
      descStart++
    }
    
    if (descStart < uri.length && uri.charAt(descStart) == '"') {
      descStart++ // Skip opening quote
      let descEnd = uri.indexOf('"', descStart)
      if (descEnd > descStart) {
        metadata.description = uri.substring(descStart, descEnd)
      }
    }
  }
  
  // Extract image
  let imageStart = uri.indexOf('"image"')
  if (imageStart >= 0) {
    imageStart = uri.indexOf(':', imageStart) + 1
    // Skip whitespace
    while (imageStart < uri.length && (uri.charAt(imageStart) == ' ' || uri.charAt(imageStart) == '\t')) {
      imageStart++
    }
    
    if (imageStart < uri.length && uri.charAt(imageStart) == '"') {
      imageStart++ // Skip opening quote
      let imageEnd = uri.indexOf('"', imageStart)
      if (imageEnd > imageStart) {
        metadata.image = uri.substring(imageStart, imageEnd)
      }
    }
  }
  
  // Extract external link
  let linkStart = uri.indexOf('"external_link"')
  if (linkStart < 0) {
    linkStart = uri.indexOf('"external_url"') // Try alternative key
  }
  
  if (linkStart >= 0) {
    linkStart = uri.indexOf(':', linkStart) + 1
    // Skip whitespace
    while (linkStart < uri.length && (uri.charAt(linkStart) == ' ' || uri.charAt(linkStart) == '\t')) {
      linkStart++
    }
    
    if (linkStart < uri.length && uri.charAt(linkStart) == '"') {
      linkStart++ // Skip opening quote
      let linkEnd = uri.indexOf('"', linkStart)
      if (linkEnd > linkStart) {
        metadata.externalLink = uri.substring(linkStart, linkEnd)
      }
    }
  }
  
  log.info("Processed contractURI metadata with ID: {}", [id])
  
  metadata.save()
  return id
}

function parseTokenMetadata(uri: string): string {
  let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
  let metadata = new ERC1155TokenMetadata(id)
  
  // Store the raw token URI data
  metadata.rawEncodedJson = uri
  metadata.rawJson = uri
  
  metadata.save()
  return id
}

export function handleOrderFulfilled(event: OrderFulfilledEvent): void {
  let orderFulfilled = new OrderFulfilled(event.transaction.hash.toHexString())
  orderFulfilled.orderHash = event.params.orderHash
  orderFulfilled.offerer = event.params.offerer
  orderFulfilled.zone = event.params.zone
  orderFulfilled.recipient = event.params.recipient
  orderFulfilled.blockNumber = event.block.number
  orderFulfilled.blockTimestamp = event.block.timestamp
  orderFulfilled.transactionHash = event.transaction.hash
  
  let offerItems: string[] = []
  for (let i = 0; i < event.params.offer.length; i++) {
    let offerItem = new OfferItem(orderFulfilled.id + "-offer-" + i.toString())
    offerItem.orderFulfilled = orderFulfilled.id
    offerItem.itemType = BigInt.fromI32(event.params.offer[i].itemType)
    offerItem.token = event.params.offer[i].token
    offerItem.identifier = event.params.offer[i].identifier
    offerItem.amount = event.params.offer[i].amount
    offerItem.save()
    offerItems.push(offerItem.id)

    // Try to find a storefront with this address
    let storefront = Storefront.load(event.params.offerer)
    if (storefront && storefront.erc1155Token.equals(event.params.offer[i].token)) {
      let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(storefront.erc1155Token))
      
      let contractURIResult = erc1155Contract.try_contractURI()
      if (!contractURIResult.reverted) {
        orderFulfilled.erc1155ContractURI = contractURIResult.value
        let contractMetadataId = parseContractMetadata(contractURIResult.value)
        if (contractMetadataId != '') {
          orderFulfilled.contractMetadata = contractMetadataId
        }
      }

      let tokenURIResult = erc1155Contract.try_uri(event.params.offer[i].identifier)
      if (!tokenURIResult.reverted) {
        orderFulfilled.erc1155TokenURI = tokenURIResult.value
        let tokenMetadataId = parseTokenMetadata(tokenURIResult.value)
        if (tokenMetadataId != '') {
          orderFulfilled.tokenMetadata = tokenMetadataId
        }
      }
    }
  }
  orderFulfilled.offer = offerItems

  let considerationItems: string[] = []
  for (let i = 0; i < event.params.consideration.length; i++) {
    let considerationItem = new ConsiderationItem(orderFulfilled.id + "-consideration-" + i.toString())
    considerationItem.orderFulfilled = orderFulfilled.id
    considerationItem.itemType = BigInt.fromI32(event.params.consideration[i].itemType)
    considerationItem.token = event.params.consideration[i].token
    considerationItem.identifier = event.params.consideration[i].identifier
    considerationItem.amount = event.params.consideration[i].amount
    considerationItem.recipient = event.params.consideration[i].recipient
    considerationItem.save()
    considerationItems.push(considerationItem.id)
  }
  orderFulfilled.consideration = considerationItems

  let payment = OrderPayment.load(event.transaction.hash.toHexString())
  if (payment != null) {
    orderFulfilled.payment = payment.id
    payment.orderFulfilled = orderFulfilled.id
    payment.save()
  }

  orderFulfilled.save()
}
