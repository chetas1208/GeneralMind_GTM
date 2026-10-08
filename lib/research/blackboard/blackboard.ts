import type { KnowledgeSlot, EvidenceClaim, ContradictionItem } from "./types";
import { createDefaultSlots } from "./slots";

export class EvidenceBlackboard {
  readonly targetId: string;
  private slots: Map<string, KnowledgeSlot>;
  private claims: EvidenceClaim[] = [];
  private contradictions: ContradictionItem[] = [];

  constructor(targetId: string, initialSlots?: Record<string, KnowledgeSlot>) {
    this.targetId = targetId;
    this.slots = new Map();
    const defaults = initialSlots ?? createDefaultSlots();
    for (const [k, v] of Object.entries(defaults)) {
      this.slots.set(k, { ...v });
    }
  }

  getSlot(key: string): KnowledgeSlot | undefined {
    return this.slots.get(key);
  }

  getAllSlots(): KnowledgeSlot[] {
    return Array.from(this.slots.values());
  }

  getClaims(): EvidenceClaim[] {
    return [...this.claims];
  }

  getContradictions(): ContradictionItem[] {
    return [...this.contradictions];
  }

  addClaim(claim: EvidenceClaim): void {
    this.claims.push(claim);
    const slot = this.slots.get(claim.slotKey);
    if (!slot) return;

    slot.evidenceIds.push(claim.id);
    slot.lastUpdatedAt = new Date().toISOString();

    // Check for contradiction against existing claims for this slot
    const prevClaims = this.claims.filter(
      (c) => c.slotKey === claim.slotKey && c.id !== claim.id,
    );
    for (const prev of prevClaims) {
      if (this.isContradictory(prev, claim)) {
        slot.state = "conflicted";
        slot.confidenceBand = "conflicted";
        this.contradictions.push({
          slotKey: claim.slotKey,
          claimA: prev,
          claimB: claim,
          detectedAt: new Date().toISOString(),
          resolved: false,
        });
        return;
      }
    }

    // Upgrade slot state based on confidence
    if (claim.confidence >= 80) {
      slot.state = "supported";
      slot.confidenceBand = "confirmed";
      slot.value = claim.claim;
    } else if (claim.confidence >= 55) {
      slot.state = "supported";
      slot.confidenceBand = "strong";
      slot.value = claim.claim;
    } else if (claim.confidence >= 35) {
      slot.state = "partial";
      slot.confidenceBand = "moderate";
      if (!slot.value) slot.value = claim.claim;
    }
  }

  updateSlot(key: string, patch: Partial<KnowledgeSlot>): void {
    const existing = this.slots.get(key);
    if (existing) {
      this.slots.set(key, { ...existing, ...patch, lastUpdatedAt: new Date().toISOString() });
    }
  }

  private isContradictory(a: EvidenceClaim, b: EvidenceClaim): boolean {
    const textA = a.claim.toLowerCase();
    const textB = b.claim.toLowerCase();

    // Simple deterministic negation detection
    const negatives = ["not ", "no longer", "left company", "replaced", "does not use", "deprecated", "abandoned"];
    const aHasNeg = negatives.some((n) => textA.includes(n));
    const bHasNeg = negatives.some((n) => textB.includes(n));
    if ((aHasNeg && !bHasNeg) || (!aHasNeg && bHasNeg)) {
      return true;
    }

    // Technology conflict (e.g., exclusively uses Oracle vs exclusively uses SAP)
    if (
      (textA.includes("oracle only") && textB.includes("sap s/4hana")) ||
      (textA.includes("sap only") && textB.includes("oracle fusion"))
    ) {
      return true;
    }

    return false;
  }

  isCriticalDisconfirmed(): boolean {
    // If negative slots are strongly supported
    const negAutomated = this.slots.get("negative.already_automated");
    const negDeparted = this.slots.get("negative.person_departed");
    if (negAutomated?.state === "supported" && negAutomated.confidenceBand === "confirmed") {
      return true;
    }
    if (negDeparted?.state === "supported" && negDeparted.confidenceBand === "confirmed") {
      return true;
    }
    return false;
  }

  serialize(): {
    targetId: string;
    slots: Record<string, KnowledgeSlot>;
    claims: EvidenceClaim[];
    contradictions: ContradictionItem[];
  } {
    const slotMap: Record<string, KnowledgeSlot> = {};
    for (const [k, v] of this.slots.entries()) {
      slotMap[k] = { ...v };
    }
    return {
      targetId: this.targetId,
      slots: slotMap,
      claims: [...this.claims],
      contradictions: [...this.contradictions],
    };
  }
}
