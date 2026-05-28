(() => {
  function getBundleAddToCartErrorMessage(error) {
    const rawMessage = String(error?.message || error || "").trim();
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("sold out") ||
      normalized.includes("out of stock") ||
      normalized.includes("not available") ||
      normalized.includes("unavailable") ||
      normalized.includes("cannot be purchased") ||
      normalized.includes("can't be purchased") ||
      normalized.includes("isn't available") ||
      normalized.includes("is not available")
    ) {
      return "One of the selected items is no longer available. Please choose another variant or another bundle.";
    }

    return "This bundle can't be added right now. Please refresh the page and try again.";
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function renderTimerValue(timer, value) {
    const valueNode = timer.querySelector(".bundle-widget__timer-value");
    if (!valueNode) return;

    const isDigitPreset =
      timer.classList.contains("bundle-widget__timer--odometer") ||
      timer.classList.contains("bundle-widget__timer--split-flap");

    valueNode.setAttribute("aria-label", value);

    if (!isDigitPreset) {
      valueNode.textContent = value;
      return;
    }

    valueNode.innerHTML = value
      .split("")
      .map((character) =>
        character === ":"
          ? `<span class="bundle-widget__timer-separator" aria-hidden="true">:</span>`
          : `<span class="bundle-widget__timer-digit" aria-hidden="true"><span>${character}</span></span>`,
      )
      .join("");
  }

  function renderTimer(timer) {
    const endRaw = timer.dataset.end || "";
    const labelNode = timer.querySelector(".bundle-widget__timer-label");
    const valueNode = timer.querySelector(".bundle-widget__timer-value");
    const end = Date.parse(endRaw);

    if (!valueNode || Number.isNaN(end)) {
      timer.hidden = true;
      return;
    }

    const remaining = end - Date.now();
    if (remaining <= 0) {
      if (labelNode) {
        labelNode.textContent =
          timer.dataset.expiredLabel !== undefined ? timer.dataset.expiredLabel : "Offer expired";
      }
      renderTimerValue(timer, "00:00:00");
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (labelNode) {
      labelNode.textContent =
        timer.dataset.prefix !== undefined ? timer.dataset.prefix : "Offer ends in";
    }

    renderTimerValue(timer, `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeVariantId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.includes("/")) return raw.split("/").pop() || "";
    return raw;
  }

  function parsePriceToCents(price) {
    return Math.round(Number(price || 0) * 100);
  }

  function getWidgetRegistry() {
    if (!window.__cashenzaBundleWidgetRegistry) {
      window.__cashenzaBundleWidgetRegistry = new Map();
    }

    return window.__cashenzaBundleWidgetRegistry;
  }

  function initWidget(root) {
    if (!root || root.dataset.bundleWidgetReady === "true") return;

    const configNode = root.querySelector("[data-bundle-config]");
    let config = {};

    if (configNode?.textContent) {
      try {
        config = JSON.parse(configNode.textContent);
      } catch (error) {
        console.error("Failed to parse Cashenza bundle config", error);
      }
    }

    const locale = config.locale || "en";
    const currencyCode = config.currencyCode || "EUR";
    const productHandle = config.productHandle || "";
    const proxyUrl = config.proxyUrl || "";
    const analyticsUrl = config.analyticsUrl || "";
    const bestSellerPngAssets = config.bestSellerPngAssets || {};
    const themeBadgeAppearance = config.themeBadgeAppearance || {};
    const themeEffectsPreset = config.themeEffectsPreset || "fade in";
    const themeTimerPreset = config.themeTimerPreset || "soft";
    const bundleBridge = window.__cashenzaBundleBridge;
    const dynamicRoot = root.querySelector(".bundle-dynamic-root");
    const staticRoot = root.querySelector("[data-static-root]");
    const loadingContainer =
      root.closest(".product-information") ||
      root.closest(".product-details") ||
      document.querySelector(".product-information") ||
      document.querySelector(".product-details");
    const registry = getWidgetRegistry();
    const isProductContext = Boolean(productHandle);

    function setBundlePageState(state) {
      if (state) document.documentElement.dataset.cashenzaBundleState = state;
    }

    function clearLoadingState(state = "ready") {
      setBundlePageState(state);
      document.documentElement.classList.add("cashenza-bundle-ready");
      document.documentElement.classList.remove("cashenza-bundle-loading");
      document.body?.classList?.remove("cashenza-bundle-loading");
      loadingContainer?.classList?.remove("cashenza-bundle-loading");
    }

    function getRootTopbar() {
      return Array.from(root.children).find((child) =>
        child.classList?.contains("bundle-widget__topbar"),
      );
    }

    function setRootTopbarVisible(visible) {
      const rootTopbar = getRootTopbar();
      if (!rootTopbar) return;

      rootTopbar.hidden = !visible;
      rootTopbar.style.display = visible ? "" : "none";
    }

    function hideWidgetAndStop({ clearLoading = true } = {}) {
      root.hidden = true;
      root.dataset.bundleVisibility = "hidden";
      root.style.display = "none";
      if (clearLoading) clearLoadingState();
      root.dataset.bundleWidgetReady = "true";
    }

    if (!isProductContext) {
      setBundlePageState("empty");
      hideWidgetAndStop();
      return;
    }

    const existingRoot = registry.get(productHandle);
    if (existingRoot && existingRoot !== root && existingRoot.isConnected) {
      hideWidgetAndStop({ clearLoading: false });
      return;
    }

    registry.set(productHandle, root);
    root.dataset.bundleWidgetReady = "true";
    setBundlePageState("checking");

    window.addEventListener(
      "pagehide",
      () => {
        const currentRoot = registry.get(productHandle);
        if (currentRoot === root) {
          registry.delete(productHandle);
        }
      },
      { once: true },
    );

    function getAnalyticsSessionId() {
      try {
        const key = "cashenza_bundle_session_id";
        const existing = window.sessionStorage.getItem(key);
        if (existing) return existing;
        const created = `cashenza-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.sessionStorage.setItem(key, created);
        return created;
      } catch (error) {
        return `cashenza-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
    }

    const analyticsSessionId = getAnalyticsSessionId();

    function trackAnalyticsEvent(payload) {
      if (!analyticsUrl) return;

      fetch(analyticsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          productHandle,
          sessionId: analyticsSessionId,
          ...payload,
        }),
      }).catch(() => {});
    }

    function formatMoney(cents) {
      const value = Number(cents || 0) / 100;

      try {
        return new Intl.NumberFormat(locale || "fr-FR", {
          style: "currency",
          currency: currencyCode || "EUR",
        }).format(value);
      } catch (error) {
        return `${value.toFixed(2)} ${currencyCode || "EUR"}`;
      }
    }

    function createActionButtonsMarkup(prefix) {
      return `
        <div class="bundle-action-buttons">
          <button type="button" class="bundle-add-button" ${prefix ? `data-${prefix}-add-button` : ""}>
            Add to cart
          </button>
          <button type="button" class="bundle-buy-now-button" ${prefix ? `data-${prefix}-buy-button` : ""}>
            Buy it now
          </button>
        </div>
      `;
    }

    root.querySelectorAll("[data-bundle-timer]").forEach((timer) => renderTimer(timer));

    function startTimers() {
      if (root.dataset.bundleTimersStarted === "true") return;
      root.dataset.bundleTimersStarted = "true";
      window.setInterval(() => {
        const timers = root.querySelectorAll("[data-bundle-timer]");
        timers.forEach((timer) => renderTimer(timer));
      }, 1000);
    }

    function wireStaticBundle() {
      if (!staticRoot) return;

      const offerNodes = Array.from(staticRoot.querySelectorAll(".bundle-offer"));
      const state = {};
      let selectedOfferCount = 1;
      let hasTrackedStaticImpression = false;

      staticRoot.querySelectorAll(".bundle-offer-item").forEach((item) => {
        const index = Number(item.dataset.itemIndex);
        if (!state[index]) {
          state[index] = {
            variantId: normalizeVariantId(item.dataset.currentVariantId),
            price: Number(item.dataset.currentPrice || 0),
            image: item.querySelector("[data-item-image]")?.getAttribute("src") || "",
          };
        }
      });

      function getSubtotal(itemCount) {
        let subtotal = 0;
        for (let index = 1; index <= itemCount; index += 1) {
          subtotal += Number(state[index]?.price || 0);
        }
        return subtotal;
      }

      function getSelectedStaticOfferNode() {
        return offerNodes.find(
          (offer) => Number(offer.dataset.itemCount || 1) === selectedOfferCount,
        ) || null;
      }

      function getSelectedStaticAnalyticsPayload() {
        const selectedOfferNode = getSelectedStaticOfferNode();
        return {
          bundleType: "VOLUME",
          offerPosition: selectedOfferCount,
          offerQuantity: selectedOfferCount,
          metadata: {
            offerTitle:
              selectedOfferNode?.querySelector(".bundle-offer__title")?.textContent?.trim() ||
              `Bundle x${selectedOfferCount}`,
          },
        };
      }

      function publishStaticBundleState() {
        const selectedOfferNode = getSelectedStaticOfferNode();
        bundleBridge?.publish?.(root, {
          visible: root.dataset.bundleVisibility === "visible",
          priceText:
            selectedOfferNode?.querySelector('[data-price-type="final"]')?.textContent?.trim() || "",
          bundleTitle:
            selectedOfferNode?.querySelector(".bundle-offer__title")?.textContent?.trim() ||
            `Bundle x${selectedOfferCount}`,
          itemCount: selectedOfferCount,
        });
      }

      function syncOfferPrices() {
        offerNodes.forEach((offer) => {
          const itemCount = Number(offer.dataset.itemCount || 1);
          const discount = Number(offer.dataset.discount || 0);
          const subtotal = getSubtotal(itemCount);
          const finalPrice = subtotal - (subtotal * discount / 100);
          const compareNode = offer.querySelector('[data-price-type="compare"]');
          const finalNode = offer.querySelector('[data-price-type="final"]');

          if (compareNode) compareNode.textContent = formatMoney(subtotal);
          if (finalNode) finalNode.textContent = formatMoney(finalPrice);
        });

        publishStaticBundleState();
      }

      function syncItem(index) {
        const current = state[index];
        if (!current) return;

        staticRoot.querySelectorAll(`.bundle-offer-item[data-item-index="${index}"]`).forEach((item) => {
          const img = item.querySelector("[data-item-image]");
          if (img && current.image) img.src = current.image;
        });

        staticRoot.querySelectorAll(`.bundle-variant-select[data-item-index="${index}"]`).forEach((select) => {
          select.value = normalizeVariantId(current.variantId);
        });
      }

      function setSelectedOffer(itemCount) {
        selectedOfferCount = itemCount;

        offerNodes.forEach((offer) => {
          const active = Number(offer.dataset.itemCount || 1) === itemCount;
          offer.classList.toggle("is-selected", active);
          offer.setAttribute("aria-pressed", active ? "true" : "false");
          const details = offer.querySelector(".bundle-offer__details");
          if (details) details.hidden = !active;
        });

        publishStaticBundleState();
      }

      function setVariant(index, option) {
        state[index] = {
          variantId: normalizeVariantId(option.value),
          price: Number(option.dataset.price || 0),
          image: option.dataset.image || "",
        };

        syncItem(index);
        syncOfferPrices();
      }

      async function addSelectedStaticBundle({ checkout = false } = {}) {
        const selectedOfferNode = getSelectedStaticOfferNode();
        const selectedDiscount = String(selectedOfferNode?.dataset.discount || "0");
        const selectedTitle =
          selectedOfferNode?.querySelector(".bundle-offer__title")?.textContent?.trim() ||
          `Bundle x${selectedOfferCount}`;
        const bundleGroupId = `static-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const items = [];

        for (let index = 1; index <= selectedOfferCount; index += 1) {
          const current = state[index];
          if (!current?.variantId) continue;
          const itemNode = staticRoot.querySelector(`.bundle-offer-item[data-item-index="${index}"]`);

          items.push({
            id: normalizeVariantId(current.variantId),
            quantity: 1,
            properties: {
              "_bundle_group_id": bundleGroupId,
              "_bundle_offer_size": String(selectedOfferCount),
              "_bundle_offer_title": selectedTitle,
              "_bundle_offer_source": "theme_app_extension_offer_embedded_selectors",
              "_bundle_discount_type": "PERCENTAGE",
              "_bundle_discount_value": selectedDiscount,
              "_bundle_item_index": String(index),
              "_bundle_item_label": itemNode?.dataset.itemLabel || "",
            },
          });
        }

        if (!items.length) return;

        const actionButtons = staticRoot.querySelectorAll(".bundle-add-button, .bundle-buy-now-button");
        const labels = Array.from(actionButtons).map((node) => node.textContent || "");
        actionButtons.forEach((button) => {
          button.disabled = true;
          button.textContent = button.classList.contains("bundle-buy-now-button") ? "Redirecting..." : "Adding...";
        });

        try {
          const response = await fetch("/cart/add.js", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ items }),
          });

          if (!response.ok) {
            let errorMessage = "Failed to add bundle to cart";
            try {
              const payload = await response.json();
              errorMessage = payload?.description || payload?.message || JSON.stringify(payload);
            } catch (jsonError) {
              errorMessage = `Failed to add bundle to cart (${response.status})`;
            }
            throw new Error(errorMessage);
          }

          trackAnalyticsEvent({
            ...getSelectedStaticAnalyticsPayload(),
            eventType: checkout ? "BUY_NOW" : "ADD_TO_CART",
          });
          window.location.href = checkout ? "/checkout" : "/cart";
        } catch (error) {
          console.error(error);
          actionButtons.forEach((button, index) => {
            button.disabled = false;
            button.textContent = labels[index] || "Add to cart";
          });
          trackAnalyticsEvent({
            ...getSelectedStaticAnalyticsPayload(),
            eventType: "ADD_TO_CART_FAILED",
            metadata: {
              ...getSelectedStaticAnalyticsPayload().metadata,
              action: checkout ? "BUY_NOW" : "ADD_TO_CART",
              message: String(error?.message || error || ""),
            },
          });
          window.alert(getBundleAddToCartErrorMessage(error));
        }
      }

      offerNodes.forEach((offer) => {
        const itemCount = Number(offer.dataset.itemCount || 1);

        offer.addEventListener("click", (event) => {
          if (!event.target.closest(".bundle-variant-select")) {
            setSelectedOffer(itemCount);
            trackAnalyticsEvent({
              bundleType: "VOLUME",
              eventType: "OFFER_SELECTED",
              offerPosition: itemCount,
              offerQuantity: itemCount,
            });
          }
        });

        offer.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelectedOffer(itemCount);
            trackAnalyticsEvent({
              bundleType: "VOLUME",
              eventType: "OFFER_SELECTED",
              offerPosition: itemCount,
              offerQuantity: itemCount,
            });
          }
        });
      });

      staticRoot.querySelectorAll(".bundle-variant-select").forEach((select) => {
        select.addEventListener("click", (event) => {
          event.stopPropagation();
          const offer = event.target.closest(".bundle-offer");
          if (offer) setSelectedOffer(Number(offer.dataset.itemCount || 1));
        });

        select.addEventListener("change", (event) => {
          const currentSelect = event.target;
          const offer = currentSelect.closest(".bundle-offer");
          const itemIndex = Number(currentSelect.dataset.itemIndex || 0);
          const option = currentSelect.selectedOptions[0];

          if (offer) setSelectedOffer(Number(offer.dataset.itemCount || 1));
          if (itemIndex && option) setVariant(itemIndex, option);
        });
      });

      staticRoot.querySelector("[data-static-add-button]")?.addEventListener("click", () => {
        addSelectedStaticBundle();
      });
      staticRoot.querySelector("[data-static-buy-button]")?.addEventListener("click", () => {
        addSelectedStaticBundle({ checkout: true });
      });

      bundleBridge?.register?.(root, {
        addSelectedBundle: () => addSelectedStaticBundle(),
        buyNow: () => addSelectedStaticBundle({ checkout: true }),
      });

      setSelectedOffer(1);
      syncOfferPrices();
      if (!hasTrackedStaticImpression) {
        hasTrackedStaticImpression = true;
        trackAnalyticsEvent({
          ...getSelectedStaticAnalyticsPayload(),
          eventType: "BUNDLE_IMPRESSION",
        });
      }
    }

    function getEffectiveAppearance(bundle) {
      const appearance = { ...(bundle?.appearance || {}) };

      appearance.bestSellerBadgePreset =
        appearance.bestSellerBadgePreset ?? themeBadgeAppearance.bestSellerBadgePreset;
      appearance.bestSellerPngBadgePreset =
        appearance.bestSellerPngBadgePreset ?? themeBadgeAppearance.bestSellerPngBadgePreset;
      appearance.bestSellerBadgeColor =
        appearance.bestSellerBadgeColor ?? themeBadgeAppearance.bestSellerBadgeColor;
      appearance.bestSellerBadgeText =
        appearance.bestSellerBadgeText ?? themeBadgeAppearance.bestSellerBadgeText;
      appearance.saveBadgeColor =
        appearance.saveBadgeColor ?? themeBadgeAppearance.saveBadgeColor;
      appearance.saveBadgeText =
        appearance.saveBadgeText ?? themeBadgeAppearance.saveBadgeText;
      appearance.saveBadgePrefix =
        appearance.saveBadgePrefix ?? themeBadgeAppearance.saveBadgePrefix;
      appearance.timerPreset = appearance.timerPreset || themeTimerPreset || "soft";

      return appearance;
    }

    function getTimerPresetTheme(appearance) {
      const preset = ["soft", "cards", "outline", "odometer", "split-flap"].includes(String(appearance?.timerPreset || ""))
        ? String(appearance.timerPreset)
        : "soft";
      const timerBg = appearance?.timerBackgroundColor || "#1a2118";
      const timerText = appearance?.timerTextColor || "#ffffff";
      const timerPrefix = appearance?.timerPrefix ?? "Offer ends in";
      const timerExpiredText = appearance?.timerExpiredText ?? "Offer expired";

      if (preset === "cards") {
        return {
          preset,
          background: `linear-gradient(135deg, color-mix(in srgb, ${timerBg} 88%, black) 0%, color-mix(in srgb, ${timerBg} 58%, black) 100%)`,
          text: timerText,
          border: "none",
          labelColor: "rgba(255,255,255,0.82)",
          valueColor: timerText,
          prefix: timerPrefix,
          expiredLabel: timerExpiredText,
        };
      }

      if (preset === "outline") {
        return {
          preset,
          background: "transparent",
          text: timerText,
          border: `2px solid ${timerText}`,
          labelColor: timerText,
          valueColor: timerText,
          prefix: timerPrefix,
          expiredLabel: timerExpiredText,
        };
      }

      if (preset === "odometer") {
        return {
          preset,
          background: timerBg || "#151b16",
          text: timerText || "#f8fff4",
          border: "none",
          labelColor: `color-mix(in srgb, ${timerText || "#f8fff4"} 78%, transparent)`,
          valueColor: timerText || "#f8fff4",
          prefix: timerPrefix,
          expiredLabel: timerExpiredText,
        };
      }

      if (preset === "split-flap") {
        return {
          preset,
          background: timerBg || "#111111",
          text: timerText || "#ffffff",
          border: "none",
          labelColor: `color-mix(in srgb, ${timerText || "#ffffff"} 72%, transparent)`,
          valueColor: timerText || "#ffffff",
          prefix: timerPrefix,
          expiredLabel: timerExpiredText,
        };
      }

      return {
        preset: "soft",
        background: timerBg,
        text: timerText,
        border: "none",
        labelColor: timerText,
        valueColor: timerText,
        prefix: timerPrefix,
        expiredLabel: timerExpiredText,
      };
    }

    function renderBestSellerBadge(appearance, fallbackText) {
      const pngPreset = String(appearance?.bestSellerPngBadgePreset || "none");
      const badgeText = escapeHtml(appearance?.bestSellerText || fallbackText || "Best seller");
      const pngAsset =
        bestSellerPngAssets[pngPreset] ||
        (pngPreset !== "none"
          ? `/apps/custom-bundles/badge?preset=${encodeURIComponent(pngPreset)}`
          : "");

      if (pngPreset !== "none" && pngAsset) {
        return `<img class="bundle-offer__pill-image bundle-offer__pill-image--${escapeHtml(pngPreset)}" src="${escapeHtml(pngAsset)}" alt="${badgeText}" width="96" height="96" loading="lazy">`;
      }

      const cssPreset = escapeHtml(appearance?.bestSellerBadgePreset || "pill");
        return `<span class="bundle-offer__pill bundle-offer__pill--${cssPreset}">${badgeText}</span>`;
    }

    function getBestSellerTitleRowClass(appearance, offer) {
      const pngPreset = String(appearance?.bestSellerPngBadgePreset || "none");
      const hasPngBadge = Boolean(offer?.isBestSeller && pngPreset !== "none");
      return hasPngBadge ? "bundle-offer__title-row bundle-offer__title-row--has-png" : "bundle-offer__title-row";
    }

    function applyBundleAppearance(bundle, target = root) {
      const appearance = getEffectiveAppearance(bundle);
      const preset = appearance.designPreset || "soft";

      target.className = target.className.replace(/bundle-widget--[a-z0-9_-]+/gi, "").trim();
      target.classList.add("bundle-widget");
      target.classList.add(`bundle-widget--${preset}`);

      target.style.setProperty("--bundle-accent-base", appearance.primaryColor || "#8db28a");
      target.style.setProperty("--bundle-text", appearance.textColor || "#1a2118");
      target.style.setProperty("--bundle-bg", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 20%, white)`);
      target.style.setProperty("--bundle-bg-selected", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 30%, white)`);
      target.style.setProperty("--bundle-border", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 22%, white)`);
      target.style.setProperty("--bundle-input", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 42%, white)`);
      target.style.setProperty("--bundle-heading-size", `${appearance.headingSize ?? 28}px`);
      target.style.setProperty("--bundle-subheading-size", `${appearance.subheadingSize ?? 16}px`);
      target.style.setProperty("--bundle-offer-title-size", `${appearance.offerTitleSize ?? 22}px`);
      target.style.setProperty("--bundle-offer-price-size", `${appearance.offerPriceSize ?? 24}px`);
      target.style.setProperty("--bundle-card-gap", `${appearance.cardGap ?? 12}px`);
      target.style.setProperty("--bundle-card-padding", `${appearance.cardPadding ?? 18}px`);
      target.style.setProperty("--bundle-card-radius", `${appearance.offerRadius ?? 24}px`);
      target.style.setProperty("--bundle-bestseller-bg", appearance.bestSellerBadgeColor || "#ffffff");
      target.style.setProperty("--bundle-bestseller-text", appearance.bestSellerBadgeText || "#1a2118");
      target.style.setProperty("--bundle-save-bg", appearance.saveBadgeColor || "#f1c500");
      target.style.setProperty("--bundle-save-text", appearance.saveBadgeText || "#1a2118");

      const timerTheme = getTimerPresetTheme(appearance);
      target.style.setProperty("--bundle-timer-bg", timerTheme.background);
      target.style.setProperty("--bundle-timer-text", timerTheme.text);
      target.style.setProperty("--bundle-timer-border", timerTheme.border);
      target.style.setProperty("--bundle-timer-label-color", timerTheme.labelColor);
      target.style.setProperty("--bundle-timer-value-color", timerTheme.valueColor);

      const eyebrowNode = target.querySelector(".bundle-widget__eyebrow");
      const headingNode = target.querySelector(".bundle-widget__title");
      const subheadingNode = target.querySelector(".bundle-widget__subheading");
      if (eyebrowNode && typeof appearance.eyebrow === "string") eyebrowNode.textContent = appearance.eyebrow;
      if (headingNode && typeof appearance.heading === "string") headingNode.textContent = appearance.heading;
      if (subheadingNode && typeof appearance.subheading === "string") subheadingNode.textContent = appearance.subheading;

      const timerNode = target.querySelector("[data-bundle-timer]");
      if (timerNode) {
        timerNode.className = timerNode.className.replace(/bundle-widget__timer--[a-z0-9_-]+/gi, "").trim();
        timerNode.classList.add("bundle-widget__timer");
        timerNode.classList.add(`bundle-widget__timer--${timerTheme.preset}`);

        if (appearance.showTimer && appearance.timerEnd) {
          timerNode.hidden = false;
          timerNode.dataset.end = appearance.timerEnd;
          timerNode.dataset.prefix = timerTheme.prefix;
          timerNode.dataset.expiredLabel = timerTheme.expiredLabel;
          const timerLabelNode = timerNode.querySelector(".bundle-widget__timer-label");
          if (timerLabelNode) timerLabelNode.textContent = timerTheme.prefix;
          renderTimer(timerNode);
        } else {
          timerNode.hidden = true;
        }
      }
    }

    function createDynamicHeaderMarkup() {
      return `
        <div class="bundle-widget__topbar">
          <div class="bundle-widget__header">
            <p class="bundle-widget__eyebrow"></p>
            <h2 class="bundle-widget__title"></h2>
            <p class="bundle-widget__subheading"></p>
          </div>
          <div class="bundle-widget__timer" data-bundle-timer hidden>
            <span class="bundle-widget__timer-label"></span>
            <span class="bundle-widget__timer-value">--:--:--</span>
          </div>
        </div>
      `;
    }

    let revealAnimationStarted = false;
    let revealAnimationResetTimer = null;

    function startRevealAnimation(offerCount, effectPreset = "none") {
      if (revealAnimationStarted) return;
      revealAnimationStarted = true;
      const normalizedEffect = String(effectPreset || "none");
      if (normalizedEffect === "none") {
        root.dataset.bundleReveal = "settled";
        delete root.dataset.bundleRevealEffect;
        return;
      }

      root.style.setProperty("--bundle-offer-count", String(offerCount || 3));
      root.dataset.bundleRevealEffect = normalizedEffect;
      root.dataset.bundleReveal = "entering";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.dataset.bundleReveal = "visible";
          if (revealAnimationResetTimer) {
            window.clearTimeout(revealAnimationResetTimer);
          }
          revealAnimationResetTimer = window.setTimeout(() => {
            root.dataset.bundleReveal = "settled";
          }, 700);
        });
      });
    }

    function buildInitialSelections(bundle) {
      const selections = {};

      bundle.offers.forEach((offer) => {
        offer.items.forEach((item) => {
          if (selections[item.id]) return;
          const variants = item.product?.variants || [];
          const defaultVariant =
            variants.find((variant) => variant.id === item.variantId) ||
            variants.find((variant) => variant.availableForSale) ||
            variants[0];
          if (!defaultVariant) return;

          selections[item.id] = {
            variantId: normalizeVariantId(defaultVariant.id),
            title: defaultVariant.title,
            priceCents: parsePriceToCents(defaultVariant.price),
            image: defaultVariant.featuredImage || item.product?.featuredImage || "",
          };
        });
      });

      return selections;
    }

    function renderDynamicBundle(bundle, mountRoot = dynamicRoot) {
      if (!mountRoot) return;

      const appearance = getEffectiveAppearance(bundle);
      applyBundleAppearance(bundle, mountRoot);
      const selections = buildInitialSelections(bundle);
      const displayOffers =
        bundle.hideBaseOffer && bundle.offers.length > 1
          ? bundle.offers.slice(1)
          : bundle.offers;
      let selectedOfferId =
        displayOffers.some((offer) => offer.id === bundle.bestSellerOfferId)
          ? bundle.bestSellerOfferId
          : displayOffers[0]?.id || null;
      const quantitySelections = {};
      const unitSelections = {};
      let hasTrackedDynamicImpression = false;

      function getSelectedOffer() {
        return displayOffers.find((offer) => offer.id === selectedOfferId) || displayOffers[0] || null;
      }

      function isQuantitySelectorOffer(offer) {
        return Boolean(
          offer?.showQuantitySelector &&
            bundle.offers[0]?.id === offer.id &&
            offer.items?.length === 1,
        );
      }

      function parseQuantityOptions(offer) {
        return String(offer?.quantityOptions || "")
          .split(",")
          .map((entry) => Number(String(entry).trim()))
          .filter((entry) => Number.isFinite(entry) && entry >= 1)
          .map((entry) => Math.floor(entry))
          .filter((entry, index, list) => list.indexOf(entry) === index);
      }

      function getVariantInventoryLimit(offer) {
        const item = offer?.items?.[0];
        if (!item) return null;
        const variants = item.product?.variants || [];
        const selected = selections[item.id];
        const variant =
          variants.find((entry) => normalizeVariantId(entry.id) === normalizeVariantId(selected?.variantId)) ||
          variants.find((entry) => entry.availableForSale) ||
          variants[0] ||
          null;
        const inventory = Number(variant?.inventoryQuantity);
        return Number.isFinite(inventory) && inventory > 0 ? inventory : null;
      }

      function getAllowedQuantityOptions(offer) {
        const options = parseQuantityOptions(offer);
        const limit = getVariantInventoryLimit(offer);
        const filtered = limit ? options.filter((quantity) => quantity <= limit) : options;
        return filtered.length ? filtered : [1];
      }

      function getSelectedOfferQuantity(offer) {
        if (!isQuantitySelectorOffer(offer)) return Number(offer?.items?.[0]?.quantity || 1);

        const options = parseQuantityOptions(offer);
        const limit = getVariantInventoryLimit(offer);
        const current = Number(quantitySelections[offer.id] || options[0] || 1);
        const sanitized = Math.max(1, Math.floor(Number.isFinite(current) ? current : 1));

        if (options.length) {
          const allowed = getAllowedQuantityOptions(offer);
          return allowed.includes(sanitized) ? sanitized : allowed[0] || 1;
        }

        return limit ? Math.min(sanitized, limit) : sanitized;
      }

      function getEffectiveItemQuantity(offer, item, index) {
        if (index === 0 && isQuantitySelectorOffer(offer)) {
          return getSelectedOfferQuantity(offer);
        }

        return Number(item.quantity || 1);
      }

      function getUnitSelectionKey(item, unitIndex) {
        return `${item.id}:${unitIndex}`;
      }

      function getUnitSelection(item, unitIndex) {
        return unitSelections[getUnitSelectionKey(item, unitIndex)] || selections[item.id] || null;
      }

      function buildSelectionFromOption(option) {
        return {
          variantId: normalizeVariantId(option.value),
          title: option.textContent || "",
          priceCents: Number(option.dataset.priceCents || 0),
          image: option.dataset.variantImage || "",
        };
      }

      function getItemSubtotal(offer, item, index) {
        const quantity = getEffectiveItemQuantity(offer, item, index);
        const variants = item.product?.variants || [];

        if (item.allowVariantSelection && variants.length) {
          let subtotal = 0;
          for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
            subtotal += Number(getUnitSelection(item, unitIndex)?.priceCents || 0);
          }
          return subtotal;
        }

        return Number(selections[item.id]?.priceCents || 0) * quantity;
      }

      function getEffectiveOfferQuantity(offer) {
        return (offer?.items || []).reduce(
          (sum, item, index) => sum + getEffectiveItemQuantity(offer, item, index),
          0,
        );
      }

      function getAnchoredProductQuantity(offer) {
        if (String(bundle.bundleType || "").toUpperCase() === "VOLUME") {
          return getEffectiveOfferQuantity(offer);
        }

        const anchoredItem = offer?.items?.[0];
        return anchoredItem ? getEffectiveItemQuantity(offer, anchoredItem, 0) : 0;
      }

      function subtotalForOffer(offer, selections) {
        return (offer?.items || []).reduce(
          (sum, item, index) => sum + getItemSubtotal(offer, item, index),
          0,
        );
      }

      function getSelectedDynamicAnalyticsPayload() {
        const selectedOffer = getSelectedOffer();
        return {
          bundleType: bundle.bundleType || "CROSS_SELL",
          bundleId: bundle.id,
          offerId: selectedOffer?.id || null,
          offerPosition: selectedOffer
            ? bundle.offers.findIndex((offer) => offer.id === selectedOffer.id) + 1
            : null,
          offerQuantity: getEffectiveOfferQuantity(selectedOffer),
          metadata: {
            offerTitle: selectedOffer?.title || "Bundle",
          },
        };
      }

      function getOfferFinalCents(offer) {
        if (!offer) return 0;
        const subtotal = subtotalForOffer(offer, selections);
        const fixedAmountCents = parsePriceToCents(offer.discountValue);

        if (offer.discountType === "PERCENTAGE") {
          return subtotal - Math.round((subtotal * Number(offer.discountValue || 0)) / 100);
        }
        if (offer.discountType === "FIXED_AMOUNT") {
          return Math.max(0, subtotal - fixedAmountCents);
        }
        if (offer.discountType === "FIXED_PRICE") {
          return fixedAmountCents;
        }
        return subtotal;
      }

      function renderLockedSelectLikeMarkup(label) {
        const safeLabel = escapeHtml(label || "");

        return `
          <div class="bundle-locked-select" aria-disabled="true">
            <span class="bundle-locked-select__marquee">
              <span class="bundle-locked-select__marquee-text">${safeLabel}</span>
              <span class="bundle-locked-select__marquee-text" aria-hidden="true">${safeLabel}</span>
            </span>
          </div>
        `;
      }

      function syncLockedSelectOverflow(targetRoot) {
        targetRoot.querySelectorAll(".bundle-locked-select").forEach((node) => {
          const textNode = node.querySelector(".bundle-locked-select__marquee-text:not([aria-hidden='true'])");
          const textWidth = textNode ? textNode.scrollWidth : 0;
          const availableWidth = node.clientWidth;
          node.classList.toggle("is-overflowing", textWidth > availableWidth + 1);
        });
      }

      function renderOfferQuantitySelector(offer) {
        if (!isQuantitySelectorOffer(offer)) return "";

        const options = parseQuantityOptions(offer);
        const selectedQuantity = getSelectedOfferQuantity(offer);
        const limit = getVariantInventoryLimit(offer);

        if (options.length) {
          const allowedOptions = getAllowedQuantityOptions(offer);

          if (allowedOptions.length === 1) {
            return "";
          }

          return `
            <label class="bundle-offer-item__quantity-wrap">
              <span class="visually-hidden">Quantity</span>
              <span class="bundle-quantity-label">Quantité :</span>
              <select class="bundle-quantity-select" data-dynamic-offer-quantity-id="${escapeHtml(offer.id)}">
                ${allowedOptions.map((quantity) => `
                  <option value="${quantity}" ${quantity === selectedQuantity ? "selected" : ""}>
                    Quantity ${quantity}
                  </option>
                `).join("")}
              </select>
            </label>
          `;
        }

        return `
          <label class="bundle-offer-item__quantity-wrap">
            <span class="visually-hidden">Quantity</span>
            <span class="bundle-quantity-label">Quantité :</span>
            <input
              class="bundle-quantity-input"
              data-dynamic-offer-quantity-id="${escapeHtml(offer.id)}"
              type="number"
              min="1"
              ${limit ? `max="${limit}"` : ""}
              step="1"
              value="${selectedQuantity}"
              inputmode="numeric"
              aria-label="Quantity"
            >
          </label>
        `;
      }

      function publishDynamicBundleState() {
        const selectedOffer = getSelectedOffer();
        bundleBridge?.publish?.(root, {
          visible: root.dataset.bundleVisibility === "visible",
          priceText: selectedOffer ? formatMoney(getOfferFinalCents(selectedOffer)) : "",
          bundleTitle: selectedOffer?.title || "Bundle",
          itemCount: getEffectiveOfferQuantity(selectedOffer),
        });
      }

      async function addSelectedDynamicBundle({ checkout = false } = {}) {
        const currentOffer = getSelectedOffer();
        if (!currentOffer) return;

        const items = [];
        currentOffer.items.forEach((item, index) => {
          const quantity = getEffectiveItemQuantity(currentOffer, item, index);
          const variants = item.product?.variants || [];
          const baseProperties = {
            "_bundle_id": bundle.id,
            "_bundle_offer_id": currentOffer.id,
            "_bundle_offer_title": currentOffer.title,
            "_bundle_item_index": String(index + 1),
            "_bundle_item_label": item.label || item.product?.title || "",
          };

          if (item.allowVariantSelection && variants.length) {
            for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
              const selected = getUnitSelection(item, unitIndex);
              if (!selected?.variantId) continue;

              items.push({
                id: normalizeVariantId(selected.variantId),
                quantity: 1,
                properties: baseProperties,
              });
            }
            return;
          }

          const selected = selections[item.id];
          if (!selected?.variantId) return;

          items.push({
            id: normalizeVariantId(selected.variantId),
            quantity,
            properties: baseProperties,
          });
        });

        if (!items.length) return;

        const actionButtons = mountRoot.querySelectorAll(".bundle-add-button, .bundle-buy-now-button");
        const labels = Array.from(actionButtons).map((node) => node.textContent || "");
        actionButtons.forEach((button) => {
          button.disabled = true;
          button.textContent = button.classList.contains("bundle-buy-now-button") ? "Redirecting..." : "Adding...";
        });

        try {
          const response = await fetch("/cart/add.js", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ items }),
          });

          if (!response.ok) {
            let errorMessage = "Failed to add bundle to cart";
            try {
              const payload = await response.json();
              errorMessage = payload?.description || payload?.message || JSON.stringify(payload);
            } catch (jsonError) {
              errorMessage = `Failed to add bundle to cart (${response.status})`;
            }
            throw new Error(errorMessage);
          }

          trackAnalyticsEvent({
            ...getSelectedDynamicAnalyticsPayload(),
            eventType: checkout ? "BUY_NOW" : "ADD_TO_CART",
          });
          window.location.href = checkout ? "/checkout" : "/cart";
        } catch (error) {
          console.error(error);
          actionButtons.forEach((button, index) => {
            button.disabled = false;
            button.textContent = labels[index] || "Add to cart";
          });
          trackAnalyticsEvent({
            ...getSelectedDynamicAnalyticsPayload(),
            eventType: "ADD_TO_CART_FAILED",
            metadata: {
              ...getSelectedDynamicAnalyticsPayload().metadata,
              action: checkout ? "BUY_NOW" : "ADD_TO_CART",
              message: String(error?.message || error || ""),
            },
          });
          window.alert(getBundleAddToCartErrorMessage(error));
        }
      }

      function renderItemImageMarkup(item, selection, quantity) {
        const image = selection?.image || item.product?.featuredImage || "";
        const hasImage = item.showVariantThumbnails && image;

        return `
          <div class="bundle-offer-item__thumb-wrap ${hasImage ? "" : "bundle-offer-item__thumb-wrap--chip-only"}">
            ${hasImage ? `<img class="bundle-offer-item__image" src="${escapeHtml(image)}" alt="${escapeHtml(item.product?.title || item.label || "")}" width="44" height="44" loading="lazy">` : ""}
            <span class="bundle-offer-item__qty-chip">x${Math.max(1, Number(quantity || 1))}</span>
          </div>
        `;
      }

      function isDefaultVariantTitle(title) {
        return String(title || "").trim().toLowerCase() === "default title";
      }

      function hasOnlyDefaultVariant(item) {
        const variants = item.product?.variants || [];
        return variants.length <= 1 || variants.every((variant) => isDefaultVariantTitle(variant.title));
      }

      function getVariantDisplayLabel(item, variant) {
        const productTitle = item.product?.title || item.label || "Item";
        if (!variant) return productTitle;

        const variantTitle = isDefaultVariantTitle(variant.title) ? "" : String(variant.title || "").trim();
        const price = formatMoney(parsePriceToCents(variant.price));
        const availability = variant.availableForSale ? "" : " | Sold out";

        return `${productTitle}${variantTitle ? ` : ${variantTitle}` : ""} - ${price}${availability}`;
      }

      function renderVariantSelectMarkup(item, selected, unitIndex = null, disabled = false) {
        const variants = item.product?.variants || [];
        const availableVariants = variants.filter((variant) => variant.availableForSale);
        const selectableVariants = availableVariants.length ? availableVariants : variants;
        const unitAttribute =
          unitIndex == null ? "" : ` data-dynamic-item-unit-index="${escapeHtml(String(unitIndex))}"`;
        const selectedVariant =
          variants.find((variant) => normalizeVariantId(variant.id) === normalizeVariantId(selected?.variantId)) ||
          variants.find((variant) => variant.availableForSale) ||
          variants[0] ||
          null;
        const lockedLabel = getVariantDisplayLabel(item, selectedVariant);

        if (disabled || selectableVariants.length <= 1) {
          return `
            <div class="bundle-offer-item__select-wrap">
              ${renderLockedSelectLikeMarkup(lockedLabel)}
            </div>
          `;
        }

        return `
          <label class="bundle-offer-item__select-wrap">
            <span class="visually-hidden">${escapeHtml(item.label || item.product?.title || "Item")}</span>
            <select
              class="bundle-variant-select"
              data-dynamic-item-id="${escapeHtml(item.id)}"
              ${unitAttribute}
            >
              ${variants.map((variant) => `
                <option
                  value="${escapeHtml(normalizeVariantId(variant.id))}"
                  data-price-cents="${escapeHtml(String(parsePriceToCents(variant.price)))}"
                  data-variant-image="${escapeHtml(variant.featuredImage || item.product?.featuredImage || "")}"
                  ${selected?.variantId === normalizeVariantId(variant.id) ? "selected" : ""}
                  ${variant.availableForSale ? "" : "disabled"}
                >
                  ${escapeHtml(getVariantDisplayLabel(item, variant))}
                </option>
              `).join("")}
            </select>
          </label>
        `;
      }

      function renderOfferItemMarkup(offer, item, itemIndex) {
        const quantity = getEffectiveItemQuantity(offer, item, itemIndex);
        const variants = item.product?.variants || [];

        if (item.allowVariantSelection && variants.length) {
          const quantitySelector = itemIndex === 0 ? renderOfferQuantitySelector(offer) : "";
          const isVolumeBundle = String(bundle.bundleType || "").toUpperCase() === "VOLUME";

          if (isVolumeBundle) {
            const imageMarkup = renderItemImageMarkup(item, getUnitSelection(item, 0), quantity);
            const unitSelects = Array.from({ length: quantity }, (_, unitIndex) => {
              const selected = getUnitSelection(item, unitIndex);

              return `
                <div class="bundle-offer-item__variant-select-row">
                  ${renderVariantSelectMarkup(item, selected, unitIndex)}
                </div>
              `;
            }).join("");

            return `
              <div class="bundle-offer-item" data-dynamic-item-id="${escapeHtml(item.id)}">
                ${quantitySelector}
                <div class="bundle-offer-item__row ${imageMarkup ? "" : "bundle-offer-item__row--no-image"}">
                  ${imageMarkup}
                  <div class="bundle-offer-item__variant-stack">
                    ${unitSelects}
                  </div>
                </div>
              </div>
            `;
          }

          if (hasOnlyDefaultVariant(item)) {
            const selected = getUnitSelection(item, 0);
            const imageMarkup = renderItemImageMarkup(item, selected, quantity);

            return `
              <div class="bundle-offer-item" data-dynamic-item-id="${escapeHtml(item.id)}">
                ${quantitySelector}
                <div class="bundle-offer-item__row ${imageMarkup ? "" : "bundle-offer-item__row--no-image"}">
                  ${imageMarkup}
                  ${renderVariantSelectMarkup(item, selected, null, true)}
                </div>
              </div>
            `;
          }

          const unitRows = Array.from({ length: quantity }, (_, unitIndex) => {
            const selected = getUnitSelection(item, unitIndex);
            const imageMarkup = renderItemImageMarkup(item, selected, 1);

            return `
              <div class="bundle-offer-item__row ${imageMarkup ? "" : "bundle-offer-item__row--no-image"}">
                ${imageMarkup}
                ${renderVariantSelectMarkup(item, selected, unitIndex)}
              </div>
            `;
          }).join("");

          return `
            <div class="bundle-offer-item" data-dynamic-item-id="${escapeHtml(item.id)}">
              ${quantitySelector}
              ${unitRows}
            </div>
          `;
        }

        const selected = selections[item.id];
        const imageMarkup = renderItemImageMarkup(item, selected, quantity);
        const fixedSelectorMarkup = variants.length
          ? renderVariantSelectMarkup(item, selected, null, true)
          : `<div class="bundle-offer-item__static">${escapeHtml(item.product?.title || item.label || "Item")}</div>`;

        return `
          <div class="bundle-offer-item" data-dynamic-item-id="${escapeHtml(item.id)}">
            <div class="bundle-offer-item__row ${imageMarkup ? "" : "bundle-offer-item__row--no-image"}">
              ${imageMarkup}
              ${fixedSelectorMarkup}
              ${itemIndex === 0 ? renderOfferQuantitySelector(offer) : ""}
            </div>
          </div>
        `;
      }

      function renderVolumeDefaultOfferItemMarkup(offer) {
        const item = offer?.items?.[0];
        if (!item) return "";

        const quantity = getEffectiveOfferQuantity(offer);
        const selected = selections[item.id];
        const imageMarkup = renderItemImageMarkup(item, selected, quantity);
        const variants = item.product?.variants || [];
        const fixedSelectorMarkup = variants.length
          ? renderVariantSelectMarkup(item, selected, null, true)
          : `<div class="bundle-offer-item__static">${escapeHtml(item.product?.title || item.label || "Item")}</div>`;

        return `
          <div class="bundle-offer-item" data-dynamic-item-id="${escapeHtml(item.id)}">
            <div class="bundle-offer-item__row ${imageMarkup ? "" : "bundle-offer-item__row--no-image"}">
              ${imageMarkup}
              ${fixedSelectorMarkup}
              ${renderOfferQuantitySelector(offer)}
            </div>
          </div>
        `;
      }

      function offerMarkup(offer, index) {
        const subtotal = subtotalForOffer(offer, selections);
        const fixedAmountCents = parsePriceToCents(offer.discountValue);
        const finalCents =
          offer.discountType === "PERCENTAGE"
            ? subtotal - Math.round((subtotal * Number(offer.discountValue || 0)) / 100)
            : offer.discountType === "FIXED_AMOUNT"
              ? Math.max(0, subtotal - fixedAmountCents)
              : offer.discountType === "FIXED_PRICE"
                ? fixedAmountCents
                : subtotal;
        const isSelected = offer.id === selectedOfferId;
        const savingsCents = Math.max(0, subtotal - finalCents);
        const hasDiscount = savingsCents > 0;
        const savePrefix = String(appearance.saveBadgePrefix ?? "Save").trim();
        const saveValue =
          offer.discountType === "PERCENTAGE"
            ? `${String(offer.discountValue)}%`
            : formatMoney(savingsCents);
        const saveLabel = savePrefix ? `${savePrefix} ${saveValue}` : saveValue;
        const isVolumeDefaultOnly =
          String(bundle.bundleType || "").toUpperCase() === "VOLUME" &&
          hasOnlyDefaultVariant(offer.items?.[0] || {});
        const isCrossSellBundle = String(bundle.bundleType || "").toUpperCase() === "CROSS_SELL";
        const shouldHideMainQuantityChip = isCrossSellBundle && (offer.items || []).length > 1;

        return `
          <div class="bundle-offer ${isSelected ? "is-selected" : ""}" data-dynamic-offer-id="${escapeHtml(offer.id)}" role="button" tabindex="0" aria-pressed="${isSelected ? "true" : "false"}" style="--bundle-offer-index: ${index};">
            <div class="bundle-offer__summary">
              <div class="bundle-offer__summary-left">
                <div class="bundle-offer__thumb-wrap">
                  ${offer.items[0]?.product?.featuredImage ? `<img class="bundle-offer__thumb" src="${escapeHtml(offer.items[0].product.featuredImage)}" alt="${escapeHtml(offer.items[0].product.title)}" width="64" height="64" loading="lazy">` : ""}
                  ${shouldHideMainQuantityChip ? "" : `<span class="bundle-offer__qty-chip">x${getAnchoredProductQuantity(offer)}</span>`}
                </div>
                <div>
                  <div class="${getBestSellerTitleRowClass(appearance, offer)}">
                    <span class="bundle-offer__title">${escapeHtml(offer.title)}</span>
                    ${offer.isBestSeller ? renderBestSellerBadge(appearance, "BEST SELLER") : ""}
                  </div>
                  <div class="bundle-offer__price-row">
                    ${hasDiscount ? `<span class="bundle-offer__compare">${escapeHtml(formatMoney(subtotal))}</span>` : ""}
                    <span class="bundle-offer__price">${escapeHtml(formatMoney(finalCents))}</span>
                    ${hasDiscount ? `<span class="bundle-offer__saving">${escapeHtml(saveLabel)}</span>` : ""}
                  </div>
                  ${offer.subtitle ? `<div class="bundle-offer__subtitle">${escapeHtml(offer.subtitle)}</div>` : ""}
                </div>
              </div>
            </div>
            <div class="bundle-offer__details" ${isSelected ? "" : "hidden"}>
              ${
                isVolumeDefaultOnly
                  ? renderVolumeDefaultOfferItemMarkup(offer)
                  : offer.items.map((item, itemIndex) => renderOfferItemMarkup(offer, item, itemIndex)).join("")
              }
            </div>
          </div>
        `;
      }

      function render() {
        mountRoot.innerHTML = `
          ${createDynamicHeaderMarkup()}
          <div class="bundle-offers">
            ${displayOffers.map((offer, index) => offerMarkup(offer, index)).join("")}
          </div>
          ${createActionButtonsMarkup("dynamic")}
        `;
        applyBundleAppearance(bundle, mountRoot);

        mountRoot.querySelectorAll("[data-dynamic-offer-id]").forEach((node) => {
          const offerId = node.getAttribute("data-dynamic-offer-id");

          node.addEventListener("click", (event) => {
            if (!event.target.closest(".bundle-variant-select")) {
              selectedOfferId = offerId;
              const selectedOffer = bundle.offers.find((offer) => offer.id === offerId);
              trackAnalyticsEvent({
                bundleType: bundle.bundleType || "CROSS_SELL",
                eventType: "OFFER_SELECTED",
                bundleId: bundle.id,
                offerId,
                offerPosition: bundle.offers.findIndex((offer) => offer.id === offerId) + 1,
                offerQuantity: selectedOffer ? getEffectiveOfferQuantity(selectedOffer) : null,
              });
              render();
            }
          });

          node.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectedOfferId = offerId;
              const selectedOffer = bundle.offers.find((offer) => offer.id === offerId);
              trackAnalyticsEvent({
                bundleType: bundle.bundleType || "CROSS_SELL",
                eventType: "OFFER_SELECTED",
                bundleId: bundle.id,
                offerId,
                offerPosition: bundle.offers.findIndex((offer) => offer.id === offerId) + 1,
                offerQuantity: selectedOffer ? getEffectiveOfferQuantity(selectedOffer) : null,
              });
              render();
            }
          });
        });

        mountRoot.querySelectorAll("[data-dynamic-item-id].bundle-variant-select").forEach((select) => {
          select.addEventListener("click", (event) => {
            event.stopPropagation();
          });

          select.addEventListener("change", (event) => {
            const itemId = event.target.getAttribute("data-dynamic-item-id");
            const unitIndexRaw = event.target.getAttribute("data-dynamic-item-unit-index");
            const option = event.target.selectedOptions[0];
            if (!itemId || !option) return;

            const nextSelection = buildSelectionFromOption(option);

            if (unitIndexRaw != null) {
              unitSelections[`${itemId}:${Number(unitIndexRaw)}`] = nextSelection;
            } else {
              selections[itemId] = nextSelection;
            }

            render();
          });
        });

        mountRoot.querySelectorAll("[data-dynamic-offer-quantity-id]").forEach((input) => {
          input.addEventListener("click", (event) => {
            event.stopPropagation();
          });

          input.addEventListener("change", (event) => {
            const offerId = event.target.getAttribute("data-dynamic-offer-quantity-id");
            if (!offerId) return;

            const offer = bundle.offers.find((entry) => entry.id === offerId);
            if (!offer) return;

            quantitySelections[offerId] = getSelectedOfferQuantity({
              ...offer,
              id: offerId,
              quantityOptions: offer.quantityOptions,
            });
            const rawQuantity = Number(event.target.value || 1);
            quantitySelections[offerId] = Math.max(
              1,
              Math.floor(Number.isFinite(rawQuantity) ? rawQuantity : 1),
            );
            render();
          });
        });

        mountRoot.querySelector("[data-dynamic-add-button]")?.addEventListener("click", () => addSelectedDynamicBundle());
        mountRoot.querySelector("[data-dynamic-buy-button]")?.addEventListener("click", () => addSelectedDynamicBundle({ checkout: true }));
        syncLockedSelectOverflow(mountRoot);
        window.requestAnimationFrame?.(() => syncLockedSelectOverflow(mountRoot));
        publishDynamicBundleState();
        if (!hasTrackedDynamicImpression) {
          hasTrackedDynamicImpression = true;
          trackAnalyticsEvent({
            ...getSelectedDynamicAnalyticsPayload(),
            eventType: "BUNDLE_IMPRESSION",
          });
        }
      }

      bundleBridge?.register?.(root, {
        addSelectedBundle: () => addSelectedDynamicBundle(),
        buyNow: () => addSelectedDynamicBundle({ checkout: true }),
      });

      render();
    }

    function init() {
      startTimers();

      if (staticRoot && !staticRoot.querySelector(".bundle-action-buttons")) {
        staticRoot.insertAdjacentHTML("beforeend", createActionButtonsMarkup("static"));
      }

      if (!proxyUrl || !dynamicRoot) {
        wireStaticBundle();
        startRevealAnimation(3, themeEffectsPreset);
        clearLoadingState("active");
        return;
      }

      root.hidden = true;
      root.dataset.bundleVisibility = "hidden";
      root.style.display = "none";
      setRootTopbarVisible(true);

      fetch(proxyUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then((response) => {
          if (!response.ok) throw new Error("Bundle proxy request failed");
          return response.json();
        })
        .then((payload) => {
          const bundles = Array.isArray(payload?.bundles)
            ? payload.bundles.filter((bundle) => bundle?.offers?.length)
            : [];

          if (!bundles.length) {
            root.hidden = true;
            root.dataset.bundleVisibility = "hidden";
            root.style.display = "none";
            dynamicRoot.hidden = true;
            if (staticRoot) staticRoot.hidden = true;
            setRootTopbarVisible(true);
            clearLoadingState("empty");
            return;
          }

          setBundlePageState("active");
          root.hidden = false;
          root.dataset.bundleVisibility = "visible";
          root.style.display = "";
          dynamicRoot.hidden = false;
          if (staticRoot) staticRoot.hidden = true;
          setRootTopbarVisible(false);
          dynamicRoot.innerHTML = bundles
            .map(
              (bundle, index) => `
                <div class="bundle-dynamic-instance" data-dynamic-bundle-index="${index}" data-dynamic-bundle-id="${escapeHtml(bundle.id)}"></div>
              `,
            )
            .join("");
          startRevealAnimation(
            bundles.reduce((sum, bundle) => sum + Number(bundle.offers?.length || 0), 0) || 3,
            bundles[0]?.appearance?.effectsPreset || themeEffectsPreset || "fade in",
          );
          bundles.forEach((bundle, index) => {
            const mountRoot = dynamicRoot.querySelector(`[data-dynamic-bundle-index="${index}"]`);
            renderDynamicBundle(bundle, mountRoot);
          });
          clearLoadingState("active");
        })
        .catch((error) => {
          console.error("Dynamic bundle fallback kept:", error);
          root.hidden = true;
          root.dataset.bundleVisibility = "hidden";
          root.style.display = "none";
          bundleBridge?.publish?.(root, { visible: false, priceText: "" });
          clearLoadingState("error");
        });
    }

    init();
  }

  document.querySelectorAll(".bundle-widget").forEach((root) => initWidget(root));
})();
