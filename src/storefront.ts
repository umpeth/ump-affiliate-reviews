import { BigInt, Address, ByteArray, crypto, Bytes, json, log } from "@graphprotocol/graph-ts"

/**
 * Safely get a string representation of an address that might be null
 */
function safeAddressToString(address: Bytes | null): string {
  if (address === null) {
    return "null";
  }
  return address.toHexString();
}

import {
  StorefrontOrderFulfilled as AffiliateOrderFulfilledEvent,
  ListingAdded as AffiliateListingAddedEvent,
  ListingUpdated as AffiliateListingUpdatedEvent,
  ListingRemoved as AffiliateListingRemovedEvent,
  ReadyStateChanged as ReadyStateChangedEvent,
  SettleDeadlineUpdated as SettleDeadlineUpdatedEvent,
  ERC1155TokenAddressChanged as ERC1155TokenAddressChangedEvent,
} from "../generated/templates/AffiliateERC1155Storefront/AffiliateERC1155Storefront"
import { ReceiptERC1155 } from "../generated/templates/AffiliateERC1155Storefront/ReceiptERC1155"
import { 
  OrderFulfilled, 
  OfferItem, 
  ConsiderationItem, 
  Storefront,
  TokenListing,
  ERC1155ContractMetadata,
  ERC1155TokenMetadata,
  Order,
  OrderEscrow
} from "../generated/schema"

function parseContractMetadata(uri: string): string {
  let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
  let metadata = new ERC1155ContractMetadata(id)
  metadata.rawJson = uri // Just store the URI string
  metadata.save()
  return id
}

function parseTokenMetadata(uri: string): string {
  let id = crypto.keccak256(ByteArray.fromUTF8(uri)).toHexString()
  let metadata = new ERC1155TokenMetadata(id)
  metadata.rawEncodedJson = uri
  metadata.rawJson = uri
  metadata.save()
  return id
}

/**
 * Handle order fulfillment for affiliate storefronts
 */
export function handleAffiliateOrderFulfilled(event: AffiliateOrderFulfilledEvent): void {
  log.info("Processing affiliate order: {}", [event.transaction.hash.toHexString()]);
  
  // Create OrderFulfilled for backward compatibility
  let id = event.transaction.hash.toHexString();
  let orderFulfilled = new OrderFulfilled(id);
  
  // Create offer item
  let offerId = id + "-offer-0";
  let offerItem = new OfferItem(offerId);
  offerItem.orderFulfilled = id;
  offerItem.itemType = BigInt.fromI32(3); // ERC1155
  
  // Get the storefront to access the ERC1155 token address
  let storefront = Storefront.load(event.address);
  if (storefront === null) {
    log.error("Storefront not found: {}", [event.address.toHexString()]);
    return;
  }
  
  offerItem.token = Address.fromBytes(storefront.erc1155Token);
  offerItem.identifier = event.params.tokenId;
  offerItem.amount = event.params.amount;
  offerItem.save();
  
  // Create consideration item
  let considerationId = id + "-consideration-0";
  let considerationItem = new ConsiderationItem(considerationId);
  considerationItem.orderFulfilled = id;
  considerationItem.itemType = event.params.paymentToken == Address.zero() ? BigInt.fromI32(0) : BigInt.fromI32(1);
  considerationItem.token = event.params.paymentToken;
  considerationItem.identifier = BigInt.fromI32(0);
  considerationItem.amount = event.params.price;
  considerationItem.recipient = event.params.escrowContract;
  considerationItem.save();
  
  // Set up arrays
  let offerItems: string[] = [offerId];
  let considerationItems: string[] = [considerationId];
  orderFulfilled.offer = offerItems;
  orderFulfilled.consideration = considerationItems;
  
  // Required fields
  orderFulfilled.orderHash = Bytes.empty();
  orderFulfilled.offerer = event.address;
  orderFulfilled.zone = Bytes.empty();
  orderFulfilled.recipient = event.params.buyer;
  
  // Affiliate-specific fields
  orderFulfilled.affiliate = event.params.affiliate;
  orderFulfilled.affiliateShare = BigInt.fromI32(event.params.affiliateShare);
  
  // Store the encrypted message fields
  orderFulfilled.encryptedData = event.params.encryptedData;
  orderFulfilled.ephemeralPublicKey = event.params.ephemeralPublicKey;
  orderFulfilled.iv = event.params.iv;
  
  // The verificationHash might be empty, so check before setting
  if (event.params.verificationHash !== null && event.params.verificationHash.length > 0) {
    orderFulfilled.verificationHash = event.params.verificationHash;
  }
  
  // Metadata
  orderFulfilled.blockNumber = event.block.number;
  orderFulfilled.blockTimestamp = event.block.timestamp;
  orderFulfilled.transactionHash = event.transaction.hash;
  
  orderFulfilled.save();
  
  // Create Order entity for the unified model
  let order = new Order(event.transaction.hash);
  
  // Use the buyer parameter from the event
  order.buyer = event.params.buyer;
  order.seller = storefront.owner;
  order.storefront = storefront.id;
  order.tokenId = event.params.tokenId;
  order.amount = event.params.amount;
  order.timestamp = event.block.timestamp;
  order.blockNumber = event.block.number;
  
  // Set escrow contract and affiliate data
  order.escrowContract = event.params.escrowContract;
  order.affiliate = event.params.affiliate;
  order.affiliateShare = BigInt.fromI32(event.params.affiliateShare);
  
  order.save();
  
  // Add debug logs to verify the data
  log.debug("Created affiliate order - Hash: {}, Buyer: {}, Escrow: {}, Affiliate: {}", [
    order.id.toHexString(),
    order.buyer.toHexString(),
    safeAddressToString(order.escrowContract),
    safeAddressToString(order.affiliate)
  ]);
  
  // Log order creation - handling nullable affiliate field
  log.info(
    "Created affiliate order: {}, Buyer: {}, Seller: {}",
    [
      order.id.toHexString(),
      order.buyer.toHexString(),
      order.seller.toHexString()
    ]
  );
  
  // Log affiliate info using safe helper
  log.info("Order affiliate: {}", [safeAddressToString(order.affiliate)]);
  
  // Link with escrow
  let escrow = OrderEscrow.load(event.params.escrowContract.toHexString());
  if (escrow !== null) {
    escrow.order = order.id;
    escrow.save();
    log.info("Linked order to escrow: {}", [escrow.id]);
  }
}

export function handleListingAdded(event: AffiliateListingAddedEvent): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = new TokenListing(id);
  
  let storefront = Storefront.load(event.address);
  if (storefront !== null) {
    let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(storefront.erc1155Token));
    
    // Get contractURI for the listing and possibly update storefront
    let contractURIResult = erc1155Contract.try_contractURI();
    if (!contractURIResult.reverted) {
      listing.contractURI = contractURIResult.value;
      let contractMetadataId = parseContractMetadata(contractURIResult.value);
      if (contractMetadataId != '') {
        listing.contractMetadata = contractMetadataId;
      }
      
      // Update storefront's contractURI if it's not already set or has changed
      if (!storefront.contractURI || storefront.contractURI != contractURIResult.value) {
        storefront.contractURI = contractURIResult.value;
        if (contractMetadataId != '') {
          storefront.contractMetadata = contractMetadataId;
        }
        storefront.save();
        log.info("Updated contractURI for storefront during listing creation: {}, URI: {}", [
          event.address.toHexString(),
          contractURIResult.value
        ]);
      }
    } else {
      log.warning("Failed to fetch contractURI for listing: {}, Token: {}", [
        id,
        storefront.erc1155Token.toHexString()
      ]);
    }
    
    // Get tokenURI for the specific token
    let tokenURIResult = erc1155Contract.try_uri(event.params.tokenId);
    if (!tokenURIResult.reverted) {
      listing.tokenURI = tokenURIResult.value;
      let tokenMetadataId = parseTokenMetadata(tokenURIResult.value);
      if (tokenMetadataId != '') {
        listing.tokenMetadata = tokenMetadataId;
      }
    } else {
      log.warning("Failed to fetch tokenURI for token ID: {}", [
        event.params.tokenId.toString()
      ]);
    }
  }

  // Set the storefront reference using the event address directly
  listing.storefront = event.address;
  listing.tokenId = event.params.tokenId;
  listing.price = event.params.price;
  listing.paymentToken = event.params.paymentToken;
  listing.listingTime = event.block.timestamp;
  listing.active = true;
  listing.createdAt = event.block.timestamp;
  listing.createdAtBlock = event.block.number;
  listing.creationTx = event.transaction.hash;
  listing.lastUpdateAt = event.block.timestamp;
  listing.lastUpdateTx = event.transaction.hash;
  listing.affiliateFee = event.params.affiliateFee;

  listing.save();
  
  log.info("Created affiliate listing: {}, Token ID: {}, Price: {}, Fee: {}", [
    id,
    event.params.tokenId.toString(),
    event.params.price.toString(),
    event.params.affiliateFee.toString()
  ]);
}

export function handleListingUpdated(event: AffiliateListingUpdatedEvent): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = TokenListing.load(id);
  if (listing === null) return;
  
  let storefront = Storefront.load(event.address);
  if (storefront !== null) {
    let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(storefront.erc1155Token));
    
    // Get latest contractURI
    let contractURIResult = erc1155Contract.try_contractURI();
    if (!contractURIResult.reverted) {
      // Update listing contractURI
      listing.contractURI = contractURIResult.value;
      let contractMetadataId = parseContractMetadata(contractURIResult.value);
      if (contractMetadataId != '') {
        listing.contractMetadata = contractMetadataId;
      }
      
      // Update storefront's contractURI if it's not already set or has changed
      if (!storefront.contractURI || storefront.contractURI != contractURIResult.value) {
        storefront.contractURI = contractURIResult.value;
        if (contractMetadataId != '') {
          storefront.contractMetadata = contractMetadataId;
        }
        storefront.save();
        log.info("Updated contractURI for storefront during listing update: {}, URI: {}", [
          event.address.toHexString(),
          contractURIResult.value
        ]);
      }
    } else {
      log.warning("Failed to fetch contractURI for listing update: {}, Token: {}", [
        id,
        storefront.erc1155Token.toHexString()
      ]);
    }
    
    // Get latest tokenURI
    let tokenURIResult = erc1155Contract.try_uri(event.params.tokenId);
    if (!tokenURIResult.reverted) {
      listing.tokenURI = tokenURIResult.value;
      let tokenMetadataId = parseTokenMetadata(tokenURIResult.value);
      if (tokenMetadataId != '') {
        listing.tokenMetadata = tokenMetadataId;
      }
    } else {
      log.warning("Failed to fetch tokenURI for token ID: {}", [
        event.params.tokenId.toString()
      ]);
    }
  }

  // Update listing data
  listing.price = event.params.newPrice;
  listing.paymentToken = event.params.newPaymentToken;
  listing.listingTime = event.block.timestamp;
  listing.lastUpdateAt = event.block.timestamp;
  listing.lastUpdateTx = event.transaction.hash;
  listing.affiliateFee = event.params.newAffiliateFee;

  listing.save();
  
  log.info("Updated affiliate listing: {}, Old Price: {}, New Price: {}, Old Fee: {}, New Fee: {}", [
    id,
    event.params.oldPrice.toString(),
    event.params.newPrice.toString(),
    event.params.oldAffiliateFee.toString(),
    event.params.newAffiliateFee.toString()
  ]);
}

export function handleListingRemoved(event: AffiliateListingRemovedEvent): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = TokenListing.load(id);
  if (listing === null) return;

  listing.active = false;
  listing.lastUpdateAt = event.block.timestamp;
  listing.lastUpdateTx = event.transaction.hash;
  listing.save();
  
  log.info("Removed affiliate listing: {}, Token ID: {}", [
    id,
    event.params.tokenId.toString()
  ]);
}

export function handleReadyStateChanged(event: ReadyStateChangedEvent): void {
  let storefront = Storefront.load(event.address);
  if (storefront === null) return;

  storefront.ready = event.params.newState;
  storefront.save();
  
  log.info("Updated storefront ready state: {}, New State: {}", [
    event.address.toHexString(),
    event.params.newState ? "true" : "false"
  ]);
}

export function handleSettleDeadlineUpdated(event: SettleDeadlineUpdatedEvent): void {
  let storefront = Storefront.load(event.address);
  if (storefront === null) return;

  storefront.settleDeadline = event.params.newSettleDeadline;
  storefront.save();
  
  log.info("Updated storefront settle deadline: {}, New Deadline: {}", [
    event.address.toHexString(),
    event.params.newSettleDeadline.toString()
  ]);
}

export function handleERC1155TokenAddressChanged(event: ERC1155TokenAddressChangedEvent): void {
  let storefront = Storefront.load(event.address);
  if (storefront === null) return;

  let oldAddress = storefront.erc1155Token;
  storefront.erc1155Token = event.params.newAddress;
  storefront.ready = false; // Ready state is reset when token address changes
  
  // Update contractURI when token address changes
  let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(event.params.newAddress));
  let contractURIResult = erc1155Contract.try_contractURI();
  if (!contractURIResult.reverted) {
    // Only update if the contractURI has changed or wasn't set
    if (!storefront.contractURI || storefront.contractURI != contractURIResult.value) {
      storefront.contractURI = contractURIResult.value;
      let contractMetadataId = parseContractMetadata(contractURIResult.value);
      if (contractMetadataId != '') {
        storefront.contractMetadata = contractMetadataId;
      }
      log.info("Updated contractURI for storefront after token change: {}, Old Token: {}, New Token: {}, URI: {}", [
        event.address.toHexString(),
        oldAddress.toHexString(),
        event.params.newAddress.toHexString(),
        contractURIResult.value
      ]);
    }
  } else {
    log.warning("Failed to fetch contractURI for new token: {}", [event.params.newAddress.toHexString()]);
  }
  
  storefront.save();
  
  log.info("Updated storefront ERC1155 token address: {}, Old Address: {}, New Address: {}", [
    event.address.toHexString(),
    oldAddress.toHexString(),
    event.params.newAddress.toHexString()
  ]);
}
