import type {
  ConnectInput,
  ConnectResult,
  ConnectorCapabilities,
  ConnectorHealth,
  ConnectionState,
  MessagingConnector,
  SendMessageInput,
  SendMessageResult,
} from "../types";

/**
 * Experimental QR connector boundary.
 *
 * This is deliberately a disabled provider adapter contract, not a WhatsApp
 * Web protocol implementation. Connect it only to a provider that has been
 * reviewed for account authorisation, security, terms and data processing.
 */
export class ExperimentalQrProviderAdapter implements MessagingConnector {
  readonly type = "QR_PROVIDER_EXPERIMENTAL" as const;
  readonly displayName = "QR provider (experimental)";

  getCapabilities(): ConnectorCapabilities {
    return {
      supportsTemplates: false,
      supportsMedia: false,
      supportsInboundMessages: false,
      supportsDeliveryEvents: false,
      requiresProviderApproval: true,
      experimental: true,
    };
  }

  private assertEnabled(): never {
    throw new Error("Experimental QR connector is disabled. Configure and approve an authorised provider before enabling it.");
  }

  async connect(_input: ConnectInput): Promise<ConnectResult> {
    this.assertEnabled();
  }

  async disconnect(_senderId: string, _organizationId: string): Promise<void> {
    this.assertEnabled();
  }

  async getConnectionStatus(_senderId: string, _organizationId: string): Promise<ConnectionState> {
    return "DISCONNECTED";
  }

  async healthCheck(_senderId: string, _organizationId: string): Promise<ConnectorHealth> {
    return { state: "DISCONNECTED", checkedAt: new Date().toISOString(), detail: "Experimental connector is disabled." };
  }

  async sendMessage(_input: SendMessageInput): Promise<SendMessageResult> {
    this.assertEnabled();
  }
}
