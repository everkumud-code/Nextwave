export type ConnectorType = "META_CLOUD_API" | "QR_PROVIDER_EXPERIMENTAL";
export type ConnectionState = "PENDING" | "CONNECTING" | "CONNECTED" | "ATTENTION" | "DISCONNECTED" | "RESTRICTED";
export type MessageState = "QUEUED" | "SUBMITTED" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface ConnectorCapabilities {
  supportsTemplates: boolean;
  supportsMedia: boolean;
  supportsInboundMessages: boolean;
  supportsDeliveryEvents: boolean;
  requiresProviderApproval: boolean;
  experimental: boolean;
}

export interface ConnectInput {
  senderId: string;
  organizationId: string;
  callbackUrl?: string;
}

export interface ConnectResult {
  state: ConnectionState;
  providerReference?: string;
  userActionRequired?: boolean;
  instructions?: string;
}

export interface SendMessageInput {
  senderId: string;
  organizationId: string;
  recipient: string;
  body: string;
  idempotencyKey: string;
  consentRecordId: string;
}

export interface SendMessageResult {
  accepted: boolean;
  providerMessageId?: string;
  state: MessageState;
  errorCode?: string;
  errorMessage?: string;
}

export interface ConnectorHealth {
  state: ConnectionState;
  checkedAt: string;
  detail?: string;
}

export interface MessagingConnector {
  readonly type: ConnectorType;
  readonly displayName: string;
  getCapabilities(): ConnectorCapabilities;
  connect(input: ConnectInput): Promise<ConnectResult>;
  disconnect(senderId: string, organizationId: string): Promise<void>;
  getConnectionStatus(senderId: string, organizationId: string): Promise<ConnectionState>;
  healthCheck(senderId: string, organizationId: string): Promise<ConnectorHealth>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
