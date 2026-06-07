import { SuiGrpcClient } from "@mysten/sui/grpc"

import { SUI_GRPC_URL, SUI_NETWORK } from "./config"

let suiGrpcClient: SuiGrpcClient | undefined

export function getSuiGrpcClient() {
  suiGrpcClient ??= new SuiGrpcClient({
    baseUrl: SUI_GRPC_URL,
    network: SUI_NETWORK,
  })

  return suiGrpcClient
}
