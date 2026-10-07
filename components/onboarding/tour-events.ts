export const TOUR_KEY = "generalmind-tour-completed";

/** Lightweight trigger so nav code never pulls the tour library into the first-load bundle. */
export function restartProductTour() {
  localStorage.removeItem(TOUR_KEY);
  window.dispatchEvent(new Event("gm-start-tour"));
}
