export const ORDER_WORKFLOW_STATUSES = [
  { value: 'received', label: 'Order received' },
  { value: 'artwork_review', label: 'Artwork review' },
  { value: 'ordered_for_production', label: 'Ordered for production' },
  { value: 'in_production', label: 'In production' },
  { value: 'ready_for_pickup', label: 'Ready for pickup' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
] as const;

export type OrderWorkflowStatus = typeof ORDER_WORKFLOW_STATUSES[number]['value'];

export type OrderStatusEvent = {
  id: string;
  status: OrderWorkflowStatus;
  label: string;
  createdAt: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  customerNotified: boolean;
  emailStatus: 'not_requested' | 'pending' | 'sent' | 'failed';
  emailSentAt?: string;
  emailError?: string;
};

export type OrderWorkflow = {
  currentStatus: OrderWorkflowStatus;
  currentLabel: string;
  updatedAt: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  history: OrderStatusEvent[];
};

export const isOrderWorkflowStatus = (value: unknown): value is OrderWorkflowStatus => ORDER_WORKFLOW_STATUSES.some((entry) => entry.value === value);

export const getOrderWorkflowLabel = (status: string | undefined) => ORDER_WORKFLOW_STATUSES.find((entry) => entry.value === status)?.label || 'Order received';

export const normalizeOrderWorkflowStatus = (value: unknown): OrderWorkflowStatus => isOrderWorkflowStatus(value) ? value : 'received';
