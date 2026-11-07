/* The contact and wire forms' submission stages, as an explicit state machine.
 *
 *   idle       - the form is showing and nothing has been sent.
 *   submitting - one POST to Netlify is in flight.
 *   sent       - Netlify answered 2xx; the "thanks" panel replaces the form.
 *   failed     - the POST failed or answered non-2xx; the form shows its error.
 *
 * Legal transitions (anything else is refused: transition() returns null and
 * the caller changes nothing):
 *   idle       --submit-->    submitting
 *   failed     --submit-->    submitting   (try again; the error clears)
 *   submitting --succeeded--> sent
 *   submitting --failed-->    failed
 *   sent       --reset-->     idle         ("send another")
 *
 * So a second click on Send while the first POST is in flight sends nothing,
 * and no answer can arrive for a POST the form no longer expects.
 *
 * Loaded synchronously before support.js (index.html renders the forms from
 * it at boot), and as a CommonJS module by tests/form-state.test.js (node --test tests/*.test.js). Kept out
 * of index.html for the same reason as hash-scroll.js and phone-format.js: a
 * Claude Design re-export would swallow anything added to its body.
 */
(function (root) {
  'use strict';

  var STATES = { IDLE: 'idle', SUBMITTING: 'submitting', SENT: 'sent', FAILED: 'failed' };
  var EVENTS = { SUBMIT: 'submit', SUCCEEDED: 'succeeded', FAILED: 'failed', RESET: 'reset' };

  var LEGAL = {
    idle: { submit: 'submitting' },
    failed: { submit: 'submitting' },
    submitting: { succeeded: 'sent', failed: 'failed' },
    sent: { reset: 'idle' }
  };

  // The one transition function: the next state, or null if `event` is not
  // legal from `state`.
  function transition(state, event) {
    var row = Object.prototype.hasOwnProperty.call(LEGAL, state) ? LEGAL[state] : null;
    return row && Object.prototype.hasOwnProperty.call(row, event) ? row[event] : null;
  }

  // What the page template reads, derived from the one state.
  function view(state) {
    return {
      sent: state === 'sent',
      notSent: state !== 'sent',
      error: state === 'failed',
      submitting: state === 'submitting'
    };
  }

  var api = { STATES: STATES, EVENTS: EVENTS, transition: transition, view: view };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QCFormState = api;
})(this);
