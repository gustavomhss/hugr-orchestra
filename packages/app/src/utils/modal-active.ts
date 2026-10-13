// Relay dialogs own a Kobalte root outside the shared dialog store.
export const modalActive = () => !!document.querySelector('dialog[open],[role="dialog"][data-relay-modal]')
