import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { StorefrontCreated as StorefrontCreatedEvent } from "../generated/SimpleERC1155StorefrontFactory/SimpleERC1155StorefrontFactory";
import { SimpleERC1155Storefront } from "../generated/SimpleERC1155StorefrontFactory/SimpleERC1155Storefront";
import { Storefront } from "../generated/schema";
import { SimpleERC1155Storefront as StorefrontTemplate } from "../generated/templates";

export function handleStorefrontCreated(event: StorefrontCreatedEvent): void {
  // Create storefront entity with event address as ID
  let storefront = new Storefront(event.params.storefront);
  
  let storefrontContract = SimpleERC1155Storefront.bind(event.params.storefront);

  storefront.storefrontAddress = event.params.storefront;
  storefront.owner = event.params.owner;
  storefront.erc1155Token = event.params.erc1155Token;
  
  // Set default values for affiliate fields
  storefront.isAffiliateEnabled = false;
  storefront.affiliateVerifier = Bytes.empty();

  let arbiterResult = storefrontContract.try_getArbiter();
  let escrowFactoryResult = storefrontContract.try_escrowFactory();
  let minSettleTimeResult = storefrontContract.try_MIN_SETTLE_TIME();
  let settleDeadlineResult = storefrontContract.try_settleDeadline();
  let readyResult = storefrontContract.try_ready();
  let seaportResult = storefrontContract.try_SEAPORT();

  storefront.arbiter = arbiterResult.reverted
    ? Bytes.empty()
    : arbiterResult.value;
  storefront.escrowFactory = escrowFactoryResult.reverted
    ? Bytes.empty()
    : escrowFactoryResult.value;
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

  StorefrontTemplate.create(event.params.storefront);
}
