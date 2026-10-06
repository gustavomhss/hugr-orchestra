export * as AppDockLinuxDisplay from "./app-dock-linux-display"

// The Xpra HTML5 client sizes the workspace X display from its #screen element,
// so a thumbnail or hidden viewer would otherwise shrink every app's screen.
export const minimum = { width: 1024, height: 768 }

// Self-contained: it is also serialized into the viewer page by `script`.
export function fit(viewport: { width: number; height: number }, floor: { width: number; height: number }) {
  const width = Math.max(viewport.width, floor.width)
  const height = Math.max(viewport.height, floor.height)
  return {
    width,
    height,
    scale: Math.min(Math.max(1, viewport.width) / width, Math.max(1, viewport.height) / height),
  }
}

// Function body for the trusted /index.html page. It keeps #screen (and so the
// display the client requests) at least `minimum`, scales it down to the
// viewport from the top-left corner, and gives the client the inverse scale it
// already applies to pointer coordinates. Patching the prototype also covers
// the hello the client sends when it connects or reconnects: the stock hello
// reads the display caps from the size cached when the client was constructed.
export const script = `
  if (typeof XpraClient === "undefined" || typeof jQuery === "undefined") return false;
  const screen = document.getElementById("screen");
  if (!screen) return false;
  const fit = ${fit.toString()};
  const apply = (target) => {
    const size = fit({ width: innerWidth, height: innerHeight }, ${JSON.stringify(minimum)});
    screen.style.width = size.width + "px";
    screen.style.height = size.height + "px";
    screen.style.transformOrigin = "top left";
    screen.style.transform = size.scale === 1 ? "" : "scale(" + size.scale + ")";
    if (!target) return;
    target.scale = 1 / size.scale;
    // Windows mapped before the first scale change were made draggable without
    // the stock transform plugin; it reads the current matrix on each drag.
    for (const win of Object.values(target.id_to_window)) {
      win.scale = target.scale;
      if (jQuery(win.div).data("ui-draggable")) jQuery(win.div).draggable("option", "transform", true);
      if (jQuery(win.div).data("ui-resizable")) jQuery(win.div).resizable("option", "transform", true);
    }
  };
  if (!XpraClient.prototype.orchestraDisplayFloor) {
    const caps = XpraClient.prototype._get_display_caps;
    const resized = XpraClient.prototype._screen_resized;
    XpraClient.prototype._get_display_caps = function (...args) {
      apply(this);
      this.desktop_width = screen.clientWidth;
      this.desktop_height = screen.clientHeight;
      return caps.apply(this, args);
    };
    XpraClient.prototype._screen_resized = function (...args) { apply(this); return resized.apply(this, args); };
    XpraClient.prototype.orchestraDisplayFloor = true;
  }
  const target = typeof client === "undefined" ? undefined : client;
  apply(target);
  // A hello that raced this install announced the bare viewport; resend.
  if (target && target.connected) target._screen_resized();
  return true;
`
