import { BigInt, Bytes, log, crypto, ByteArray } from "@graphprotocol/graph-ts";
import { StorefrontCreated as AffiliateStorefrontCreatedEvent } from "../generated/AffiliateERC1155StorefrontFactory/AffiliateERC1155StorefrontFactory";
import { AffiliateERC1155Storefront as AffiliateERC1155StorefrontContract } from "../generated/AffiliateERC1155StorefrontFactory/AffiliateERC1155Storefront";
import { ReceiptERC1155 } from "../generated/AffiliateERC1155StorefrontFactory/ReceiptERC1155";
import { Storefront, ERC1155ContractMetadata } from "../generated/schema";
import { AffiliateERC1155Storefront as AffiliateStorefrontTemplate } from "../generated/templates";
import { Address, ByteArray, crypto } from "@graphprotocol/graph-ts";

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
      nameStart++ 
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
      descStart++ 
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
      imageStart++ 
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

export function handleAffiliateStorefrontCreated(event: AffiliateStorefrontCreatedEvent): void {
  // Create storefront entity with event address as ID
  let storefront = new Storefront(event.params.storefront);
  
  let storefrontContract = AffiliateERC1155StorefrontContract.bind(event.params.storefront);

  storefront.storefrontAddress = event.params.storefront;
  storefront.owner = event.params.owner;
  storefront.erc1155Token = event.params.erc1155Token;
  storefront.escrowFactory = event.params.escrowFactory;
  storefront.affiliateVerifier = event.params.affiliateVerifier;
  storefront.isAffiliateEnabled = true;

  let arbiterResult = storefrontContract.try_getArbiter();
  let minSettleTimeResult = storefrontContract.try_MIN_SETTLE_TIME();
  let settleDeadlineResult = storefrontContract.try_settleDeadline();
  let readyResult = storefrontContract.try_ready();
  let seaportResult = storefrontContract.try_SEAPORT();

  storefront.arbiter = arbiterResult.reverted
    ? Bytes.empty()
    : arbiterResult.value;
  storefront.minSettleTime = minSettleTimeResult.reverted
    ? BigInt.zero()
    : minSettleTimeResult.value;
  storefront.settleDeadline = settleDeadlineResult.reverted
    ? BigInt.zero()
    : settleDeadlineResult.value;
  storefront.ready = readyResult.reverted ? false : readyResult.value;
  storefront.seaport = seaportResult.reverted
    ? Bytes.empty()
    : seaportResult.value;

  // Try to get contractURI from the ERC1155 token contract
  // This is critical since we know the token address is set at creation time
  let erc1155Contract = ReceiptERC1155.bind(event.params.erc1155Token);
  let contractURIResult = erc1155Contract.try_contractURI();
  
  if (!contractURIResult.reverted) {
    storefront.contractURI = contractURIResult.value;
    let contractMetadataId = parseContractMetadata(contractURIResult.value);
    if (contractMetadataId != '') {
      storefront.contractMetadata = contractMetadataId;
    }
    log.info("Set contractURI for new storefront: {}, Token: {}, URI: {}", [
      event.params.storefront.toHexString(),
      event.params.erc1155Token.toHexString(),
      contractURIResult.value
    ]);
  } else {
    log.warning("Failed to fetch contractURI for new storefront token: {}", [
      event.params.erc1155Token.toHexString()
    ]);
  }

  // Set review stats
  storefront.totalRating = BigInt.fromI32(0);
  storefront.reviewCount = BigInt.fromI32(0);

  storefront.createdAt = event.block.timestamp;
  storefront.createdAtBlock = event.block.number;
  storefront.creationTx = event.transaction.hash;

  storefront.save();

  // Create the template instance to track events from this storefront
  AffiliateStorefrontTemplate.create(event.params.storefront);
  
  log.info("Created new storefront: {}, Owner: {}, Token: {}", [
    event.params.storefront.toHexString(),
    event.params.owner.toHexString(),
    event.params.erc1155Token.toHexString()
  ]);
}
