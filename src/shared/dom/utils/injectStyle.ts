export function injectStyle(id: string, cssText: string) {
  let style = document.getElementById(id);

  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.documentElement.appendChild(style);
  }

  style.textContent = cssText;
}
