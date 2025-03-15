import { Address, BigInt } from "@graphprotocol/graph-ts"
import { ERC1155Token, ERC1155TokenInstance } from "../generated/schema"
import { ReceiptERC1155 } from "../generated/templates/ReceiptERC1155/ReceiptERC1155"

export function handleTokenTransfer(tokenAddress: Address, tokenId: BigInt): void {
  let contract = ReceiptERC1155.bind(tokenAddress)
  
  let tokenContract = ERC1155Token.load(tokenAddress.toHexString())
  if (!tokenContract) {
    tokenContract = new ERC1155Token(tokenAddress.toHexString())
    tokenContract.save()
  }

  let instanceId = tokenAddress.toHexString() + "-" + tokenId.toString()
  let instance = ERC1155TokenInstance.load(instanceId)
  if (!instance) {
    instance = new ERC1155TokenInstance(instanceId)
    instance.contract = tokenContract.id
    instance.tokenId = tokenId
    
    let uriCall = contract.try_uri(tokenId)
    if (!uriCall.reverted) {
      instance.uri = uriCall.value
    }
    instance.save()
  }
}
