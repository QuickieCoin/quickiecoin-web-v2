/* Makes /#locations — and #how, #faqs, #contact — land on the section it names.
 *
 * The homepage is a single client-hydrated document. The browser resolves the
 * fragment while it is still parsing the HTML, at which point
 * <section id="locations"> does not exist: React creates it a beat later, on
 * DOMContentLoaded. By then the browser has already given up, so the visitor
 * sits at the top of the page and nothing ever retries.
 *
 * That is not just a nicety. _redirects sends /locations/ and /faqs/ — the v1
 * URLs Google still has indexed — to /#locations and /#faqs, so every visitor
 * arriving on a legacy path was being dropped at the top of the homepage.
 *
 * Deliberately NOT inlined into index.html: that file is a Claude Design canvas
 * export, and a re-export would swallow anything added to its body. The whole
 * cost there is one <script defer> line, which is trivial to restore.
 */
(function () {
  'use strict';

  // How long to keep looking for the section before giving up. Generous on
  // purpose — a slow phone can take a while to hydrate, and the failure mode of
  // being too short is exactly the bug this file exists to fix. Being too long
  // costs nothing, because any real scroll input from the visitor cancels the
  // whole thing (see `aborted` below) and rAF stops ticking in a hidden tab.
  var FIND_TIMEOUT = 3000;

  // One scroll is not enough. Between first paint and a settled layout the page
  // grows: web fonts swap in, the hero photo and the three how-it-works GIFs
  // decode, and the Sanity fetch fills in the machine list. Each of those moves
  // every section below it, so a single jump lands in the wrong place. We
  // re-aim at these points, and only if the section has actually moved.
  var RECHECK_AT = [400, 1200];

  // Breathing room below anything pinned over the top of the viewport.
  var GAP = 4;

  // Set by any input that means "I am driving now". Everything this file does
  // is a guess about intent; the moment the visitor disagrees, we stop.
  var aborted = false;
  // Supersedes an in-flight run when a newer hash arrives.
  var run = 0;

  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function () { aborted = true; },
      { passive: true, capture: true });
  });

  /* How many pixels at the top of the viewport a pinned header is covering,
   * measured AFTER scrolling rather than assumed beforehand.
   *
   * It has to be measured, because on this page the answer is currently zero
   * despite appearances: the nav is `position: sticky`, but it sits inside
   * .qc-app, whose `overflow-x: hidden` computes `overflow-y: auto` and so
   * makes .qc-app the nav's scrollport instead of the viewport. The nav
   * therefore scrolls away with the page and pins to nothing — verified at
   * scrollY 1484, where its rect reads top: -1483. Subtracting an assumed 75px
   * header would leave a 79px band of the previous section on screen under a
   * nav that is not there. Reading the real rect is right either way, and stays
   * right if the nav is ever made to stick properly.
   */
  function navCover() {
    var nav = document.querySelector('nav');
    if (!nav) return 0;
    var bottom = nav.getBoundingClientRect().bottom;
    return bottom > 0 ? bottom + GAP : 0;
  }

  function hashId() {
    var raw = location.hash.slice(1);
    if (!raw) return '';
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function go() {
    var token = ++run;
    var id = hashId();
    if (!id) return;

    // A fresh hash is a fresh intent, so it clears an earlier cancellation —
    // including the pointerdown from the click that produced this hashchange.
    aborted = false;

    var deadline = Date.now() + FIND_TIMEOUT;
    // Where the section last sat in the document, so a re-aim can tell real
    // reflow from "nothing moved".
    var placed = null;

    function place() {
      if (token !== run || aborted) return;
      var el = document.getElementById(id);
      if (!el) return;
      var top = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset);
      if (placed !== null && Math.abs(top - placed) < 2) return;
      placed = top;
      // Two passes in one frame, so the browser paints only the result: land
      // the section flush with the top of the viewport, then look at what is
      // actually covering that top and back off by exactly that much.
      window.scrollTo({ top: top, behavior: 'auto' });
      var cover = navCover();
      if (cover > 0) window.scrollTo({ top: Math.max(0, top - cover), behavior: 'auto' });
    }

    (function find() {
      if (token !== run || aborted) return;
      if (document.getElementById(id)) {
        place();
        RECHECK_AT.forEach(function (ms) { setTimeout(place, ms); });
        // The two signals worth waiting for exactly rather than guessing at.
        if (document.readyState !== 'complete') {
          window.addEventListener('load', place, { once: true });
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
        return;
      }
      // Nothing to find for /#wires: that hash selects a page rather than a
      // section, and componentDidMount already handles it. The poll times out.
      if (Date.now() < deadline) requestAnimationFrame(find);
    })();
  }

  // Instant, not smooth: this is standing in for the fragment navigation the
  // browser failed to do, and that is what a fragment navigation looks like.
  if (location.hash) go();
  window.addEventListener('hashchange', go);
})();
