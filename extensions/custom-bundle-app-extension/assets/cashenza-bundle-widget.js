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
        labelNode.textContent = timer.dataset.expiredLabel || "Offer expired";
      }
      valueNode.textContent = "00:00:00";
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (labelNode) {
      labelNode.textContent = timer.dataset.prefix || "Offer ends in";
    }

    valueNode.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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

  function initWidget(root) {
    if (!root || root.dataset.bundleWidgetReady === "true") return;
    root.dataset.bundleWidgetReady = "true";

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
    const themeEffectsPreset = config.themeEffectsPreset || "none";
    const themeTimerPreset = config.themeTimerPreset || "soft";
    const bundleBridge = window.__cashenzaBundleBridge;
    const dynamicRoot = root.querySelector(".bundle-dynamic-root");
    const staticRoot = root.querySelector("[data-static-root]");
    const loadingContainer =
      root.closest(".product-information") ||
      root.closest(".product-details") ||
      document.querySelector(".product-information") ||
      document.querySelector(".product-details");

    function clearLoadingState() {
      loadingContainer?.classList?.remove("cashenza-bundle-loading");
    }

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
      const timers = root.querySelectorAll("[data-bundle-timer]");
      if (!timers.length) return;
      window.setInterval(() => {
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
        appearance.bestSellerBadgePreset || themeBadgeAppearance.bestSellerBadgePreset;
      appearance.bestSellerPngBadgePreset =
        appearance.bestSellerPngBadgePreset || themeBadgeAppearance.bestSellerPngBadgePreset;
      appearance.bestSellerBadgeColor =
        appearance.bestSellerBadgeColor || themeBadgeAppearance.bestSellerBadgeColor;
      appearance.bestSellerBadgeText =
        appearance.bestSellerBadgeText || themeBadgeAppearance.bestSellerBadgeText;
      appearance.saveBadgeColor =
        appearance.saveBadgeColor || themeBadgeAppearance.saveBadgeColor;
      appearance.saveBadgeText =
        appearance.saveBadgeText || themeBadgeAppearance.saveBadgeText;
      appearance.saveBadgePrefix =
        appearance.saveBadgePrefix || themeBadgeAppearance.saveBadgePrefix;
      appearance.timerPreset = appearance.timerPreset || themeTimerPreset || "soft";

      return appearance;
    }

    function getTimerPresetTheme(appearance) {
      const preset = ["soft", "cards", "outline"].includes(String(appearance?.timerPreset || ""))
        ? String(appearance.timerPreset)
        : "soft";
      const timerBg = appearance?.timerBackgroundColor || "#1a2118";
      const timerText = appearance?.timerTextColor || "#ffffff";
      const timerPrefix = appearance?.timerPrefix || "Offer ends in";
      const timerExpiredText = appearance?.timerExpiredText || "Offer expired";

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
      const pngAsset = bestSellerPngAssets[pngPreset] || "";

      if (pngPreset !== "none" && pngAsset) {
        return `<img class="bundle-offer__pill-image bundle-offer__pill-image--${escapeHtml(pngPreset)}" src="${escapeHtml(pngAsset)}" alt="${badgeText}" width="96" height="96" loading="lazy">`;
      }

      const cssPreset = escapeHtml(appearance?.bestSellerBadgePreset || "pill");
        return `<span class="bundle-offer__pill bundle-offer__pill--${cssPreset}">${badgeText}</span>`;
    }

    function getBestSellerTitleRowClass(appearance, offer) {
      const pngPreset = String(appearance?.bestSellerPngBadgePreset || "none");
      const hasPngBadge = Boolean(offer?.isBestSeller && pngPreset !== "none" && bestSellerPngAssets[pngPreset]);
      return hasPngBadge ? "bundle-offer__title-row bundle-offer__title-row--has-png" : "bundle-offer__title-row";
    }

    function applyBundleAppearance(bundle) {
      const appearance = getEffectiveAppearance(bundle);
      const preset = appearance.designPreset || "soft";

      root.className = root.className.replace(/bundle-widget--[a-z0-9_-]+/gi, "").trim();
      root.classList.add("bundle-widget");
      root.classList.add(`bundle-widget--${preset}`);

      root.style.setProperty("--bundle-accent-base", appearance.primaryColor || "#8db28a");
      root.style.setProperty("--bundle-text", appearance.textColor || "#1a2118");
      root.style.setProperty("--bundle-bg", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 20%, white)`);
      root.style.setProperty("--bundle-bg-selected", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 30%, white)`);
      root.style.setProperty("--bundle-border", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 22%, white)`);
      root.style.setProperty("--bundle-input", `color-mix(in srgb, ${appearance.primaryColor || "#8db28a"} 42%, white)`);
      root.style.setProperty("--bundle-heading-size", `${appearance.headingSize ?? 28}px`);
      root.style.setProperty("--bundle-subheading-size", `${appearance.subheadingSize ?? 16}px`);
      root.style.setProperty("--bundle-offer-title-size", `${appearance.offerTitleSize ?? 22}px`);
      root.style.setProperty("--bundle-offer-price-size", `${appearance.offerPriceSize ?? 24}px`);
      root.style.setProperty("--bundle-card-gap", `${appearance.cardGap ?? 12}px`);
      root.style.setProperty("--bundle-card-padding", `${appearance.cardPadding ?? 18}px`);
      root.style.setProperty("--bundle-card-radius", `${appearance.offerRadius ?? 24}px`);
      root.style.setProperty("--bundle-bestseller-bg", appearance.bestSellerBadgeColor || "#ffffff");
      root.style.setProperty("--bundle-bestseller-text", appearance.bestSellerBadgeText || "#1a2118");
      root.style.setProperty("--bundle-save-bg", appearance.saveBadgeColor || "#f1c500");
      root.style.setProperty("--bundle-save-text", appearance.saveBadgeText || "#1a2118");

      const timerTheme = getTimerPresetTheme(appearance);
      root.style.setProperty("--bundle-timer-bg", timerTheme.background);
      root.style.setProperty("--bundle-timer-text", timerTheme.text);
      root.style.setProperty("--bundle-timer-border", timerTheme.border);
      root.style.setProperty("--bundle-timer-label-color", timerTheme.labelColor);
      root.style.setProperty("--bundle-timer-value-color", timerTheme.valueColor);

      const eyebrowNode = root.querySelector(".bundle-widget__eyebrow");
      const headingNode = root.querySelector(".bundle-widget__title");
      const subheadingNode = root.querySelector(".bundle-widget__subheading");
      if (eyebrowNode && typeof appearance.eyebrow === "string") eyebrowNode.textContent = appearance.eyebrow;
      if (headingNode && typeof appearance.heading === "string") headingNode.textContent = appearance.heading;
      if (subheadingNode && typeof appearance.subheading === "string") subheadingNode.textContent = appearance.subheading;

      const timerNode = root.querySelector("[data-bundle-timer]");
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
          };
        });
      });

      return selections;
    }

      function subtotalForOffer(offer, selections) {
        return offer.items.reduce(
          (sum, item) =>
            sum + Number(selections[item.id]?.priceCents || 0) * Number(item.quantity || 1),
          0,
        );
      }

    function renderDynamicBundle(bundle) {
      if (!dynamicRoot) return;

      const appearance = getEffectiveAppearance(bundle);
      applyBundleAppearance(bundle);
      const selections = buildInitialSelections(bundle);
      let selectedOfferId = bundle.bestSellerOfferId || bundle.offers[0]?.id || null;
      let hasTrackedDynamicImpression = false;

      function getSelectedOffer() {
        return bundle.offers.find((offer) => offer.id === selectedOfferId) || bundle.offers[0] || null;
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
          offerQuantity: Number(selectedOffer?.quantity || 0),
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

      function publishDynamicBundleState() {
        const selectedOffer = getSelectedOffer();
        bundleBridge?.publish?.(root, {
          visible: root.dataset.bundleVisibility === "visible",
          priceText: selectedOffer ? formatMoney(getOfferFinalCents(selectedOffer)) : "",
          bundleTitle: selectedOffer?.title || "Bundle",
          itemCount: Number(selectedOffer?.quantity || 0),
        });
      }

      async function addSelectedDynamicBundle({ checkout = false } = {}) {
        const currentOffer = getSelectedOffer();
        if (!currentOffer) return;

        const items = currentOffer.items
          .map((item, index) => {
            const selected = selections[item.id];
            if (!selected?.variantId) return null;

            return {
              id: normalizeVariantId(selected.variantId),
              quantity: Number(item.quantity || 1),
              properties: {
                "_bundle_id": bundle.id,
                "_bundle_offer_id": currentOffer.id,
                "_bundle_offer_title": currentOffer.title,
                "_bundle_item_index": String(index + 1),
                "_bundle_item_label": item.label || item.product?.title || "",
              },
            };
          })
          .filter(Boolean);

        if (!items.length) return;

        const actionButtons = dynamicRoot.querySelectorAll(".bundle-add-button, .bundle-buy-now-button");
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
        const saveLabel =
          offer.discountType === "PERCENTAGE"
            ? `${appearance.saveBadgePrefix || "Save"} ${String(offer.discountValue)}%`
            : `${appearance.saveBadgePrefix || "Save"} ${formatMoney(savingsCents)}`;

        return `
          <div class="bundle-offer ${isSelected ? "is-selected" : ""}" data-dynamic-offer-id="${escapeHtml(offer.id)}" role="button" tabindex="0" aria-pressed="${isSelected ? "true" : "false"}" style="--bundle-offer-index: ${index};">
            <div class="bundle-offer__summary">
              <div class="bundle-offer__summary-left">
                <div class="bundle-offer__thumb-wrap">
                  ${offer.items[0]?.product?.featuredImage ? `<img class="bundle-offer__thumb" src="${escapeHtml(offer.items[0].product.featuredImage)}" alt="${escapeHtml(offer.items[0].product.title)}" width="64" height="64" loading="lazy">` : ""}
                  <span class="bundle-offer__qty-chip">x${offer.quantity}</span>
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
              ${offer.items.map((item) => {
                const selected = selections[item.id];
                const variants = item.product?.variants || [];
                const image = item.product?.featuredImage || "";

                return `
                  <div class="bundle-offer-item" data-dynamic-item-id="${escapeHtml(item.id)}">
                    <div class="bundle-offer-item__row">
                      ${image ? `<img class="bundle-offer-item__image" src="${escapeHtml(image)}" alt="${escapeHtml(item.product?.title || item.label || "")}" width="44" height="44" loading="lazy">` : ""}
                      ${
                        item.allowVariantSelection && variants.length
                          ? `
                            <label class="bundle-offer-item__select-wrap">
                              <span class="visually-hidden">${escapeHtml(item.label || item.product?.title || "Item")}</span>
                              <select class="bundle-variant-select" data-dynamic-item-id="${escapeHtml(item.id)}">
                                ${variants.map((variant) => `
                                  <option
                                    value="${escapeHtml(normalizeVariantId(variant.id))}"
                                    data-price-cents="${escapeHtml(String(parsePriceToCents(variant.price)))}"
                                    ${selected?.variantId === normalizeVariantId(variant.id) ? "selected" : ""}
                                    ${variant.availableForSale ? "" : "disabled"}
                                  >
                                    ${escapeHtml(item.product?.title || item.label || "Item")} : ${escapeHtml(variant.title)} - ${escapeHtml(formatMoney(parsePriceToCents(variant.price)))}${variant.availableForSale ? "" : " | Sold out"}
                                  </option>
                                `).join("")}
                              </select>
                            </label>
                          `
                          : `<div class="bundle-offer-item__static">${escapeHtml(item.product?.title || item.label || "Item")}</div>`
                      }
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }

      function render() {
        dynamicRoot.innerHTML = `
          <div class="bundle-offers">
            ${bundle.offers.map((offer, index) => offerMarkup(offer, index)).join("")}
          </div>
          ${createActionButtonsMarkup("dynamic")}
        `;

        dynamicRoot.querySelectorAll("[data-dynamic-offer-id]").forEach((node) => {
          const offerId = node.getAttribute("data-dynamic-offer-id");

          node.addEventListener("click", (event) => {
            if (!event.target.closest(".bundle-variant-select")) {
              selectedOfferId = offerId;
              trackAnalyticsEvent({
                bundleType: bundle.bundleType || "CROSS_SELL",
                eventType: "OFFER_SELECTED",
                bundleId: bundle.id,
                offerId,
                offerPosition: bundle.offers.findIndex((offer) => offer.id === offerId) + 1,
                offerQuantity: bundle.offers.find((offer) => offer.id === offerId)?.quantity || null,
              });
              render();
            }
          });

          node.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectedOfferId = offerId;
              trackAnalyticsEvent({
                bundleType: bundle.bundleType || "CROSS_SELL",
                eventType: "OFFER_SELECTED",
                bundleId: bundle.id,
                offerId,
                offerPosition: bundle.offers.findIndex((offer) => offer.id === offerId) + 1,
                offerQuantity: bundle.offers.find((offer) => offer.id === offerId)?.quantity || null,
              });
              render();
            }
          });
        });

        dynamicRoot.querySelectorAll("[data-dynamic-item-id].bundle-variant-select").forEach((select) => {
          select.addEventListener("change", (event) => {
            const itemId = event.target.getAttribute("data-dynamic-item-id");
            const option = event.target.selectedOptions[0];
            if (!itemId || !option) return;

            selections[itemId] = {
              variantId: normalizeVariantId(option.value),
              title: option.textContent || "",
              priceCents: Number(option.dataset.priceCents || 0),
            };

            render();
          });
        });

        dynamicRoot.querySelector("[data-dynamic-add-button]")?.addEventListener("click", () => addSelectedDynamicBundle());
        dynamicRoot.querySelector("[data-dynamic-buy-button]")?.addEventListener("click", () => addSelectedDynamicBundle({ checkout: true }));
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
        clearLoadingState();
        return;
      }

      root.hidden = true;
      root.dataset.bundleVisibility = "hidden";
      root.style.display = "none";

      fetch(proxyUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then((response) => {
          if (!response.ok) throw new Error("Bundle proxy request failed");
          return response.json();
        })
        .then((payload) => {
          const bundle = payload?.bundles?.[0];
          if (!bundle?.offers?.length) {
            root.hidden = true;
            root.dataset.bundleVisibility = "hidden";
            root.style.display = "none";
            dynamicRoot.hidden = true;
            if (staticRoot) staticRoot.hidden = true;
            clearLoadingState();
            return;
          }

          root.hidden = false;
          root.dataset.bundleVisibility = "visible";
          root.style.display = "";
          dynamicRoot.hidden = false;
          if (staticRoot) staticRoot.hidden = true;
          startRevealAnimation(
            bundle.offers.length || 3,
            bundle?.appearance?.effectsPreset || themeEffectsPreset || "none",
          );
          renderDynamicBundle(bundle);
          clearLoadingState();
        })
        .catch((error) => {
          console.error("Dynamic bundle fallback kept:", error);
          root.hidden = true;
          root.dataset.bundleVisibility = "hidden";
          root.style.display = "none";
          bundleBridge?.publish?.(root, { visible: false, priceText: "" });
          clearLoadingState();
        });
    }

    init();
  }

  document.querySelectorAll(".bundle-widget").forEach((root) => initWidget(root));
})();
