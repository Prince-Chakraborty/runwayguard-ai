export type HoldRequestResult = {
  supported: boolean;
  simulated: boolean;
  providerRef: string | null;
  message: string;
};

export interface PaymentProvider {
  getAccountBalance(merchantId: string): Promise<number>;
  createPaymentHoldRequest(payableId: string, delayDays: number): Promise<HoldRequestResult>;
  createReleaseRequest(payableId: string): Promise<HoldRequestResult>;
  createEarlySettlementRequest(merchantId: string, amount: number): Promise<HoldRequestResult>;
}
