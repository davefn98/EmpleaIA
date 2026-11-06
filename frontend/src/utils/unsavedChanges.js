export const BEFORE_NAVIGATE_EVENT = 'empleaia:before-navigate';

export function canNavigate(target, path) {
  return target.dispatchEvent(new CustomEvent(BEFORE_NAVIGATE_EVENT, {
    cancelable: true, detail: { path },
  }));
}

export function protectUnsavedChanges(target, confirmDiscard) {
  const beforeNavigate = (event) => {
    if (!confirmDiscard(event.detail.path)) event.preventDefault();
  };
  const beforeUnload = (event) => {
    event.preventDefault();
    event.returnValue = '';
  };
  target.addEventListener(BEFORE_NAVIGATE_EVENT, beforeNavigate);
  target.addEventListener('beforeunload', beforeUnload);
  return () => {
    target.removeEventListener(BEFORE_NAVIGATE_EVENT, beforeNavigate);
    target.removeEventListener('beforeunload', beforeUnload);
  };
}
