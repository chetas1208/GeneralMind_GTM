/** Typed GeneralMind ICP concepts — inspectable, not prompt soup. */

export type WorkflowFamily = "procure_to_pay" | "order_to_cash" | "erp_workflow";

export type WorkflowType =
  | "po_confirmation"
  | "po_follow_up"
  | "supplier_communication"
  | "rfq_coordination"
  | "purchase_order_creation"
  | "accounts_payable"
  | "freight_ap"
  | "invoice_document_processing"
  | "matching"
  | "claims"
  | "inbound_logistics"
  | "exception_management"
  | "sales_order_creation"
  | "sales_order_modification"
  | "quote_creation"
  | "order_intake"
  | "customer_communication"
  | "outbound_logistics"
  | "order_status"
  | "accounts_receivable"
  | "collections"
  | "reconciliation"
  | "sap_operations"
  | "erp_sync"
  | "email_to_erp"
  | "document_to_erp"
  | "manual_data_entry"
  | "approval_workflows"
  | "cross_system_ops";

export type OperationalSignal =
  | "sap"
  | "erp_complexity"
  | "global_supply_chain"
  | "high_order_volume"
  | "high_supplier_count"
  | "document_heavy"
  | "manual_workflows"
  | "multi_entity"
  | "shared_services"
  | "procurement_complexity"
  | "order_management_complexity";

export type IndustryTier = "A" | "B" | "C";

export type PersonaFamily =
  | "executive_operations"
  | "procurement"
  | "supply_chain"
  | "operations"
  | "order_management"
  | "finance_operations"
  | "enterprise_technology"
  | "negative"
  | "other";

export type Persona =
  | "operations_leadership"
  | "supply_chain"
  | "procurement"
  | "order_management"
  | "finance_operations"
  | "it_erp"
  | "digital_transformation"
  | "executive_other"
  | "other";

export type Seniority = "c_suite" | "vp" | "head" | "director" | "manager" | "individual" | "unknown";

export type AttendanceKind =
  | "official_speaker"
  | "organizer"
  | "public_attendance"
  | "exhibitor_employee"
  | "sponsor_employee"
  | "partner_employee"
  | "company_participating"
  | "inferred";

export type OpportunityClassification = "evidence_backed" | "strong_inference" | "speculative";

export type OpportunityHypothesis = {
  workflows: WorkflowType[];
  confidence: number;
  evidence: string[];
  rationale: string;
  classification: OpportunityClassification;
  promptVersion?: string;
  model?: string;
  generatedAt?: string;
};

export type ScoreFactor = { key: string; label: string; points: number; max: number; note: string };
export type ScoreSection = { total: number; max: number; factors: ScoreFactor[] };
