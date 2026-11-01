type Box = { left: number; right: number; top: number; bottom: number }
type Target<E extends Event> = E & { currentTarget: HTMLDialogElement }

// Native modal dialogs: the backdrop is the <dialog> itself, so a click whose target is the dialog and whose point is
// outside its box landed on the backdrop.
export function outsideBox(box: Box, x: number, y: number) {
  return x < box.left || x > box.right || y < box.top || y > box.bottom
}

// The backdrop closes a dialog only when the press started there too. A text drag-select that starts in a field and is
// released over the backdrop still fires a `click` on the dialog (the common ancestor of both ends), and that must
// neither close the dialog nor lose what was typed. Spread the two handlers on the <dialog>.
export function backdropDismiss(dismiss: (dialog: HTMLDialogElement) => void) {
  let armed = false
  const onBackdrop = (event: Target<MouseEvent>) =>
    event.target === event.currentTarget &&
    outsideBox(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)
  return {
    onPointerDown(event: Target<PointerEvent>) {
      armed = onBackdrop(event)
    },
    onClick(event: Target<MouseEvent>) {
      const pressed = armed
      armed = false
      if (pressed && onBackdrop(event)) dismiss(event.currentTarget)
    },
  }
}
