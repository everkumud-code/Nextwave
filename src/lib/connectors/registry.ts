import type { ConnectorType, MessagingConnector } from "./types";

/**
 * Connector registry keeps provider implementations separate from campaign
 * orchestration. Register production adapters only after credentials,
 * webhook verification, consent controls and provider review are configured.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<ConnectorType, MessagingConnector>();

  register(connector: MessagingConnector): void {
    if (this.connectors.has(connector.type)) {
      throw new Error(`Connector already registered: ${connector.type}`);
    }
    this.connectors.set(connector.type, connector);
  }

  get(type: ConnectorType): MessagingConnector {
    const connector = this.connectors.get(type);
    if (!connector) throw new Error(`Connector is not configured: ${type}`);
    return connector;
  }

  list(): Array<Pick<MessagingConnector, "type" | "displayName">> {
    return [...this.connectors.values()].map(({ type, displayName }) => ({ type, displayName }));
  }

  has(type: ConnectorType): boolean {
    return this.connectors.has(type);
  }
}
