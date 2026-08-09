// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRefreshOnFocus } from '../useRefreshOnFocus';

// P1-2 (Freeze Audit correctif) : verifie que le badge extension se
// rafraichit reellement au retour de focus/visibilite, sans polling ni
// double-declenchement, et que les listeners sont bien nettoyes au demontage
// (sinon plusieurs instances de la page empileraient des rappels).

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

afterEach(() => {
  setVisibility('visible');
});

describe('useRefreshOnFocus', () => {
  it('calls the callback when the window regains focus', () => {
    const callback = vi.fn();
    renderHook(() => useRefreshOnFocus(callback));

    window.dispatchEvent(new Event('focus'));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('calls the callback when the tab becomes visible again', () => {
    const callback = vi.fn();
    renderHook(() => useRefreshOnFocus(callback));

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not call the callback when the tab becomes hidden', () => {
    const callback = vi.fn();
    renderHook(() => useRefreshOnFocus(callback));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(callback).not.toHaveBeenCalled();
  });

  it('always calls the latest callback, without re-attaching listeners on every render', () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const { rerender } = renderHook(({ cb }) => useRefreshOnFocus(cb), {
      initialProps: { cb: firstCallback },
    });

    rerender({ cb: secondCallback });
    window.dispatchEvent(new Event('focus'));

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners on unmount (no refresh after unmount)', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useRefreshOnFocus(callback));

    unmount();
    window.dispatchEvent(new Event('focus'));

    expect(callback).not.toHaveBeenCalled();
  });
});
