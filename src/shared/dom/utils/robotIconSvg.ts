// Boxicons "robot" (basic and filled), MIT licence, Copyright (c) 2026 Boxicons.
// Drawn in currentColor, or the RelockIn gradient. Shared with the
// onboarding's RobotIcon.svelte.

import {
  RL_ACCENT_BLUE,
  RL_ACCENT_LAVENDER,
} from "../../overlayUI/designTokens";

const SVG_NS = "http://www.w3.org/2000/svg";

export const ROBOT_ICON_PATHS = {
  basic: [
    "M8.5 10A1.5 2 0 1 0 8.5 14 1.5 2 0 1 0 8.5 10z",
    "M15.5 10A1.5 2 0 1 0 15.5 14 1.5 2 0 1 0 15.5 10z",
    "M8 16H16V18H8z",
    "m21,11v-3c0-1.1-.9-2-2-2h-6v-1.39c.3-.27.5-.67.5-1.11,0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5,1.5c0,.44.2.84.5,1.11v1.39h-6c-1.1,0-2,.9-2,2v3c-.55,0-1,.45-1,1v4c0,.55.45,1,1,1v3c0,1.1.9,2,2,2h14c1.1,0,2-.9,2-2v-3c.55,0,1-.45,1-1v-4c0-.55-.45-1-1-1ZM5,20v-12h14v4s0,0,0,0v4s0,0,0,0v4s-14,0-14,0Z",
  ],
  filled: [
    "m21,11v-3c0-1.1-.9-2-2-2h-6v-1.39c.3-.27.5-.67.5-1.11,0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5,1.5c0,.44.2.84.5,1.11v1.39h-6c-1.1,0-2,.9-2,2v3c-.55,0-1,.45-1,1v4c0,.55.45,1,1,1v3c0,1.1.9,2,2,2h14c1.1,0,2-.9,2-2v-3c.55,0,1-.45,1-1v-4c0-.55-.45-1-1-1Zm-14,1c0-1.1.67-2,1.5-2s1.5.9,1.5,2-.67,2-1.5,2-1.5-.9-1.5-2Zm9,6h-8v-2h8v2Zm-.5-4c-.83,0-1.5-.9-1.5-2s.67-2,1.5-2,1.5.9,1.5,2-.67,2-1.5,2Z",
  ],
} as const;

/** Blue to lavender, left to right, as on the RelockIn icon. */
export const ROBOT_GRADIENT_STOPS = [
  { offset: "0%", color: RL_ACCENT_BLUE },
  { offset: "100%", color: RL_ACCENT_LAVENDER },
] as const;

let nextGradientId = 0;

/** The AI robot, filling its parent. */
export function createRobotIconSvg(filled = false, gradient = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  let fill = "currentColor";
  if (gradient) {
    const id = `relockr-robot-gradient-${nextGradientId++}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    const linear = document.createElementNS(SVG_NS, "linearGradient");
    for (const [name, value] of Object.entries({ id, x1: "0", y1: "0", x2: "1", y2: "0" })) {
      linear.setAttribute(name, value);
    }
    for (const stop of ROBOT_GRADIENT_STOPS) {
      const el = document.createElementNS(SVG_NS, "stop");
      el.setAttribute("offset", stop.offset);
      el.setAttribute("stop-color", stop.color);
      linear.appendChild(el);
    }
    defs.appendChild(linear);
    svg.appendChild(defs);
    fill = `url(#${id})`;
  }
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: "100%",
    height: "100%",
    fill,
    "aria-hidden": "true",
  })) {
    svg.setAttribute(name, value);
  }
  for (const d of ROBOT_ICON_PATHS[filled ? "filled" : "basic"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
