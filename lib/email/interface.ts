export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}
export interface EmailProvider {
  send(msg: EmailMessage): Promise<{ id: string }>;
}
