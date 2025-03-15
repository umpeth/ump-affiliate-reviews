import { newMockEvent } from "matchstick-as"
import { ethereum, Address } from "@graphprotocol/graph-ts"
import { EscrowCreated } from "../generated/EscrowFactory/EscrowFactory"

export function createEscrowCreatedEvent(
  escrowAddress: Address,
  payee: Address,
  storefront: Address,
  escrowAgent: Address
): EscrowCreated {
  let escrowCreatedEvent = changetype<EscrowCreated>(newMockEvent())

  escrowCreatedEvent.parameters = new Array()

  escrowCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "escrowAddress",
      ethereum.Value.fromAddress(escrowAddress)
    )
  )
  escrowCreatedEvent.parameters.push(
    new ethereum.EventParam("payee", ethereum.Value.fromAddress(payee))
  )
  escrowCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "storefront",
      ethereum.Value.fromAddress(storefront)
    )
  )
  escrowCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "escrowAgent",
      ethereum.Value.fromAddress(escrowAgent)
    )
  )

  return escrowCreatedEvent
}
