/* ==========================================
   Intro gates (home.html hero entrance)
   Work that should wait for the hero entrance hooks in here: revealStart opens
   when the entrance begins (or at once when it is skipped / on pages without a
   hero), revealEnd when the entrance has finished.
========================================== */
const introGate = (() => {
  const gate = () => {
    let isOpen = false;
    const queue = [];
    return {
      then(fn) {
        if (isOpen) fn();
        else queue.push(fn);
      },
      open() {
        if (isOpen) return;
        isOpen = true;
        queue.splice(0).forEach((fn) => fn());
      },
    };
  };
  return { revealStart: gate(), revealEnd: gate() };
})();

/* ==========================================
   Hero — fill the first screen
   Sets --hero-offset to the real height of the utility bar + header so the
   hero is (viewport height − header). CSS has a per-breakpoint fallback; this
   corrects it when the utility bar wraps or the header changes size.
========================================== */
(function () {
  const parts = [document.getElementById("utility-bar"), document.getElementById("site-header")].filter(Boolean);
  if (!parts.length || !("ResizeObserver" in window)) return;

  const root = document.documentElement;
  const update = () => {
    const offset = parts.reduce((sum, el) => sum + el.offsetHeight, 0);
    root.style.setProperty("--hero-offset", offset + "px");
  };

  update();
  const observer = new ResizeObserver(update);
  parts.forEach((el) => observer.observe(el));
})();

/* ==========================================
   Hero — background video
   Smooth hand-over from the photo to the video after the hero appears:
   - Buffering starts after the page has loaded (so the first view is never
     delayed) and runs while the intro is on screen. The video is not played
     (no decoding work) yet.
   - It starts only once the hero entrance animation has finished AND it can
     play through without stalling, then cross-fades over the photo (0.8 s).
     During the entrance (zoom-out, blurred title words, chips, buttons) the
     banner shows the still photo, so video decoding never competes with those
     animations — starting it then made the banner shiver on desktop.
   Skipped with reduced motion or data saver; if the file is missing or can't
   play, the photo simply stays. The pause/play button appears once it plays
   (WCAG 2.2.2).
========================================== */
(function () {
  const video = document.querySelector("[data-hero-video]");
  if (!video) return;
  const toggle = document.querySelector("[data-hero-video-toggle]");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduceMotion || saveData) return;

  const isMobile = window.matchMedia("(max-width: 576px)").matches;
  const src = (isMobile && video.dataset.srcMobile) || video.dataset.src;
  if (!src) return;

  const canPlayThrough = () => video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;
  let entranceStarted = false;
  let entranceEnded = false;
  let started = false;

  const setPaused = (paused) => {
    if (!toggle) return;
    toggle.classList.toggle("is-paused", paused);
    toggle.setAttribute("aria-label", paused ? "Play background video" : "Pause background video");
  };

  video.addEventListener("playing", () => {
    video.classList.add("is-playing");
    if (toggle) toggle.hidden = false;
    setPaused(false);
  });
  video.addEventListener("pause", () => setPaused(true));

  if (toggle) {
    toggle.addEventListener("click", () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });
  }

  const startVideo = () => {
    if (started) return;
    started = true;
    video.play().catch(() => {}); // autoplay blocked → photo stays
  };

  // Called whenever something changes; starts the video once the moment is right
  const update = () => {
    if (started || !entranceStarted || !entranceEnded || !canPlayThrough()) return;
    startVideo();
  };

  video.addEventListener("canplaythrough", update);

  introGate.revealStart.then(() => {
    entranceStarted = true;
    update();
  });

  introGate.revealEnd.then(() => {
    entranceEnded = true;
    update();
  });

  // Buffer during the intro, after everything else on the page has loaded
  const preload = () => {
    video.preload = "auto";
    video.src = src;
    video.load();
  };
  if (document.readyState === "complete") preload();
  else window.addEventListener("load", preload, { once: true });
})();

/* ==========================================
   Hero entrance (home.html, Figma 698:2955 motion timeline)
   home.html starts with html.hero-entrance-pending, which holds the utility bar,
   header and hero content in their first-keyframe state. Once the fonts and the
   hero photo are ready (max 1.5 s wait), the entrance plays: bars slide down, the
   photo fades in and settles from 120 %, the title arrives word by word, then the
   description lines, chips and buttons. introGate.revealStart / revealEnd mark
   its start and end (the hero video waits for revealEnd).
   Loading with a #hash (e.g. home.html#admissions) or with reduced motion skips
   the entrance: everything is shown at once.
========================================== */
(function () {
  const root = document.documentElement;
  const hero = document.getElementById("hero");

  const openGates = () => {
    root.classList.remove("hero-entrance-pending");
    introGate.revealStart.open();
    introGate.revealEnd.open();
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!hero || !root.classList.contains("hero-entrance-pending") || reduceMotion || window.location.hash) {
    openGates();
    return;
  }

  const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

  // Wraps each word in span.hero-word (whitespace and <br> stay between them;
  // inline elements such as the mobile-only "." stay attached to their word)
  function splitWords(el) {
    const words = [];
    const nodes = Array.from(el.childNodes);
    let current = null;
    el.textContent = "";
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            el.appendChild(document.createTextNode(part));
            current = null;
            return;
          }
          current = document.createElement("span");
          current.className = "hero-word";
          current.textContent = part;
          el.appendChild(current);
          words.push(current);
        });
      } else if (node.nodeName === "BR") {
        el.appendChild(node);
        current = null;
      } else if (current) {
        current.appendChild(node);
      } else {
        el.appendChild(node);
      }
    });
    return words;
  }

  // Line index of each word (words on the same visual line share an offsetTop)
  function lineIndexes(words) {
    const tops = [];
    return words.map((word) => {
      const top = word.offsetTop;
      let index = tops.findIndex((t) => Math.abs(t - top) < 4);
      if (index === -1) {
        tops.push(top);
        index = tops.length - 1;
      }
      return index;
    });
  }

  // fill: "backwards" holds the first keyframe during the delay; once finished the
  // element is back on its own CSS (no leftover inline styles)
  const play = (el, keyframes, delay, duration, easing = EASE_OUT) =>
    el.animate(keyframes, { delay, duration, easing, fill: "backwards" });

  let started = false;
  function reveal() {
    if (started) return;
    started = true;
    introGate.revealStart.open();

    const anims = [];
    const from = (y, scale = 1, extra = {}) => ({ opacity: 0, transform: `translateY(${y}px) scale(${scale})`, ...extra });
    const to = (extra = {}) => ({ opacity: 1, transform: "translateY(0) scale(1)", ...extra });

    const utility = document.getElementById("utility-bar");
    const headerMain = document.querySelector(".site-header__main");
    const media = hero.querySelector(".hero-section__media");
    const title = hero.querySelector(".hero-section__title");
    const description = hero.querySelector(".hero-section__description");
    const chips = hero.querySelectorAll(".hero-section__chip");
    const actions = hero.querySelector(".hero-section__actions");

    // Utility bar: 100 ms, 700 ms, from −30px · Header: 200 ms, 800 ms, from −40px
    if (utility) anims.push(play(utility, [from(-30), to()], 100, 700));
    if (headerMain) anims.push(play(headerMain, [from(-40), to()], 200, 800));

    // Hero photo/video: fades in over 1 s and settles from 120 % over 7.5 s
    if (media) {
      play(media, [{ opacity: 0 }, { opacity: 1 }], 0, 1000, "ease-out");
      play(media, [{ transform: "scale(1.2)" }, { transform: "scale(1)" }], 0, 7500, "ease");
    }

    // Title: word by word from 48px below, blurred 14px → sharp (537 ms, 188 ms apart)
    if (title) {
      splitWords(title).forEach((word, i) => {
        // The blur can't run on the GPU: give each word its own layer while it animates,
        // so only that word is repainted per frame (not the hero area over the video)
        word.style.willChange = "transform, opacity, filter";
        const anim = play(word, [from(48, 1, { filter: "blur(14px)" }), to({ filter: "blur(0px)" })], 300 + i * 188, 537);
        const release = () => { word.style.willChange = ""; };
        anim.finished.then(release, release);
        anims.push(anim);
      });
    }

    // Description: line by line from 20px below (615 ms, 185 ms apart)
    if (description) {
      const words = splitWords(description);
      lineIndexes(words).forEach((line, i) => {
        anims.push(play(words[i], [from(20), to()], 900 + line * 185, 615));
      });
    }

    // Chips: 1.9 s on, 80 ms apart, 600 ms, from 18px below at 94 %
    chips.forEach((chip, i) => {
      anims.push(play(chip, [from(18, 0.94), to()], 1900 + i * 80, 600));
    });

    // Buttons: 2.3 s on, 120 ms apart, 700 ms, from 22px below at 95 %
    if (actions) {
      Array.from(actions.children).forEach((button, i) => {
        anims.push(play(button, [from(22, 0.95), to()], 2300 + i * 120, 700));
      });
    }

    // All animations above already hold their first frame, so this can't flash
    root.classList.remove("hero-entrance-pending");

    const end = () => introGate.revealEnd.open();
    Promise.all(anims.map((a) => a.finished)).then(end, end);
  }

  // Start once the title font and the hero photo are ready (so lines are measured
  // correctly and the photo doesn't fade in empty) — but never wait more than 1.5 s
  const photo = hero.querySelector(".hero-section__image");
  const ready = [
    document.fonts ? document.fonts.ready : null,
    photo && photo.decode ? photo.decode() : null,
  ].filter(Boolean).map((promise) => promise.catch(() => {}));
  Promise.race([Promise.all(ready), new Promise((resolve) => window.setTimeout(resolve, 1500))]).then(reveal);
})();

/* ==========================================
   Welcome screen (index.html) — background video
   Uses <video data-welcome-video data-src="…" poster="…"> (data-src-mobile for
   ≤ 576px). The poster (campus banner) is the first paint; the video is fetched
   once the page has loaded and takes over from the poster when it plays.
   Skipped (poster stays) when no source is set, with reduced motion or data
   saver, or if the file is missing or autoplay is blocked.
========================================== */
(function () {
  const video = document.querySelector("[data-welcome-video]");
  if (!video) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduceMotion || saveData) return;

  const isMobile = window.matchMedia("(max-width: 576px)").matches;
  const src = ((isMobile && video.dataset.srcMobile) || video.dataset.src || "").trim();
  if (!src) return;

  const load = () => {
    video.muted = true; // required for autoplay in every browser
    video.src = src;
    video.play().catch(() => {}); // autoplay blocked / file missing → photo stays
  };

  if (document.readyState === "complete") load();
  else window.addEventListener("load", load, { once: true });
})();

/* ==========================================
   Welcome screen (index.html) — navigation to home.html
   Goes to the "Enter Now" link's href (home.html) when any one of these happens:
   the link is clicked, Enter is pressed, or 30 s have passed. A flag makes sure
   it navigates only once; the countdown timer and key listener are cleared
   first. Ctrl/⌘/Shift/middle-click on the link keep the browser's own behaviour
   (new tab/window), and Enter with a modifier key is left to the browser.
========================================== */
(function () {
  const screen = document.querySelector("[data-welcome]");
  const link = document.querySelector("[data-welcome-enter]");
  if (!screen || !link) return;

  const SECONDS = 30;
  const countdownValue = document.querySelector("[data-welcome-countdown]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const keys = new AbortController();
  let done = false;
  let timer = null;
  let deadline = 0;

  const enter = () => {
    if (done) return;
    done = true;
    window.clearInterval(timer);
    keys.abort();
    // Short fade-out (0.3 s) so the hand-over to the main page isn't a hard cut
    if (reduceMotion) {
      window.location.href = link.href;
      return;
    }
    screen.classList.add("is-leaving");
    window.setTimeout(() => { window.location.href = link.href; }, 300);
  };

  // Ticks from a fixed deadline (no drift if a tick runs late); enters at 0
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (countdownValue) countdownValue.textContent = String(remaining);
    if (remaining === 0) enter();
  };

  const start = () => {
    window.clearInterval(timer);
    deadline = Date.now() + SECONDS * 1000;
    tick();
    timer = window.setInterval(tick, 1000);
  };

  link.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enter();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.repeat || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    // Enter on the focused link already fires its click (handled above)
    if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
    event.preventDefault();
    enter();
  }, { signal: keys.signal });

  start();

  // Back button can restore this page from the back/forward cache after leaving it,
  // with the countdown finished: reload so it starts over with fresh listeners
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    window.location.reload();
  });
})();

/* ==========================================
   Custom cursor
   Port of the reference cursor: a dot that follows the pointer with easing
   (0.16 per frame), a ring over links/buttons, and a labelled blob over cards
   marked data-cursor="Visit|About|View|Read|Explore|Play" (data-cursor-glass =
   frosted blob). Fine pointers only, off with reduced motion (native cursor).
   Hidden over the map iframe (its own cursor shows there) and while a dialog
   is open (dialogs sit in the top layer, above any z-index).
========================================== */
(function () {
  const cursor = document.querySelector("[data-cursor-root]");
  if (!cursor) return;

  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduceMotion) {
    cursor.remove();
    return;
  }

  const label = cursor.querySelector(".custom-cursor__label");
  const LINK = "a[href], button, [role='tab']";
  const STATES = ["is-link", "is-blob", "is-glass"];
  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let x = tx;
  let y = ty;
  let started = false;
  let running = false;
  let overFrame = false;
  let dialogOpen = false;

  document.body.classList.add("has-custom-cursor");

  const syncVisibility = () => {
    cursor.classList.toggle("is-hidden", !started || overFrame || dialogOpen);
  };

  function loop() {
    x += (tx - x) * 0.16;
    y += (ty - y) * 0.16;
    cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
    if (Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1) {
      running = false;
      return;
    }
    window.requestAnimationFrame(loop);
  }

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    tx = event.clientX;
    ty = event.clientY;
    if (!started) {
      x = tx;
      y = ty;
      started = true;
      syncVisibility();
    }
    if (!running) {
      running = true;
      window.requestAnimationFrame(loop);
    }
  }, { passive: true });

  document.documentElement.addEventListener("mouseleave", () => cursor.classList.add("is-hidden"));
  document.documentElement.addEventListener("mouseenter", syncVisibility);

  // Shape follows what's under the pointer: card blob > link ring > dot
  document.addEventListener("pointerover", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    cursor.classList.remove(...STATES);
    overFrame = !!(el && el.closest("iframe"));
    syncVisibility();
    if (!el) return;
    const card = el.closest("[data-cursor]");
    if (card) {
      label.textContent = card.dataset.cursor;
      cursor.classList.add("is-blob");
      if (card.hasAttribute("data-cursor-glass")) cursor.classList.add("is-glass");
    } else if (el.closest(LINK)) {
      cursor.classList.add("is-link");
    }
  });

  // Native cursor while a dialog (video modal / mobile menu) is open
  const dialogs = document.querySelectorAll("dialog");
  const syncDialogs = () => {
    dialogOpen = Array.from(dialogs).some((d) => d.open);
    document.body.classList.toggle("has-custom-cursor", !dialogOpen);
    syncVisibility();
  };
  const observer = new MutationObserver(syncDialogs);
  dialogs.forEach((d) => observer.observe(d, { attributes: true, attributeFilter: ["open"] }));
})();

/* ==========================================
   Cursor cards — whole card triggers its action
   Cards that show a cursor label (data-cursor) but are not links themselves
   (institution cards → their "Visit" link, Students speak → the play button)
   forward a click on empty card space to the card's own link/button, so the
   "Visit" / "Play" cursor does what it says. Keyboard users still tab to the
   real link/button.
========================================== */
(function () {
  document.querySelectorAll("[data-cursor]:not(a)").forEach((card) => {
    const action = card.querySelector(".button, .testimonials-section__play");
    if (!action) return;
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea, label")) return;
      action.click();
    });
  });
})();

/* ==========================================
   Gradient buttons — viewport animation
   Adds .is-in-view the first time each .button--gradient is mostly on screen;
   the CSS animation plays once. Unobserved afterwards, so it never restarts.
   Hover is pure CSS (::before overlay) and runs independently of this.
========================================== */
(function () {
  const buttons = document.querySelectorAll(".button--gradient");
  if (!buttons.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) return; // static gradient

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in-view");
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );
  // The hero's "Enter Now" is under the intro overlay at first: wait until the hero
  // entrance has finished, or the pulse would play unseen / clash with the entrance
  introGate.revealEnd.then(() => buttons.forEach((button) => observer.observe(button)));
})();

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
   Sliders (Swiper — loaded from CDN in home.html)
   1. Life at GIT: slider at every width, driven by the design's prev/next
      arrows. Arrows are hidden when there are 3 slides or fewer, and Swiper
      also hides them whenever every slide already fits (watchOverflow).
   2. Students speak: the same at every width, with its own arrows.
   3. Find Your Path: desktop keeps the Figma grid; on tablet it becomes a
      swipeable slider (a peek of the next card shows that the row scrolls),
      created/destroyed as the viewport enters/leaves that range.
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

  /* --- 2. Students speak (5 videos): slider at every width, like Life at GIT ---
     3 cards on desktop (32px apart, as the old grid), 2.2 on tablet, fixed
     313.313px cards on mobile (width set in CSS). Arrows only with > 3 videos. */
  const testimonialsSlider = document.querySelector(".testimonials-section__slider");
  if (testimonialsSlider) {
    const slideCount = testimonialsSlider.querySelectorAll(".swiper-slide").length;
    const controls = document.querySelector(".testimonials-section__controls");
    const hasEnoughSlides = slideCount > 3;

    if (controls) controls.hidden = !hasEnoughSlides;

    new window.Swiper(testimonialsSlider, {
      slidesPerView: "auto",
      spaceBetween: 24,
      loop: hasEnoughSlides,
      grabCursor: true,
      watchOverflow: true,
      navigation: hasEnoughSlides
        ? {
            prevEl: ".testimonials-section__control--prev",
            nextEl: ".testimonials-section__control--next",
          }
        : false,
      breakpoints: {
        577: { slidesPerView: 2.2, spaceBetween: 24 },
        1200: { slidesPerView: 3, spaceBetween: 32 },
      },
    });
  }

  /* --- 3. Tablet-only slider --- */
  const sliderBase = { grabCursor: true, watchOverflow: true };

  // Each slider has its own range. Find Your Path is a 2 × 2 grid on mobile
  // (Figma mobile design), so it is only a slider on tablet (577–1199.98px), with
  // the 18px tablet gap.
  const mobileSliders = [
    {
      selector: ".institutions-section__slider",
      query: "(min-width: 577px) and (max-width: 1199.98px)",
      options: { ...sliderBase, slidesPerView: 2.2, spaceBetween: 18 },
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
   Logo marquees — infinite (Our recruiters rows, Partnerships & Affiliations)
   Any [data-marquee] element whose [data-marquee-track] list scrolls forever:
   data-marquee-direction="right" moves left → right, "left" moves right → left.
   - Seamless loop: the logo set is cloned until the track is at least one set
     wider than the viewport; the position wraps by exactly one set width
     (measured with sub-pixel precision), so the seam is invisible.
   - Smooth: one requestAnimationFrame loop, time-based (frame-rate independent),
     moving only `transform: translate3d` — no layout work per frame.
   - Hover: eases to a stop. Drag / swipe: moves the row 1:1 with the pointer;
     on release it carries the swipe momentum and eases back to auto speed.
   - Pauses while off-screen; no jump after switching browser tabs.
   - Mobile (≤ 576px): a marquee stands down there (static layout from CSS — no
     clones, no transform, no loop) unless it has data-marquee-mobile. Both
     Our recruiters rows and Partnerships have it, so they scroll on phones too.
========================================== */
(function () {
  const marquees = document.querySelectorAll("[data-marquee]");
  if (!marquees.length) return;

  const SPEED = 45;          // auto-scroll speed, px per second
  const EASE = 6;            // how quickly speed eases toward its target (higher = snappier)
  const MAX_FLING = 1800;    // cap on release momentum, px per second
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const staticGrid = window.matchMedia("(max-width: 576px)");

  marquees.forEach((root) => {
    const track = root.querySelector("[data-marquee-track]");
    if (!track) return;

    const direction = root.dataset.marqueeDirection === "right" ? 1 : -1;
    const originals = Array.from(track.children);
    // Static grid instead of a marquee on mobile, unless this one opts in to scrolling there
    const keepsMobile = root.hasAttribute("data-marquee-mobile");
    const isStatic = () => staticGrid.matches && !keepsMobile;

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
      if (isStatic()) {
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
      if (rafId !== null || isStatic()) return;
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
      if (isStatic()) return;
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
      if (!isStatic()) start();
    });
  });
})();

/* ==========================================
   Students speak — video modal
   Each .testimonials-section__play button carries data-video-src (the student's
   clip in assets/videos) and data-video-title. Clicking opens the shared
   <dialog>, loads the clip (the card's poster shows until it starts) and plays
   it. Custom controls: play/pause, mute, close.
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
