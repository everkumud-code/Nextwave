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
 * Meta Cloud API adapter scaffold.
 * Add the official Graph API client, Embedded Signup exchange, encrypted
 * token vault and verified webhook handler before enabling production sends.
 */
export class MetaCloudApiAdapter implements MessagingConnector {
  readonly type = "META_CLOUD_API" as const;
  readonly displayName = "WhatsApp Cloud API";

  getCapabilities(): ConnectorCapabilities {
    return {
      configured: false,
      supportsTemplates: true,
      supportsMedia: true,
      supportsInboundMessages: true,
      supportsDeliveryEvents: true,
      requiresProviderApproval: true,
      experimental: false,
    };
  }

  async connect(_input: ConnectInput): Promise<ConnectResult> {
    return {
      state: "PENDING",
      userActionRequired: true,
      instructions: "Complete Meta Embedded Signup after Meta app configuration and business verification.",
    };
  }

  async disconnect(_senderId: string, _organizationId: string): Promise<void> {
    throw new Error("Meta account disconnection is not configured yet.");
  }

  async getConnectionStatus(_senderId: string, _organizationId: string): Promise<ConnectionState> {
    return "DISCONNECTED";
  }

  async healthCheck(_senderId: string, _organizationId: string): Promise<ConnectorHealth> {
    return { state: "DISCONNECTED", checkedAt: new Date().toISOString(), detail: "Meta credentials and webhook configuration are not set." };
  }

  async sendMessage(_input: SendMessageInput): Promise<SendMessageResult> {
    return {
      accepted: false,
      state: "FAILED",
      errorCode: "CONNECTOR_NOT_CONFIGURED",
      errorMessage: "Configure Meta credentials, consent checks and approved templates before enabling message delivery.",
    };
  }
}
