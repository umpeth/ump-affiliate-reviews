import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { StorefrontCreated as AffiliateStorefrontCreatedEvent } from "../generated/AffiliateERC1155StorefrontFactory/AffiliateERC1155StorefrontFactory";
import { AffiliateERC1155Storefront as AffiliateERC1155StorefrontContract } from "../generated/AffiliateERC1155StorefrontFactory/AffiliateERC1155Storefront";
import { Storefront } from "../generated/schema";
import { AffiliateERC1155Storefront as AffiliateStorefrontTemplate } from "../generated/templates";

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

  // Set review stats
  storefront.totalRating = BigInt.fromI32(0);
  storefront.reviewCount = BigInt.fromI32(0);

  storefront.createdAt = event.block.timestamp;
  storefront.createdAtBlock = event.block.number;
  storefront.creationTx = event.transaction.hash;

  storefront.save();

  // Create the template instance to track events from this storefront
  AffiliateStorefrontTemplate.create(event.params.storefront);
}
