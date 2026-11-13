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
      // Clamp at 0: a frame timestamp can be slightly earlier than `start`
      const progress = Math.min(Math.max((now - start) / DURATION, 0), 1);
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
   2. Find Your Path + Students speak: desktop keeps the Figma grid; on tablet
      (and, for Students speak, mobile) they become swipeable sliders (a peek of
      the next card shows that the row scrolls). Each is created/destroyed as the
      viewport enters/leaves its range.
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
      // Mobile (Figma 426:7462): fixed 322.26px cards (width set in CSS), 24px apart
      slidesPerView: "auto",
      spaceBetween: 24,
      loop: hasEnoughSlides,
      grabCursor: true,
      watchOverflow: true,
      navigation: hasEnoughSlides
        ? {
            prevEl: ".campus-life-section__control--prev",
            nextEl: ".campus-life-section__control--next",
          }
        : false,
      breakpoints: {
        577: { slidesPerView: 1.1, spaceBetween: 16 },
        640: { slidesPerView: 2, spaceBetween: 24 },
        768: { slidesPerView: 2, spaceBetween: 18 },  // tablet (768–1199.98px)
        1200: { slidesPerView: 3, spaceBetween: 24 },
      },
    });
  }

  /* --- 2. Mobile / tablet sliders --- */
  const sliderBase = { grabCursor: true, watchOverflow: true };

  // Each slider has its own range. Find Your Path is a 2 × 2 grid on mobile
  // (Figma mobile design), so it is only a slider on tablet (577–1199.98px), with
  // the 18px tablet gap. Students speak slides on tablet and mobile.
  const mobileSliders = [
    {
      selector: ".institutions-section__slider",
      query: "(min-width: 577px) and (max-width: 1199.98px)",
      options: { ...sliderBase, slidesPerView: 2.2, spaceBetween: 18 },
    },
    {
      // Mobile (Figma 426:7543): fixed 313.313px cards (width set in CSS), 24px apart
      selector: ".testimonials-section__slider",
      query: "(max-width: 1199.98px)",
      options: {
        ...sliderBase,
        slidesPerView: "auto",
        spaceBetween: 24,
        breakpoints: { 577: { slidesPerView: 2.2, spaceBetween: 24 } },
      },
    },
  ];

  mobileSliders.forEach(({ selector, query, options }) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const mq = window.matchMedia(query);
    let instance = null;

    function sync() {
      if (mq.matches && !instance) {
        instance = new window.Swiper(el, options);
      } else if (!mq.matches && instance) {
        instance.destroy(true, true); // restores the grid
        instance = null;
      }
    }

    sync();
    mq.addEventListener("change", sync);
  });
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
   - Mobile (≤ 576px): the Figma mobile design shows a static 3 × 4 logo grid
     (CSS), so the marquee stands down there — no clones, no transform, no loop.
========================================== */
(function () {
  const marquees = document.querySelectorAll(".recruiters-section__marquee");
  if (!marquees.length) return;

  const SPEED = 45;          // auto-scroll speed, px per second
  const EASE = 6;            // how quickly speed eases toward its target (higher = snappier)
  const MAX_FLING = 1800;    // cap on release momentum, px per second
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const staticGrid = window.matchMedia("(max-width: 576px)");

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

      // Static grid on mobile: originals only, no transform
      if (staticGrid.matches) {
        setWidth = 0;
        x = 0;
        track.style.transform = "";
        return;
      }

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
      if (setWidth <= 0) return; // not laid out yet — a later resize rebuilds

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
      if (rafId !== null || staticGrid.matches) return;
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
      if (staticGrid.matches) return;
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

    // Crossing 576px: rebuild for the new layout and stop / resume the loop
    staticGrid.addEventListener("change", () => {
      stop();
      build();
      if (!staticGrid.matches) start();
    });
  });
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

/* ==========================================
   APPROVALS — mobile "View More" (Figma 484:2408)
   On mobile (≤ 576px) the two lists merge into one column (lists are
   display: contents) in Figma's order: the columns interleave — 2025-26,
   2023-24 (Working Professionals), 2023-24, 2022-23, 2021-22 … — so each item
   gets a CSS order of its row × 2 (+1 for the second list). Only the first 5 in
   that order show; View More reveals the rest and becomes View Less. Above
   576px the lists are separate flex columns, where the same orders keep each
   list's own sequence, and the --extra class is ignored. Without JS every
   item stays visible and the button stays hidden.
========================================== */
(() => {
  const VISIBLE = 5;
  const columns = document.getElementById("approvals-columns");
  const button = document.getElementById("approvals-load-more");
  if (!columns || !button) return;

  const lists = [...columns.querySelectorAll(".approvals-section__list")];
  const ordered = [];
  lists.forEach((list, listIndex) => {
    [...list.children].forEach((item, row) => {
      const order = row * lists.length + listIndex;
      item.style.order = String(order);
      ordered[order] = item;
    });
  });
  const items = ordered.filter(Boolean);
  if (items.length <= VISIBLE) return;

  items.slice(VISIBLE).forEach((item) => item.classList.add("approvals-section__item--extra"));

  button.hidden = false;

  // Toggles between "View More" (first 5) and "View Less" (every item)
  button.addEventListener("click", () => {
    const expand = !columns.classList.contains("is-expanded");
    columns.classList.toggle("is-expanded", expand);
    button.setAttribute("aria-expanded", String(expand));
    button.textContent = expand ? "View Less" : "View More";

    // On collapse the list shrinks above the button; keep the button in view
    if (!expand) {
      const top = button.getBoundingClientRect().top;
      const header = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      if (top < header) button.scrollIntoView({ block: "center" });
    }
  });
})();

/* ==========================================
   HEADER — mobile slide-in menu (≤ 576px, Figma node 447:9113)
   The hamburger opens a native <dialog> (focus trap, Esc, inert page); the panel
   slides in from the right via .is-visible and slides out before close(). Any
   link inside closes the menu. Above 576px the toggle is hidden, so an open menu
   is closed if the viewport grows past the breakpoint.
========================================== */
(() => {
  const toggle = document.querySelector(".site-header__menu-toggle");
  const menu = document.getElementById("mobile-menu");
  if (!toggle || !menu || typeof menu.showModal !== "function") return;

  const closeButton = menu.querySelector(".mobile-menu__close");
  const root = document.documentElement;
  const mobile = window.matchMedia("(max-width: 576px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function open() {
    if (menu.open) return;
    menu.showModal();
    root.classList.add("has-mobile-menu");
    toggle.setAttribute("aria-expanded", "true");
    // Next frame, so the transform transition runs from the off-screen state
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("is-visible")));
  }

  function close() {
    if (!menu.open) return;
    menu.classList.remove("is-visible");
    if (reducedMotion.matches) {
      menu.close();
      return;
    }
    menu.addEventListener("transitionend", () => menu.close(), { once: true });
  }

  // Every way the dialog closes ends here (close button, link, Esc, resize)
  menu.addEventListener("close", () => {
    menu.classList.remove("is-visible");
    root.classList.remove("has-mobile-menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus({ preventScroll: true });
  });

  // Esc: run the slide-out instead of the instant native close
  menu.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  toggle.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));

  mobile.addEventListener("change", (event) => {
    if (!event.matches && menu.open) menu.close();
  });
})();
