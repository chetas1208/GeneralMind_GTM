import type { WorkflowFamily, WorkflowType } from "./types";

export const WORKFLOW_FAMILIES: Record<WorkflowFamily, { label: string; workflows: WorkflowType[] }> = {
  procure_to_pay: {
    label: "Procure-to-pay",
    workflows: [
      "po_confirmation",
      "po_follow_up",
      "supplier_communication",
      "rfq_coordination",
      "purchase_order_creation",
      "accounts_payable",
      "freight_ap",
      "invoice_document_processing",
      "matching",
      "claims",
      "inbound_logistics",
      "exception_management",
    ],
  },
  order_to_cash: {
    label: "Order-to-cash",
    workflows: [
      "sales_order_creation",
      "sales_order_modification",
      "quote_creation",
      "order_intake",
      "customer_communication",
      "outbound_logistics",
      "order_status",
      "accounts_receivable",
      "collections",
      "reconciliation",
      "exception_management",
    ],
  },
  erp_workflow: {
    label: "ERP workflow",
    workflows: [
      "sap_operations",
      "erp_sync",
      "email_to_erp",
      "document_to_erp",
      "manual_data_entry",
      "approval_workflows",
      "cross_system_ops",
    ],
  },
};

/** Keyword hints for inferring likely workflows from public text (deterministic). */
export const WORKFLOW_KEYWORDS: Partial<Record<WorkflowType, string[]>> = {
  accounts_payable: ["accounts payable", "invoice processing", "ap automation", "three-way match"],
  supplier_communication: ["supplier communication", "vendor portal", "supplier onboarding"],
  rfq_coordination: ["rfq", "request for quote", "sourcing event"],
  purchase_order_creation: ["purchase order", "po creation", "procure-to-pay", "p2p"],
  order_intake: ["order intake", "order entry", "sales order"],
  sales_order_creation: ["sales order", "order management", "order-to-cash", "o2c"],
  sap_operations: ["sap s/4", "sap ecc", "sap erp", "sap mm", "sap sd"],
  inbound_logistics: ["inbound logistics", "receiving", "dock scheduling"],
  exception_management: ["exception handling", "dispute", "claims management"],
};

export function allWorkflowTypes(): WorkflowType[] {
  return Object.values(WORKFLOW_FAMILIES).flatMap((f) => f.workflows);
}

export function workflowLabel(w: WorkflowType): string {
  return w.replace(/_/g, " ");
}
