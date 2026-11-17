// Lets the not-allowed refusal send the user to their guardrail settings —
// mirrors iOS RelockrHubNavigationRequest.requestGuardrailsTab.
//
// The challenge modal is plain DOM shared by the popup and the page overlay,
// so it can't reach the popup's tab state itself. The popup registers how to
// get there; the overlay registers nothing, and the refusal only says where
// the settings live.

let navigator: (() => void) | null = null;

/** Registers how to show the guardrail settings. Returns an unregister function. */
export function setGuardrailsNavigator(navigate: () => void): () => void {
  navigator = navigate;
  return () => {
    if (navigator === navigate) navigator = null;
  };
}

/** How to show the guardrail settings from here, or null when this context can't. */
export function getGuardrailsNavigator(): (() => void) | null {
  return navigator;
}
