import { ConnectorRegistry } from "./registry";
import { MetaCloudApiAdapter } from "./meta-cloud/adapter";
import { ExperimentalQrProviderAdapter } from "./qr-provider/adapter";

export function createConnectorRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  registry.register(new MetaCloudApiAdapter());

  // QR operations are enabled when the separately deployed runtime URL and token are configured.
  registry.register(new ExperimentalQrProviderAdapter());

  return registry;
}

export * from "./types";
export * from "./registry";
