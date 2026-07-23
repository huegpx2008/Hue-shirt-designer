export const CUSTOM_ORDER_ACKNOWLEDGMENT_VERSION = 'custom-order-v1';

export const CUSTOM_ORDER_ACKNOWLEDGMENT_STATEMENT = 'I understand that each item is made specifically for my order, and I have reviewed my artwork and order details. Custom orders cannot be returned or exchanged for change of mind, and changes or cancellations cannot be guaranteed after production begins. If my order arrives damaged, defective, or different from what I ordered, I will contact Hue Graphics so they can make it right.';

export type CheckoutAcknowledgment = {
  accepted: true;
  acceptedAt: string;
  version: typeof CUSTOM_ORDER_ACKNOWLEDGMENT_VERSION;
  statement: typeof CUSTOM_ORDER_ACKNOWLEDGMENT_STATEMENT;
};

export const createCheckoutAcknowledgment = (acceptedAt = new Date().toISOString()): CheckoutAcknowledgment => ({
  accepted: true,
  acceptedAt,
  version: CUSTOM_ORDER_ACKNOWLEDGMENT_VERSION,
  statement: CUSTOM_ORDER_ACKNOWLEDGMENT_STATEMENT,
});

export const hasValidCheckoutAcknowledgment = (value: unknown): value is CheckoutAcknowledgment => {
  if (!value || typeof value !== 'object') return false;
  const acknowledgment = value as Partial<CheckoutAcknowledgment>;
  return acknowledgment.accepted === true
    && acknowledgment.version === CUSTOM_ORDER_ACKNOWLEDGMENT_VERSION
    && acknowledgment.statement === CUSTOM_ORDER_ACKNOWLEDGMENT_STATEMENT
    && typeof acknowledgment.acceptedAt === 'string'
    && Number.isFinite(Date.parse(acknowledgment.acceptedAt));
};
