const SVG_NS = "http://www.w3.org/2000/svg";

export type RedditIconName =
  | "upvote"
  | "downvote"
  | "reply"
  | "more"
  | "save"
  | "upvoteOutline"
  | "downvoteOutline"
  | "saveOutline"
  | "collapse"
  | "expand"
  | "hide"
  | "share"
  | "openComments"
  | "clock"
  | "externalLink"
  | "comment"
  | "chatBubble";

export const ICON_UPVOTE: RedditIconName = "upvote";
export const ICON_DOWNVOTE: RedditIconName = "downvote";
export const ICON_REPLY: RedditIconName = "reply";
export const ICON_MORE: RedditIconName = "more";
export const ICON_SAVE: RedditIconName = "save";
export const ICON_UPVOTE_OUTLINE: RedditIconName = "upvoteOutline";
export const ICON_DOWNVOTE_OUTLINE: RedditIconName = "downvoteOutline";
export const ICON_SAVE_OUTLINE: RedditIconName = "saveOutline";
export const ICON_COLLAPSE: RedditIconName = "collapse";
export const ICON_EXPAND: RedditIconName = "expand";
export const ICON_HIDE: RedditIconName = "hide";
export const ICON_SHARE: RedditIconName = "share";
export const ICON_OPEN_COMMENTS: RedditIconName = "openComments";
export const ICON_CLOCK: RedditIconName = "clock";
export const ICON_EXTERNAL_LINK: RedditIconName = "externalLink";
export const ICON_COMMENT: RedditIconName = "comment";
export const ICON_CHAT_BUBBLE: RedditIconName = "chatBubble";

type SvgChildSpec = {
  tag: "path" | "circle";
  attrs: Record<string, string>;
};

type SvgSpec = {
  viewBox?: string;
  children: SvgChildSpec[];
};

const TRANSPARENT_24: SvgChildSpec = {
  tag: "path",
  attrs: { d: "M0 0h24v24H0z", fill: "none" },
};

const ICON_SPECS: Record<RedditIconName, SvgSpec> = {
  upvote: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625l-8-10c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14",
        },
      },
    ],
  },
  downvote: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M20.901 10.566A1 1 0 0 0 20 10h-4V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v7H4a1.001 1.001 0 0 0-.781 1.625l8 10a1 1 0 0 0 1.562 0l8-10c.24-.301.286-.712.12-1.059",
        },
      },
    ],
  },
  reply: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M10 9V5l-7 7l7 7v-4.1c5 0 8.5 1.6 11 5.1c-1-5-4-10-11-11",
        },
      },
    ],
  },
  more: {
    children: [
      { tag: "circle", attrs: { cx: "5", cy: "12", r: "2" } },
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "2" } },
      { tag: "circle", attrs: { cx: "19", cy: "12", r: "2" } },
    ],
  },
  save: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M5 21V5q0-.825.588-1.412T7 3h10q.825 0 1.413.588T19 5v16l-7-3z",
        },
      },
    ],
  },
  upvoteOutline: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M12.781 2.375c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625zM15 12h-1v8h-4v-8H6.081L12 4.601L17.919 12z",
        },
      },
    ],
  },
  downvoteOutline: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M20.901 10.566A1 1 0 0 0 20 10h-4V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v7H4a1.001 1.001 0 0 0-.781 1.625l8 10c.381.475 1.181.475 1.562 0l8-10c.24-.301.286-.712.12-1.059M12 19.399L6.081 12H10V4h4v8h3.919z",
        },
      },
    ],
  },
  saveOutline: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M5 21V5q0-.825.588-1.412T7 3h10q.825 0 1.413.588T19 5v16l-7-3zm2-3.05l5-2.15l5 2.15V5H7zM7 5h10z",
        },
      },
    ],
  },
  collapse: {
    viewBox: "0 0 20 20",
    children: [
      { tag: "path", attrs: { d: "M0 0h20v20H0z", fill: "none" } },
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "m2.5 15.25l7.5-7.5l7.5 7.5l1.5-1.5l-9-9l-9 9z",
        },
      },
    ],
  },
  expand: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "none",
          stroke: "currentColor",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-width": "2",
          d: "M8 4H4m0 0v4m0-4l5 5m7-5h4m0 0v4m0-4l-5 5M8 20H4m0 0v-4m0 4l5-5m7 5h4m0 0v-4m0 4l-5-5",
        },
      },
    ],
  },
  hide: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M11.83 9L15 12.16V12a3 3 0 0 0-3-3zm-4.3.8l1.55 1.55c-.05.21-.08.42-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2M2 4.27l2.28 2.28l.45.45C3.08 8.3 1.78 10 1 12c1.73 4.39 6 7.5 11 7.5c1.55 0 3.03-.3 4.38-.84l.43.42L19.73 22L21 20.73L3.27 3M12 7a5 5 0 0 1 5 5c0 .64-.13 1.26-.36 1.82l2.93 2.93c1.5-1.25 2.7-2.89 3.43-4.75c-1.73-4.39-6-7.5-11-7.5c-1.4 0-2.74.25-4 .7l2.17 2.15C10.74 7.13 11.35 7 12 7",
        },
      },
    ],
  },
  share: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "none",
          stroke: "currentColor",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-width": "2",
          d: "M12 5v8.5M15 7l-3-3l-3 3m-4 5v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5",
        },
      },
    ],
  },
  clock: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8m.5-13H11v6l5.25 3.15l.75-1.23l-4.5-2.67z",
        },
      },
    ],
  },
  externalLink: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "M9.88 18.36a3 3 0 0 1-4.24 0a3 3 0 0 1 0-4.24l2.83-2.83l-1.41-1.41l-2.83 2.83a5.003 5.003 0 0 0 0 7.07c.98.97 2.25 1.46 3.54 1.46s2.56-.49 3.54-1.46l2.83-2.83l-1.41-1.41l-2.83 2.83Zm2.83-14.14L9.88 7.05l1.41 1.41l2.83-2.83a3 3 0 0 1 4.24 0a3 3 0 0 1 0 4.24l-2.83 2.83l1.41 1.41l2.83-2.83a5.003 5.003 0 0 0 0-7.07a5.003 5.003 0 0 0-7.07 0Z",
        },
      },
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          d: "m16.95 8.46l-.71-.7l-.7-.71l-4.25 4.24l-4.24 4.25l.71.7l.7.71l4.25-4.24z",
        },
      },
    ],
  },
  comment: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          fill: "none",
          stroke: "currentColor",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-width": "1.5",
          d: "M2 10.5C2 5.5 6 3 12 3s10 2.5 10 7.5S18 18 12 18v3S2 18 2 10.5m6-2h8m-8 4h4",
        },
      },
    ],
  },
  chatBubble: {
    children: [
      TRANSPARENT_24,
      {
        tag: "path",
        attrs: {
          stroke: "currentColor",
          "fill-rule": "evenodd",
          "clip-rule": "evenodd",
          d: "M4.592 15.304C2.344 9.787 6.403 3.75 12.36 3.75h.321a8.07 8.07 0 0 1 8.068 8.068a8.98 8.98 0 0 1-8.982 8.982h-7.82a.75.75 0 0 1-.47-1.335l1.971-1.583a.25.25 0 0 0 .075-.29zM12.36 5.25c-4.893 0-8.226 4.957-6.38 9.488l.932 2.289a1.75 1.75 0 0 1-.525 2.024l-.309.249h5.689a7.48 7.48 0 0 0 7.482-7.482a6.57 6.57 0 0 0-6.568-6.568z",
        },
      },
    ],
  },
  openComments: {
    viewBox: "0 0 16 16",
    children: [
      { tag: "path", attrs: { d: "M0 0h16v16H0z", fill: "none" } },
      {
        tag: "path",
        attrs: {
          fill: "currentColor",
          "fill-rule": "evenodd",
          d: "M15 2H1v10h2v2.434L6.651 12H15zM3 6.75a1 1 0 1 1 2 0a1 1 0 0 1-2 0m4 0a1 1 0 1 1 2 0a1 1 0 0 1-2 0m5-1a1 1 0 1 0 0 2a1 1 0 0 0 0-2",
          "clip-rule": "evenodd",
        },
      },
    ],
  },
};

export function createRedditIcon(icon: RedditIconName): SVGSVGElement {
  const spec = ICON_SPECS[icon];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "1em");
  svg.setAttribute("height", "1em");
  svg.setAttribute("viewBox", spec.viewBox ?? "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const childSpec of spec.children) {
    const child = document.createElementNS(SVG_NS, childSpec.tag);
    for (const [key, value] of Object.entries(childSpec.attrs)) {
      child.setAttribute(key, value);
    }
    svg.appendChild(child);
  }
  return svg;
}
