import { BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts";
import { StorefrontCreated as StorefrontCreatedEventV2 } from "../generated/SimpleERC1155StorefrontFactory2/SimpleERC1155StorefrontFactoryV2";
import { SimpleERC1155StorefrontV2 } from "../generated/templates/SimpleERC1155StorefrontV2/SimpleERC1155StorefrontV2";
import { Storefront } from "../generated/schema";
import { SimpleERC1155StorefrontV2 as StorefrontTemplateV2 } from "../generated/templates";

export function handleStorefrontCreatedV2(event: StorefrontCreatedEventV2): void {
  // Create storefront entity with event address as ID
  let storefront = new Storefront(event.params.storefront);
  
  // Bind to the contract to fetch additional data
  let storefrontContract = SimpleERC1155StorefrontV2.bind(event.params.storefront);

  // Basic properties from event
  storefront.storefrontAddress = event.params.storefront;
  storefront.owner = event.params.owner;
  storefront.erc1155Token = event.params.erc1155Token;
  storefront.escrowFactory = event.params.escrowFactory;

  // V2 storefronts are not affiliate-enabled by default
  storefront.isAffiliateEnabled = false;
  storefront.affiliateVerifier = Bytes.empty();

  // Contract calls
  let arbiterResult = storefrontContract.try_getArbiter();
  let minSettleTimeResult = storefrontContract.try_MIN_SETTLE_TIME();
  let settleDeadlineResult = storefrontContract.try_settleDeadline();
  let readyResult = storefrontContract.try_ready();
  let seaportResult = storefrontContract.try_SEAPORT();

  // Set values with proper fallbacks
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

  // Set review stats
  storefront.totalRating = BigInt.fromI32(0);
  storefront.reviewCount = BigInt.fromI32(0);
    
  // Metadata
  storefront.createdAt = event.block.timestamp;
  storefront.createdAtBlock = event.block.number;
  storefront.creationTx = event.transaction.hash;

  storefront.save();

  // Create the template
  StorefrontTemplateV2.create(event.params.storefront);
}
