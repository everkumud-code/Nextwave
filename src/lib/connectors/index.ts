import { ConnectorRegistry } from "./registry";
import { MetaCloudApiAdapter } from "./meta-cloud/adapter";
import { ExperimentalQrProviderAdapter } from "./qr-provider/adapter";

export function createConnectorRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  registry.register(new MetaCloudApiAdapter());

  // Registered for capability discovery, but all QR operations remain disabled.
  registry.register(new ExperimentalQrProviderAdapter());

  return registry;
}

export * from "./types";
export * from "./registry";
