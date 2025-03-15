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
  StorefrontOrderFulfilled as StorefrontOrderFulfilledEvent,
  ListingAdded as ListingAddedEvent,
  ListingUpdated as ListingUpdatedEvent,
  ListingRemoved as ListingRemovedEvent,
  ReadyStateChanged as ReadyStateChangedEvent,
  SettleDeadlineUpdated as SettleDeadlineUpdatedEvent,
  ERC1155TokenAddressChanged as ERC1155TokenAddressChangedEvent,
} from "../generated/templates/SimpleERC1155StorefrontV2/SimpleERC1155StorefrontV2"
import {
  ListingAdded as ListingAddedEventSimple,
  ListingUpdated as ListingUpdatedEventSimple,
  ListingRemoved as ListingRemovedEventSimple,
} from "../generated/templates/SimpleERC1155Storefront/SimpleERC1155Storefront"
import {
  StorefrontOrderFulfilled as AffiliateOrderFulfilledEvent,
  ListingAdded as AffiliateListingAddedEvent,
  ListingUpdated as AffiliateListingUpdatedEvent,
  ListingRemoved as AffiliateListingRemovedEvent
} from "../generated/templates/AffiliateERC1155Storefront/AffiliateERC1155Storefront"
import { ReceiptERC1155 } from "../generated/templates/SimpleERC1155StorefrontV2/ReceiptERC1155"
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
 * Handle order fulfillment for V2 storefronts
 */
export function handleStorefrontOrderFulfilled(event: StorefrontOrderFulfilledEvent): void {
  log.info("Processing V2 storefront order: {}", [event.transaction.hash.toHexString()])
  
  // Create OrderFulfilled entity (for backward compatibility)
  let id = event.transaction.hash.toHexString();
  let orderFulfilled = new OrderFulfilled(id);
  
  let offerId = id + "-offer-0";
  let offerItem = new OfferItem(offerId);
  offerItem.orderFulfilled = id;
  offerItem.itemType = BigInt.fromI32(3); // ERC1155
  
  // Get the storefront to access the ERC1155 token address
  let storefront = Storefront.load(event.address);
  if (storefront === null) {
    log.error("Storefront not found: {}", [event.address.toHexString()])
    return;
  }
  
  offerItem.token = Address.fromBytes(storefront.erc1155Token); // Use token from storefront
  offerItem.identifier = event.params.tokenId;
  offerItem.amount = event.params.amount;
  offerItem.save();
  
  let considerationId = id + "-consideration-0";
  let considerationItem = new ConsiderationItem(considerationId);
  considerationItem.orderFulfilled = id;
  considerationItem.itemType = event.params.paymentToken == Address.zero() ? BigInt.fromI32(0) : BigInt.fromI32(1);
  considerationItem.token = event.params.paymentToken;
  considerationItem.identifier = BigInt.fromI32(0);
  considerationItem.amount = event.params.price;
  considerationItem.recipient = event.params.buyer;
  considerationItem.save();
  
  let offerItems: string[] = [offerId];
  let considerationItems: string[] = [considerationId];
  orderFulfilled.offer = offerItems;
  orderFulfilled.consideration = considerationItems;
  
  orderFulfilled.orderHash = Bytes.empty();
  orderFulfilled.offerer = event.params.buyer;
  orderFulfilled.zone = Bytes.empty();
  orderFulfilled.recipient = event.params.buyer;

  // Set affiliate fields to null - use Address.zero() for address type
  orderFulfilled.affiliate = Address.zero();
  orderFulfilled.affiliateShare = 0;

  // Handle encrypted data fields safely
  if (event.params.encryptedData) {
    orderFulfilled.encryptedData = event.params.encryptedData;
  }
  if (event.params.ephemeralPublicKey) {
    orderFulfilled.ephemeralPublicKey = event.params.ephemeralPublicKey;
  }
  if (event.params.iv) {
    orderFulfilled.iv = event.params.iv;
  }
  // The verificationHash might be empty, so check before setting
  if (event.params.verificationHash !== null && event.params.verificationHash.length > 0) {
    orderFulfilled.verificationHash = event.params.verificationHash;
  }
  
  orderFulfilled.blockNumber = event.block.number;
  orderFulfilled.blockTimestamp = event.block.timestamp;
  orderFulfilled.transactionHash = event.transaction.hash;

  orderFulfilled.save();
  
  // Create Order entity for the unified model
  let order = new Order(event.transaction.hash);
  order.buyer = event.params.buyer;
  order.seller = storefront.owner;
  order.storefront = storefront.id;
  order.tokenId = event.params.tokenId;
  order.amount = event.params.amount;
  order.timestamp = event.block.timestamp;
  order.blockNumber = event.block.number;
  
  // Set escrow contract if available
  order.escrowContract = event.params.escrowContract;
  
  // Initialize affiliate fields to null
  order.affiliate = null;
  order.affiliateShare = 0;
  
  order.save();
  
  log.info("Created order: {}, Buyer: {}, Seller: {}", [
    order.id.toHexString(),
    order.buyer.toHexString(),
    order.seller.toHexString()
  ]);
  
  // Link with escrow if exists
  if (event.params.escrowContract) {
    let escrow = OrderEscrow.load(event.params.escrowContract.toHexString());
    if (escrow !== null) {
      escrow.order = order.id;
      escrow.save();
      log.info("Linked order to escrow: {}", [escrow.id]);
    }
  }
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
  orderFulfilled.affiliateShare = event.params.affiliateShare;
  
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
  order.affiliateShare = event.params.affiliateShare;
  
  order.save();
  
  // Log order creation - handling nullable affiliate field
  log.info(
    "Created affiliate order: {}, Buyer: {}, Seller: {}",
    [
      order.id.toHexString(),
      order.buyer.toHexString(),
      order.seller.toHexString()
    ]
  );
  
  // THIS IS THE FIX FOR LINE 260
  // Instead of directly accessing toHexString() on a potentially null value,
  // use the safe helper function
  log.info("Order affiliate: {}", [safeAddressToString(order.affiliate)]);
  
  // Link with escrow
  let escrow = OrderEscrow.load(event.params.escrowContract.toHexString());
  if (escrow !== null) {
    escrow.order = order.id;
    escrow.save();
    log.info("Linked order to escrow: {}", [escrow.id]);
  }
}

/**
 * Handle order fulfillment for simple storefronts
 */
export function handleSimpleOrderFulfilled(event: StorefrontOrderFulfilledEvent): void {
  log.info("Processing simple order: {}", [event.transaction.hash.toHexString()]);
  
  let storefront = Storefront.load(event.address);
  if (storefront === null) {
    log.warning("Storefront not found: {}", [event.address.toHexString()]);
    return;
  }

  let order = new Order(event.transaction.hash);
  order.buyer = event.params.buyer;
  order.seller = storefront.owner;
  order.storefront = storefront.id;
  order.tokenId = event.params.tokenId;
  order.amount = event.params.amount;
  order.timestamp = event.block.timestamp;
  order.blockNumber = event.block.number;
  
  // For simple orders, no escrow or affiliate
  order.escrowContract = null;
  order.affiliate = null;
  order.affiliateShare = 0;
  
  order.save();
  
  log.info("Created simple order: {}, Buyer: {}, Seller: {}", [
    order.id.toHexString(),
    order.buyer.toHexString(),
    order.seller.toHexString()
  ]);
}

export function handleListingAddedSimple(event: ListingAddedEventSimple): void {
  // Create the listing ID using event address and token ID
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = new TokenListing(id);
  
  let storefront = Storefront.load(event.address);
  if (storefront !== null) {
    let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(storefront.erc1155Token));
    
    // Get contract URI
    let contractURIResult = erc1155Contract.try_contractURI();
    if (!contractURIResult.reverted) {
      listing.contractURI = contractURIResult.value;
      let contractMetadataId = parseContractMetadata(contractURIResult.value);
      if (contractMetadataId != '') {
        listing.contractMetadata = contractMetadataId;
      }
    }
    
    // Get token URI
    let tokenURIResult = erc1155Contract.try_uri(event.params.tokenId);
    if (!tokenURIResult.reverted) {
      listing.tokenURI = tokenURIResult.value;
      let tokenMetadataId = parseTokenMetadata(tokenURIResult.value);
      if (tokenMetadataId != '') {
        listing.tokenMetadata = tokenMetadataId;
      }
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
  listing.affiliateFee = 0; // Default to 0 for simple storefront

  listing.save();
}

export function handleListingUpdatedSimple(event: ListingUpdatedEventSimple): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = TokenListing.load(id);
  if (listing === null) return;
  
  let storefront = Storefront.load(event.address);
  if (storefront !== null) {
    let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(storefront.erc1155Token));
    
    // Update contract URI
    let contractURIResult = erc1155Contract.try_contractURI();
    if (!contractURIResult.reverted) {
      listing.contractURI = contractURIResult.value;
      let contractMetadataId = parseContractMetadata(contractURIResult.value);
      if (contractMetadataId != '') {
        listing.contractMetadata = contractMetadataId;
      }
    }
    
    // Update token URI
    let tokenURIResult = erc1155Contract.try_uri(event.params.tokenId);
    if (!tokenURIResult.reverted) {
      listing.tokenURI = tokenURIResult.value;
      let tokenMetadataId = parseTokenMetadata(tokenURIResult.value);
      if (tokenMetadataId != '') {
        listing.tokenMetadata = tokenMetadataId;
      }
    }
  }

  listing.price = event.params.newPrice;
  listing.paymentToken = event.params.newPaymentToken;
  listing.listingTime = event.block.timestamp;
  listing.lastUpdateAt = event.block.timestamp;
  listing.lastUpdateTx = event.transaction.hash;
  listing.affiliateFee = 0; // Keep at 0 for simple storefront

  listing.save();
}

export function handleListingRemovedSimple(event: ListingRemovedEventSimple): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = TokenListing.load(id);
  if (listing === null) return;

  listing.active = false;
  listing.lastUpdateAt = event.block.timestamp;
  listing.lastUpdateTx = event.transaction.hash;
  listing.save();
}

export function handleAffiliateListingAdded(event: AffiliateListingAddedEvent): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = new TokenListing(id);
  
  let storefront = Storefront.load(event.address);
  if (storefront !== null) {
    let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(storefront.erc1155Token));
    
    let contractURIResult = erc1155Contract.try_contractURI();
    if (!contractURIResult.reverted) {
      listing.contractURI = contractURIResult.value;
      let contractMetadataId = parseContractMetadata(contractURIResult.value);
      if (contractMetadataId != '') {
        listing.contractMetadata = contractMetadataId;
      }
    }
    
    let tokenURIResult = erc1155Contract.try_uri(event.params.tokenId);
    if (!tokenURIResult.reverted) {
      listing.tokenURI = tokenURIResult.value;
      let tokenMetadataId = parseTokenMetadata(tokenURIResult.value);
      if (tokenMetadataId != '') {
        listing.tokenMetadata = tokenMetadataId;
      }
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
}

export function handleAffiliateListingUpdated(event: AffiliateListingUpdatedEvent): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = TokenListing.load(id);
  if (listing === null) return;
  
  let storefront = Storefront.load(event.address);
  if (storefront !== null) {
    let erc1155Contract = ReceiptERC1155.bind(Address.fromBytes(storefront.erc1155Token));
    
    let contractURIResult = erc1155Contract.try_contractURI();
    if (!contractURIResult.reverted) {
      listing.contractURI = contractURIResult.value;
      let contractMetadataId = parseContractMetadata(contractURIResult.value);
      if (contractMetadataId != '') {
        listing.contractMetadata = contractMetadataId;
      }
    }
    
    let tokenURIResult = erc1155Contract.try_uri(event.params.tokenId);
    if (!tokenURIResult.reverted) {
      listing.tokenURI = tokenURIResult.value;
      let tokenMetadataId = parseTokenMetadata(tokenURIResult.value);
      if (tokenMetadataId != '') {
        listing.tokenMetadata = tokenMetadataId;
      }
    }
  }

  listing.price = event.params.newPrice;
  listing.paymentToken = event.params.newPaymentToken;
  listing.listingTime = event.block.timestamp;
  listing.lastUpdateAt = event.block.timestamp;
  listing.lastUpdateTx = event.transaction.hash;
  listing.affiliateFee = event.params.newAffiliateFee;

  listing.save();
}

export function handleAffiliateListingRemoved(event: AffiliateListingRemovedEvent): void {
  let id = event.address.toHexString() + "-" + event.params.tokenId.toString();
  let listing = TokenListing.load(id);
  if (listing === null) return;

  listing.active = false;
  listing.lastUpdateAt = event.block.timestamp;
  listing.lastUpdateTx = event.transaction.hash;
  listing.save();
}

export function handleReadyStateChanged(event: ReadyStateChangedEvent): void {
  let storefront = Storefront.load(event.address);
  if (storefront === null) return;

  storefront.ready = event.params.newState;
  storefront.save();
}

export function handleSettleDeadlineUpdated(event: SettleDeadlineUpdatedEvent): void {
  let storefront = Storefront.load(event.address);
  if (storefront === null) return;

  storefront.settleDeadline = event.params.newSettleDeadline;
  storefront.save();
}

export function handleListingAdded(event: AffiliateListingAddedEvent): void {
  handleAffiliateListingAdded(event);
}

export function handleListingUpdated(event: AffiliateListingUpdatedEvent): void {
  handleAffiliateListingUpdated(event);
}

export function handleListingRemoved(event: AffiliateListingRemovedEvent): void {
  handleAffiliateListingRemoved(event);
}

export function handleERC1155TokenAddressChanged(event: ERC1155TokenAddressChangedEvent): void {
  let storefront = Storefront.load(event.address);
  if (storefront === null) return;

  storefront.erc1155Token = event.params.newAddress;
  storefront.ready = false; // Ready state is reset when token address changes
  storefront.save();
}
