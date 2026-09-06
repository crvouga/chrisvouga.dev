'use strict';

/**
 * Shared accessibility lint restrictions (no-restricted-syntax entries).
 *
 * Why this exists:
 *   `aria-hidden` (and its React Native cousins) is the easiest way to
 *   accidentally hide a focused interactive element from assistive tech.
 *   When a button retains focus and a parent flips `aria-hidden` to true
 *   (e.g. on stack screen push), browsers emit:
 *     "Blocked aria-hidden on an element because its descendant retained focus."
 *   The fix is `inert` (which also blocks focus). To make the bad pattern
 *   unrepresentable in our own code, we ban the props that cause it — the
 *   only legitimate use is patched directly in third-party deps.
 *
 * What this bans (in our source):
 *   - JSX `aria-hidden` attribute
 *   - React Native `accessibilityElementsHidden` (iOS equivalent)
 *   - React Native `importantForAccessibility` (Android equivalent)
 *
 * If you genuinely need to hide a subtree from assistive tech AND keyboard
 * focus, use the `inert` attribute instead (works on web, no-op on native).
 *
 * Usage in an eslint flat config:
 *
 *   const a11y = require('../eslint-rules/a11y-restrictions.cjs');
 *   ...
 *   rules: {
 *     'no-restricted-syntax': [
 *       'error',
 *       ...a11y.restrictedSyntax(),
 *       // ...other no-restricted-syntax entries
 *     ],
 *   }
 */
const RESTRICTED_JSX_ATTRIBUTES = Object.freeze([
  Object.freeze({
    selector: 'JSXAttribute[name.name="aria-hidden"]',
    message:
      'Do not use `aria-hidden` directly: a focused descendant triggers a runtime accessibility warning. Use the `inert` attribute, which hides from assistive tech AND prevents focus.',
  }),
  Object.freeze({
    selector: 'JSXAttribute[name.name="accessibilityElementsHidden"]',
    message:
      'Do not use `accessibilityElementsHidden`: prefer the `inert` attribute (web) or restructure the layout so unfocused regions are unmounted/visibility-hidden.',
  }),
  Object.freeze({
    selector: 'JSXAttribute[name.name="importantForAccessibility"]',
    message:
      'Do not use `importantForAccessibility`: prefer the `inert` attribute (web) or restructure the layout so unfocused regions are unmounted/visibility-hidden.',
  }),
]);

function restrictedSyntax() {
  return RESTRICTED_JSX_ATTRIBUTES.map((entry) => ({ ...entry }));
}

module.exports = { restrictedSyntax, RESTRICTED_JSX_ATTRIBUTES };
