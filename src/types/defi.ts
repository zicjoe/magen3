export * from "@yieldbot/shared";
import type { CapabilityId, ChainFamily, ChainId } from "@yieldbot/shared";

export interface ChainDefinition {
  id: ChainId;
  name: string;
  family: ChainFamily;
  nativeSymbol: string;
  status: "live-core" | "configuration-required";
  capabilities: CapabilityId[];
  explorer: string;
}
