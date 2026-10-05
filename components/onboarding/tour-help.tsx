"use client";

import { restartProductTour } from "./product-tour";

export function TourHelp() {
  return (
    <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => restartProductTour()}>
      Product tour
    </button>
  );
}
