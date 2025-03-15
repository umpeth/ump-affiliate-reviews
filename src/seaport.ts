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
  let parsed = json.try_fromString(uri)
  if (parsed.isOk) {
    let obj = parsed.value.toObject()
    let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
    
    let metadata = new ERC1155ContractMetadata(id)
    metadata.rawJson = uri
    
    let name = obj.get('name')
    if (name) metadata.name = name.toString()
    
    let description = obj.get('description')
    if (description) metadata.description = description.toString()
    
    let image = obj.get('image')
    if (image) metadata.image = image.toString()
    
    let externalLink = obj.get('external_link')
    if (externalLink) metadata.externalLink = externalLink.toString()
    
    metadata.save()
    return id
  }
  return ''
}

function parseTokenMetadata(uri: string): string {
  let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
  let metadata = new ERC1155TokenMetadata(id)
  
  // Store the full base64 encoded data
  metadata.rawEncodedJson = uri
  
  // If it starts with our expected prefix, store the base64 part separately
  if (uri.startsWith('data:application/json;base64,')) {
    metadata.rawJson = uri.slice('data:application/json;base64,'.length)
  }
  
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
