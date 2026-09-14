import { useEffect, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";

/**
 * Who gets the keyboard.
 *
 * OpenTUI delivers every keypress to every subscriber, so without this a
 * dialog and the screen behind it both act on the same `esc` - one closes the
 * dialog while the other navigates away.
 *
 * This was first written as a provider holding a stack of layers that
 * components pushed on mount. It did not work: a setState issued from inside a
 * passive effect never re-renders in this reconciler, so the stack stayed on
 * its initial value while every component believed it had registered. The same
 * setState from an event handler or a promise is fine, which is why nothing
 * else in the app hit it.
 *
 * So there is no registry. Each subscriber is told whether it should be
 * listening, using state its own screen already has - the menu knows it is
 * open because it is only rendered when it is, and the screen knows a dialog
 * is up because it reads the same context that opened it. Less machinery, and
 * nothing to get out of step.
 */

/**
 * Subscribe to the keyboard while `enabled`.
 *
 * The handler and the flag are held in refs so a component can read fresh
 * state without resubscribing, and so the check happens at dispatch time
 * rather than being captured when the subscription was made.
 */
export function useGatedKeyboard(
  handler: (key: KeyEvent) => void,
  enabled = true,
) {
  const handlerRef = useRef(handler);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    handlerRef.current = handler;
    enabledRef.current = enabled;
  });

  useKeyboard((key) => {
    if (!enabledRef.current) return;
    handlerRef.current(key);
  });
}
