# Unified Storefront Subgraph

This subgraph indexes storefront platforms on Base, combining affiliate functionality and reviews to provide comprehensive data about storefronts, listings, sales, and buyer feedback.

## Overview

The Unified Storefront Subgraph integrates:
- ERC1155 storefronts (both standard and affiliate-enabled)
- Escrow-based purchases
- On-chain attestations for sales
- Customer review system

## Key Features

- **Complete sales tracking**: Captures the full lifecycle from listing creation to sale completion
- **Escrow integration**: Tracks escrow states and settlements
- **Review system**: Links verified reviews to specific purchases via attestations
- **Reputation metrics**: Aggregates review ratings at the storefront and seller level

## Entities

### Storefront
Represents an on-chain marketplace managed by a single owner.
```graphql
{
  storefronts {
    id
    owner
    totalRating
    reviewCount
    # ... other fields
  }
}
```

### TokenListing
An item for sale in a storefront.
```graphql
{
  tokenListings {
    id
    tokenId
    price
    active
    affiliateFee
    # ... other fields
  }
}
```

### Order
Represents a successful purchase.
```graphql
{
  orders {
    id
    buyer
    seller
    tokenId
    amount
    # ... other fields
  }
}
```

### OrderEscrow
Manages secure payment for an order.
```graphql
{
  orderEscrows {
    id
    payee
    payer
    isDisputed
    isRefunded
    affiliate
    affiliateShare
    # ... other fields
  }
}
```

### SaleAttestation
Verifiable proof that a sale occurred (created via the Ethereum Attestation Service).
```graphql
{
  saleAttestations {
    id
    buyer
    seller
    transactionHash
    # ... other fields
  }
}
```

### Review
Customer feedback tied to a verified sale.
```graphql
{
  reviews {
    id
    reviewType # "buyer" or "seller"
    overallRating
    reviewText
    # ... other fields
  }
}
```

## Example Queries

### Get storefront details with reviews
```graphql
{
  storefront(id: "0x...") {
    id
    owner
    totalRating
    reviewCount
    orders(first: 10, orderBy: timestamp, orderDirection: desc) {
      id
      tokenId
      buyer
      timestamp
    }
    reviews(first: 5, orderBy: timestamp, orderDirection: desc) {
      overallRating
      reviewText
      reviewType
    }
  }
}
```

### Track affiliate performance
```graphql
{
  orders(where: {affiliate: "0x..."}) {
    id
    buyer
    tokenId
    amount
    affiliateShare
    timestamp
    storefront {
      id
      owner
    }
  }
}
```

### Check sale attestations and reviews
```graphql
{
  saleAttestations(where: {buyer: "0x..."}) {
    id
    order {
      tokenId
      amount
      timestamp
    }
    reviews {
      reviewType
      overallRating
      reviewText
      timestamp
    }
  }
}
```

## Integration Details

### Affiliate System
The affiliate system allows third parties to refer buyers and earn a commission on sales. This subgraph tracks:
- Affiliate referrals
- Commission rates
- Escrow-based payments
- Settlement status

### Review System
The review system uses Ethereum Attestation Service (EAS) to:
1. Verify that a sale occurred (via a sale attestation)
2. Link reviews to specific purchases
3. Ensure only legitimate buyers can leave reviews
4. Track seller reputation through aggregated metrics

## Deployed Contracts

This subgraph indexes the following contracts:

- **SimpleERC1155StorefrontFactory**: [`0x3386E47e77fC2784C79A99db0c0Bb7CdB4525C52`](https://basescan.org/address/0x3386E47e77fC2784C79A99db0c0Bb7CdB4525C52)
- **SimpleERC1155StorefrontFactory2**: [`0xbe203eCCB0507e4558A7990271d59Cd6D9ceb1bA`](https://basescan.org/address/0xbe203eCCB0507e4558A7990271d59Cd6D9ceb1bA)
- **AffiliateERC1155StorefrontFactory**: [`0x59321B6B3AA8573DD33A6314cb48C6849Cd55C72`](https://basescan.org/address/0x59321B6B3AA8573DD33A6314cb48C6849Cd55C72)
- **EscrowFactory**: [`0x04e6654D571AcF88Edb26d4FA5ff9E3CA6209dF7`](https://basescan.org/address/0x04e6654D571AcF88Edb26d4FA5ff9E3CA6209dF7)
- **AffiliateEscrowFactory**: [`0xE07c41Bc76A8B56ad7E996cF60A3dDeD96ca575D`](https://basescan.org/address/0xE07c41Bc76A8B56ad7E996cF60A3dDeD96ca575D)
- **SaleAttestationResolver**: [`0xD7dd33f5815E499DA3DeaB5C812489c5e454eD7E`](https://basescan.org/address/0xD7dd33f5815E499DA3DeaB5C812489c5e454eD7E)
- **ReviewResolver**: [`0xB09d28897dB473b66A31a3659ae5BA75A2Ad9703`](https://basescan.org/address/0xB09d28897dB473b66A31a3659ae5BA75A2Ad9703)
- **Seaport**: [`0x0000000000000068F116a894984e2DB1123eB395`](https://basescan.org/address/0x0000000000000068F116a894984e2DB1123eB395)

