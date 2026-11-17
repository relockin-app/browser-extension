import { SESSION_OVERLAY_ID } from "./overlayUI/overlay";
import { SESSION_TIMER_ID } from "./overlayUI/sessionTimer";

/**
 * Present so DOM functions can be copied to iOS/Android versions and use this as a shared dependency even tho other files are different
 */
export const ELEMENT_IDS = {
  SESSION_OVERLAY_ID: SESSION_OVERLAY_ID,
  SESSION_TIMER_ID: SESSION_TIMER_ID,
};
