import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentRoute, onRouteChange } from './route';

afterEach(() => {
  window.location.hash = '';
});

describe('route', () => {
  it('liefert den Hash als Route', () => {
    window.location.hash = '#CalendarView/';
    expect(currentRoute()).toBe('#CalendarView/');
  });

  it('meldet jeden Routenwechsel genau einmal', () => {
    const listener = vi.fn();
    const stop = onRouteChange(listener);

    window.location.hash = '#HomeView/';
    // Bei Hash-Navigation feuern im Browser beide Events.
    window.dispatchEvent(new Event('hashchange'));
    window.dispatchEvent(new Event('popstate'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('#HomeView/');
    stop();
  });

  it('meldet nach dem Abmelden nichts mehr', () => {
    const listener = vi.fn();
    const stop = onRouteChange(listener);
    stop();

    window.location.hash = '#HomeView/';
    window.dispatchEvent(new Event('hashchange'));

    expect(listener).not.toHaveBeenCalled();
  });
});
