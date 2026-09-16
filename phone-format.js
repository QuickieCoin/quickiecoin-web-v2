/* Formats US phone numbers as they are typed: 2015550142 -> (201) 555-0142,
 * and 12015550142 -> +1 (201) 555-0142.
 *
 * The wire form's phone field is the only type="tel" input on the site. The
 * value is rewritten in the DOM, so the form's submit handler — which
 * serializes with new FormData(form) — sends the formatted number unchanged.
 *
 * Punctuation is only ever added in front of a digit, never after one: three
 * digits read "(201", not "(201) ", and a lone country code reads "+1", not
 * "+1 ". A trailing ") " would come straight back
 * every time the visitor backspaced over it, trapping them.
 *
 * Deliberately NOT inlined into index.html, for the same reason as
 * hash-scroll.js: that file is a Claude Design canvas export, and a re-export
 * would swallow anything added to its body. The whole cost there is one
 * <script defer> line.
 */
(function () {
  'use strict';

  var SELECTOR = 'input[type="tel"]';

  // The value just before the current edit, so an input event can tell whether
  // a backspace removed a digit or only a piece of punctuation.
  var before = new WeakMap();

  // d is the ten-digit national number, or as much of it as has been typed.
  function format(d, withCountry) {
    var s = '';
    if (d.length > 0) s = '(' + d.slice(0, 3);
    if (d.length > 3) s += ') ' + d.slice(3, 6);
    if (d.length > 6) s += '-' + d.slice(6);
    return withCountry ? '+1' + (s && ' ' + s) : s;
  }

  function digitsOf(s) { return s.replace(/\D/g, ''); }

  // Index just past the nth digit of s.
  function caretAfter(s, n) {
    if (n <= 0) return 0;
    for (var i = 0, seen = 0; i < s.length; i++) {
      if (/\d/.test(s[i]) && ++seen === n) return i + 1;
    }
    return s.length;
  }

  function apply(el, inputType) {
    var raw = el.value;
    var prev = before.get(el);
    before.delete(el);

    var deleting = !!inputType && inputType.indexOf('delete') === 0;

    // Anything dialled with a country code other than +1 is left exactly as
    // typed: forcing it into (xxx) xxx-xxxx would silently drop digits. A bare
    // "+" left behind by a deletion — backspacing "+1" — is not a number in
    // progress, so it clears.
    if (/^\s*\+/.test(raw) && !/^\s*\+\D*1/.test(raw) &&
        !(deleting && !/\d/.test(raw))) return;

    var focused = document.activeElement === el;
    var caret = focused && el.selectionStart != null ? el.selectionStart : raw.length;
    var digits = digitsOf(raw);
    // Digits to the left of the caret — the caret's position in terms that
    // survive reformatting.
    var n = digitsOf(raw.slice(0, caret)).length;

    // Backspace or Delete took out only punctuation. Take out the neighbouring
    // digit instead, or the punctuation reappears and the key does nothing.
    if (deleting && prev != null && digitsOf(prev) === digits) {
      if (/Backward$/.test(inputType) && n > 0) {
        digits = digits.slice(0, n - 1) + digits.slice(n);
        n--;
      } else if (/Forward$/.test(inputType) && n < digits.length) {
        digits = digits.slice(0, n) + digits.slice(n + 1);
      }
    }

    // A leading 1 is the country code — no US area code starts with 1. It stays
    // on screen as "+1" rather than being dropped: a key that makes nothing
    // appear reads as a broken field. The 1 still counts as a digit in n.
    var withCountry = digits[0] === '1';
    var national = (withCountry ? digits.slice(1) : digits).slice(0, 10);
    n = Math.min(n, national.length + (withCountry ? 1 : 0));

    var next = format(national, withCountry);
    if (next !== raw) el.value = next;
    // Only move the caret in a field the visitor is typing in; in Safari,
    // setting a selection on an unfocused input can pull focus to it.
    if (focused) {
      var pos = caretAfter(next, n);
      el.setSelectionRange(pos, pos);
    }
  }

  function isPhone(t) { return t && t.matches && t.matches(SELECTOR); }

  document.addEventListener('beforeinput', function (e) {
    if (isPhone(e.target)) before.set(e.target, e.target.value);
  }, true);

  document.addEventListener('input', function (e) {
    if (isPhone(e.target)) apply(e.target, e.inputType);
  }, true);

  // Browser autofill does not reliably fire input events, so catch it on the
  // way out of the field too.
  document.addEventListener('change', function (e) {
    if (isPhone(e.target)) apply(e.target);
  }, true);

  // Last pass before the form's own submit handler reads the value. Capture on
  // document runs ahead of React, which listens on its root container.
  document.addEventListener('submit', function (e) {
    var fields = e.target && e.target.querySelectorAll ? e.target.querySelectorAll(SELECTOR) : [];
    Array.prototype.forEach.call(fields, function (el) { apply(el); });
  }, true);
})();
