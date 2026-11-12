/* ==========================================
   About section — stat counters
   Counts each .about-section__stat-value up from 0 to the number in its HTML
   (e.g. "2000+") once the stats scroll into view. Runs once per page load.
========================================== */
(function () {
  const counters = document.querySelectorAll(".about-section__stat-value");
  if (!counters.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) return; // keep final values

  const DURATION = 2000; // ms
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // Read the target number + any prefix/suffix ("2000+" -> "", 2000, "+")
  const items = Array.from(counters, (el) => {
    const match = el.textContent.trim().match(/^(\D*)(\d+)(\D*)$/);
    if (!match) return null;
    const [, prefix, digits, suffix] = match;
    el.setAttribute("aria-label", el.textContent.trim()); // screen readers get the final value
    el.textContent = prefix + "0" + suffix;
    return { el, prefix, suffix, target: parseInt(digits, 10) };
  }).filter(Boolean);

  function animate(item) {
    const start = performance.now();
    function frame(now) {
      const progress = Math.min((now - start) / DURATION, 1);
      const value = Math.round(easeOutCubic(progress) * item.target);
      item.el.textContent = item.prefix + value + item.suffix;
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const section = counters[0].closest(".about-section__stats") || counters[0];
  const observer = new IntersectionObserver(
    (entries, obs) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      items.forEach(animate);
      obs.disconnect();
    },
    { threshold: 0.4 }
  );
  observer.observe(section);
})();

/* ==========================================
   News section — tabs
   Switches between the static panels already in the HTML
   (#news-panel-news / -events / -announcements).
   Follows the WAI-ARIA tabs pattern: click to select; Left/Right arrows,
   Home and End move between tabs.
========================================== */
(function () {
  const tablist = document.querySelector(".news-section__tabs");
  if (!tablist) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const ACTIVE = "news-section__tab--active";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Mobile: the tab row scrolls horizontally (CSS). Centre the given tab inside
     the row so its neighbours peek in on both sides. Scrolls only the row —
     never the page (scrollIntoView would also move the page vertically).
     The browser clamps scrollLeft, so the first/last tabs settle at the edges.
     No-op when the row doesn't overflow (tablet/desktop). */
  function centreTab(tab, smooth) {
    if (tablist.scrollWidth <= tablist.clientWidth) return;
    const listRect = tablist.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const delta = tabRect.left + tabRect.width / 2 - (listRect.left + listRect.width / 2);
    if (Math.abs(delta) < 1) return;
    tablist.scrollBy({
      left: delta,
      behavior: smooth && !reduceMotion.matches ? "smooth" : "auto",
    });
  }

  function selectTab(tab, moveFocus) {
    tabs.forEach((t) => {
      const selected = t === tab;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      t.classList.toggle(ACTIVE, selected);
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
      if (panel) panel.hidden = !selected;
    });
    // preventScroll: stop focus() from jumping the page/row; centreTab handles the row
    if (moveFocus) tab.focus({ preventScroll: true });
    centreTab(tab, true);
  }

  // Keep the active tab in view on load and when the viewport changes
  // (e.g. rotating a phone or crossing into the scrollable mobile layout).
  function centreActive() {
    const active = tablist.querySelector("." + ACTIVE) || tabs[0];
    if (active) centreTab(active, false);
  }
  centreActive();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(centreActive); // tab widths change once web fonts load

  // Width-only: mobile browsers fire resize when the address bar shows/hides
  // during vertical scrolling — that must not snap the row while it's being swiped.
  let lastWidth = window.innerWidth;
  let resizeFrame;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(centreActive);
  });

  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) selectTab(tab, false);
  });

  tablist.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;

    let next;
    switch (event.key) {
      case "ArrowRight": next = tabs[(index + 1) % tabs.length]; break;
      case "ArrowLeft":  next = tabs[(index - 1 + tabs.length) % tabs.length]; break;
      case "Home":       next = tabs[0]; break;
      case "End":        next = tabs[tabs.length - 1]; break;
      default: return;
    }
    event.preventDefault();
    selectTab(next, true);
  });
})();

/* ==========================================
   Sliders (Swiper — loaded from CDN in index.html)
   1. Life at GIT: slider at every width, driven by the design's prev/next
      arrows. Arrows are hidden when there are 3 slides or fewer, and Swiper
      also hides them whenever every slide already fits (watchOverflow).
   2. Find Your Path + Students speak: desktop keeps the Figma grid; at
      ≤1199.98px (tablet + mobile) they become swipeable sliders (a peek of the next card shows
      that the row scrolls). Created/destroyed as the viewport crosses 1200px.
========================================== */
(function () {
  if (typeof window.Swiper === "undefined") return; // CDN unavailable: CSS grids remain

  /* --- 1. Life at GIT --- */
  const lifeSlider = document.querySelector(".campus-life-section__slider");
  if (lifeSlider) {
    const slideCount = lifeSlider.querySelectorAll(".swiper-slide").length;
    const controls = document.querySelector(".campus-life-section__controls");
    const hasEnoughSlides = slideCount > 3;

    if (controls) controls.hidden = !hasEnoughSlides;

    new window.Swiper(lifeSlider, {
      slidesPerView: 1.1,
      spaceBetween: 16,
      loop: hasEnoughSlides,
      grabCursor: true,
      watchOverflow: true,
      navigation: hasEnoughSlides
        ? {
            prevEl: ".campus-life-section__control--prev",
            nextEl: ".campus-life-section__control--next",
          }
        : false,
      // Line-style dots; shown only on mobile via CSS (arrows are hidden there)
      pagination: {
        el: lifeSlider.querySelector(".campus-life-section__pagination"),
        clickable: true,
      },
      breakpoints: {
        640: { slidesPerView: 2, spaceBetween: 24 },
        768: { slidesPerView: 2, spaceBetween: 18 },  // tablet (768–1199.98px)
        1200: { slidesPerView: 3, spaceBetween: 24 },
      },
    });
  }

  /* --- 2. Mobile / tablet sliders --- */
  const mobileQuery = window.matchMedia("(max-width: 1199.98px)");
  const mobileOptions = {
    slidesPerView: 1.15,
    spaceBetween: 16,
    grabCursor: true,
    watchOverflow: true,
    breakpoints: {
      576: { slidesPerView: 2.2, spaceBetween: 24 },
    },
  };

  // Per-slider overrides. Institutions uses an 18px gap on tablet (≥576px),
  // the tablet gap used across 768–1199.98px.
  const mobileSliders = [
    {
      selector: ".institutions-section__slider",
      options: { ...mobileOptions, breakpoints: { 576: { slidesPerView: 2.2, spaceBetween: 18 } } },
    },
    { selector: ".testimonials-section__slider", options: mobileOptions },
  ]
    .map(({ selector, options }) => ({ el: document.querySelector(selector), options }))
    .filter(({ el }) => el);
  let mobileInstances = [];

  function syncMobileSliders() {
    if (mobileQuery.matches && !mobileInstances.length) {
      mobileInstances = mobileSliders.map(({ el, options }) => new window.Swiper(el, options));
    } else if (!mobileQuery.matches && mobileInstances.length) {
      mobileInstances.forEach((swiper) => swiper.destroy(true, true)); // restores the grid
      mobileInstances = [];
    }
  }

  syncMobileSliders();
  mobileQuery.addEventListener("change", syncMobileSliders);
})();

/* ==========================================
   Recruiters — infinite logo marquee
   Row 1 (data-marquee-direction="right") moves left → right,
   row 2 ("left") moves right → left, forever.
   - Seamless loop: the logo set is cloned until the track is at least one set
     wider than the viewport; the position wraps by exactly one set width
     (measured with sub-pixel precision), so the seam is invisible.
   - Smooth: one requestAnimationFrame loop, time-based (frame-rate independent),
     moving only `transform: translate3d` — no layout work per frame.
   - Hover: eases to a stop. Drag / swipe: moves the row 1:1 with the pointer;
     on release it carries the swipe momentum and eases back to auto speed.
   - Pauses while off-screen; no jump after switching browser tabs.
========================================== */
(function () {
  const marquees = document.querySelectorAll(".recruiters-section__marquee");
  if (!marquees.length) return;

  const SPEED = 45;          // auto-scroll speed, px per second
  const EASE = 6;            // how quickly speed eases toward its target (higher = snappier)
  const MAX_FLING = 1800;    // cap on release momentum, px per second
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  marquees.forEach((root) => {
    const track = root.querySelector(".recruiters-section__row");
    if (!track) return;

    const direction = root.dataset.marqueeDirection === "right" ? 1 : -1;
    const originals = Array.from(track.children);

    let setWidth = 0;        // width of one full logo set incl. trailing gap
    let x = 0;               // current translateX, kept in (-setWidth, 0]
    let velocity = 0;        // current px/s (eases toward target)
    let hovered = false;
    let dragging = false;
    let pointerId = null;
    let lastPointerX = 0;
    let lastPointerTime = 0;
    let dragVelocity = 0;
    let rafId = null;
    let lastTime = null;
    let inView = true;

    root.classList.add("is-ready");

    /* --- Build clones and measure one set --- */
    function build() {
      track.querySelectorAll("[data-marquee-clone]").forEach((node) => node.remove());

      const addSet = () =>
        originals.forEach((item) => {
          const clone = item.cloneNode(true);
          clone.setAttribute("data-marquee-clone", "");
          clone.setAttribute("aria-hidden", "true");
          track.appendChild(clone);
        });

      addSet();
      const firstClone = track.querySelector("[data-marquee-clone]");
      setWidth = firstClone.getBoundingClientRect().left - originals[0].getBoundingClientRect().left;

      // Need: track width ≥ one set + visible width, so the viewport is always covered.
      const setsNeeded = Math.ceil(root.clientWidth / setWidth) + 1;
      for (let i = 2; i < setsNeeded; i += 1) addSet();

      x = wrap(x);
      render();
    }

    function wrap(value) {
      if (!setWidth) return 0;
      let v = value % setWidth;
      if (v > 0) v -= setWidth;
      return v;
    }

    function render() {
      track.style.transform = `translate3d(${x}px, 0, 0)`;
    }

    /* --- Animation loop --- */
    function tick(now) {
      if (lastTime === null) lastTime = now;
      const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp: no jump after a stall
      lastTime = now;

      if (!dragging) {
        const target = hovered || reduceMotion.matches ? 0 : SPEED * direction;
        velocity += (target - velocity) * Math.min(1, dt * EASE);
        if (Math.abs(velocity) > 0.01) {
          x = wrap(x + velocity * dt);
          render();
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (rafId !== null) return;
      lastTime = null;
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    /* --- Hover (mouse / pen) --- */
    root.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "touch") hovered = true;
    });
    root.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch" && !dragging) hovered = false;
    });

    /* --- Drag / swipe --- */
    root.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      pointerId = e.pointerId;
      lastPointerX = e.clientX;
      lastPointerTime = performance.now();
      dragVelocity = 0;
      velocity = 0;
      try {
        root.setPointerCapture(pointerId); // keep receiving moves outside the row
      } catch (err) {
        /* pointer already released — drag still works while over the row */
      }
      root.classList.add("is-dragging");
    });

    root.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const now = performance.now();
      const dx = e.clientX - lastPointerX;
      const dtMove = Math.max(now - lastPointerTime, 1) / 1000;
      dragVelocity = dragVelocity * 0.6 + (dx / dtMove) * 0.4; // smoothed px/s
      lastPointerX = e.clientX;
      lastPointerTime = now;
      x = wrap(x + dx);
      render();
    });

    function endDrag(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      if (root.hasPointerCapture && root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
      pointerId = null;
      root.classList.remove("is-dragging");

      // Ignore stale velocity if the pointer paused before release
      const sinceMove = performance.now() - lastPointerTime;
      const fling = sinceMove > 80 ? 0 : dragVelocity;
      velocity = Math.max(-MAX_FLING, Math.min(MAX_FLING, fling));

      // Resume auto-scroll unless the mouse is still hovering the row
      hovered = e.pointerType !== "touch" && root.matches(":hover");
    }

    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);
    root.addEventListener("lostpointercapture", (e) => endDrag(e));

    /* --- Lifecycle --- */
    build();

    if ("ResizeObserver" in window) {
      let lastWidth = root.clientWidth;
      new ResizeObserver(() => {
        if (root.clientWidth === lastWidth) return;
        lastWidth = root.clientWidth;
        build(); // gap / visible width changed at a breakpoint
      }).observe(root);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        if (inView) start();
        else stop();
      }).observe(root);
    } else {
      start();
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (inView) start();
    });
  });
})();

/* ==========================================
   Footer — accordion columns (mobile only, ≤ 576px)
   Above 576px the headings are plain text (toggle buttons disabled) and every
   column is visible. At ≤ 576px each heading becomes a toggle; all columns start
   collapsed and only one can be open at a time (opening one closes the others).
   Without JS, all columns stay open.
========================================== */
(function () {
  const columnsWrap = document.querySelector(".site-footer__columns");
  if (!columnsWrap) return;

  const mobileQuery = window.matchMedia("(max-width: 576px)");
  const columns = Array.from(columnsWrap.querySelectorAll(".site-footer__column"));

  function setOpen(column, open) {
    const toggle = column.querySelector(".site-footer__toggle");
    column.classList.toggle("is-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
  }

  function enable() {
    columnsWrap.classList.add("is-accordion");
    columns.forEach((column) => {
      const toggle = column.querySelector(".site-footer__toggle");
      if (toggle) toggle.disabled = false;
      setOpen(column, false);
    });
  }

  function disable() {
    columnsWrap.classList.remove("is-accordion");
    columns.forEach((column) => {
      const toggle = column.querySelector(".site-footer__toggle");
      column.classList.remove("is-open");
      if (toggle) {
        toggle.disabled = true;
        toggle.removeAttribute("aria-expanded");
      }
    });
  }

  columnsWrap.addEventListener("click", (event) => {
    const toggle = event.target.closest(".site-footer__toggle");
    if (!toggle || toggle.disabled) return;
    const column = toggle.closest(".site-footer__column");
    const willOpen = !column.classList.contains("is-open");

    // Only one item open at a time: close the others before opening this one
    if (willOpen) {
      columns.forEach((other) => {
        if (other !== column) setOpen(other, false);
      });
    }
    setOpen(column, willOpen);
  });

  function sync() {
    if (mobileQuery.matches) enable();
    else disable();
  }

  sync();
  mobileQuery.addEventListener("change", sync);
})();

/* ==========================================
   Students speak — video modal
   Each .testimonials-section__play button carries data-video-src (dummy clip
   for now) and data-video-title. Clicking opens the shared <dialog>, loads the
   clip and plays it. Custom controls: play/pause, mute, close.
   Closes on the close button, Esc (native dialog) or a click on the backdrop;
   closing stops the video and unloads it, and focus returns to the play button.
========================================== */
(function () {
  const modal = document.querySelector(".video-modal");
  const triggers = document.querySelectorAll(".testimonials-section__play[data-video-src]");
  if (!modal || !triggers.length || typeof modal.showModal !== "function") return;

  const video = modal.querySelector(".video-modal__video");
  const playButton = modal.querySelector(".video-modal__button--play");
  const muteButton = modal.querySelector(".video-modal__button--mute");
  const closeButton = modal.querySelector(".video-modal__close");
  let lastTrigger = null;

  // Reflect the video's real state in the buttons (icons switch via CSS)
  function syncPlayState() {
    const paused = video.paused || video.ended;
    modal.toggleAttribute("data-paused", paused);
    playButton.setAttribute("aria-label", paused ? "Play video" : "Pause video");
  }

  function syncMuteState() {
    const muted = video.muted || video.volume === 0;
    modal.toggleAttribute("data-muted", muted);
    muteButton.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
  }

  /* Stop the page scrolling behind the modal without a layout shift: measure the
     scrollbar before it is hidden and reserve the same width as padding. */
  const root = document.documentElement;

  function lockPageScroll() {
    const scrollbarWidth = window.innerWidth - root.clientWidth; // 0 for overlay scrollbars
    root.style.setProperty("--scrollbar-compensation", scrollbarWidth + "px");
    root.classList.add("has-video-modal");
  }

  function unlockPageScroll() {
    root.classList.remove("has-video-modal");
    root.style.removeProperty("--scrollbar-compensation");
  }

  function togglePlay() {
    if (video.paused || video.ended) {
      video.play().catch(syncPlayState);
    } else {
      video.pause();
    }
  }

  function open(trigger) {
    lastTrigger = trigger;
    const title = trigger.dataset.videoTitle;
    modal.setAttribute("aria-label", title ? title + " — student video" : "Student video");

    const poster = trigger.closest(".testimonials-section__media")?.querySelector("img");
    if (poster) video.poster = poster.currentSrc || poster.src;
    video.src = trigger.dataset.videoSrc;
    video.muted = false;

    lockPageScroll();
    modal.showModal();
    playButton.focus();
    syncMuteState();

    // Autoplay with sound can be blocked; if so, retry muted, else stay paused
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(syncPlayState);
    });
    syncPlayState();
  }

  function close() {
    if (modal.open) modal.close(); // the "close" event below does the cleanup
  }

  // Runs for every way the dialog closes (button, backdrop, Esc)
  modal.addEventListener("close", () => {
    video.pause();
    video.removeAttribute("src");
    video.load(); // stop downloading
    unlockPageScroll();
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  });

  triggers.forEach((trigger) => trigger.addEventListener("click", () => open(trigger)));
  playButton.addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);
  muteButton.addEventListener("click", () => {
    video.muted = !video.muted;
  });
  closeButton.addEventListener("click", close);

  // Backdrop click: the dialog element itself is the target only outside the panel
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  ["play", "pause", "ended"].forEach((type) => video.addEventListener(type, syncPlayState));
  video.addEventListener("volumechange", syncMuteState);
})();
