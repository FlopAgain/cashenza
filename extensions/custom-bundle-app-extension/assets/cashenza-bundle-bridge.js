(() => {
  if (window.__cashenzaBundleBridge) return;

  const stickySelector = [
    "sticky-add-to-cart",
    "sticky-add-to-cart-component",
    "[data-sticky-add-to-cart]",
    "[data-hydration-key*='sticky-add-to-cart']",
    ".sticky-add-to-cart",
    "[class*='sticky-add-to-cart']",
    "[id*='sticky-add-to-cart']",
  ].join(",");
  const widgets = new Map();
  const hiddenState = new WeakMap();
  const textState = new WeakMap();
  const placementState = new WeakMap();

  function getActiveEntry() {
    return Array.from(widgets.values()).find((entry) => entry.state?.visible) || null;
  }

  function isStickyNode(node) {
    return Boolean(node?.closest?.(stickySelector));
  }

  function hasPurchaseControls(scope, root) {
    if (!scope) return false;

    const selectors = [
      ".product-form__buttons",
      "buy-buttons",
      ".buy-buttons",
      "button[name='add']",
      ".product-form__submit",
      "variant-picker",
      "variant-selects",
      ".buy-buttons-block",
      ".product-form-buttons",
      ".quantity-selector-wrapper",
      ".accelerated-checkout-block",
      "add-to-cart-component",
      ".product-form__input",
      ".product__selectors",
      "[data-product-form-block]",
    ].join(",");

    return Array.from(scope.querySelectorAll(selectors)).some((node) => {
      if (!node || root?.contains(node) || isStickyNode(node)) return false;
      return true;
    });
  }

  function findProductScope(root) {
    const localCandidates = [
      root.closest("product-info"),
      root.closest("[data-product-info]"),
      root.closest(".product__info-container"),
      root.closest(".product__info-wrapper"),
      root.closest(".product"),
      root.parentElement,
    ].filter(Boolean);

    const globalCandidates = Array.from(
      document.querySelectorAll(
        "product-info, [data-product-info], .product__info-container, .product__info-wrapper, .product",
      ),
    );

    const candidates = [...localCandidates, ...globalCandidates];
    const uniqueCandidates = candidates.filter((node, index) => candidates.indexOf(node) === index);

    return uniqueCandidates.find((scope) => hasPurchaseControls(scope, root)) || localCandidates[0] || document.body;
  }

  function setNodeHidden(node, hidden) {
    if (!node) return;

    if (!hidden) {
      const previous = hiddenState.get(node);
      if (previous) {
        node.style.display = previous.display;
        node.hidden = previous.hidden;
        hiddenState.delete(node);
        node.removeAttribute("data-cashenza-hidden");
      }
      return;
    }

    if (!hiddenState.has(node)) {
      hiddenState.set(node, {
        display: node.style.display || "",
        hidden: Boolean(node.hidden),
      });
    }

    node.style.display = "none";
    node.hidden = true;
    node.setAttribute("data-cashenza-hidden", "true");
  }

  function rememberText(node, key, value) {
    if (!node) return;
    if (!textState.has(node)) {
      textState.set(node, {});
    }
    const state = textState.get(node);
    if (!(key in state)) {
      state[key] = value;
    }
  }

  function restoreText(node, key) {
    const state = textState.get(node);
    if (!state || !(key in state)) return null;
    return state[key];
  }

  function getDetailsContainer(root) {
    const candidates = [
      document.querySelector("[data-testid='product-information-details']"),
      document.querySelector(".product-details"),
      document.querySelector("#MainContent .product-details"),
      document.querySelector(".product-information .product-details"),
    ].filter(Boolean);

    return candidates.find((node) => hasPurchaseControls(node, root)) || null;
  }

  function getPlacementTarget(scope, root) {
    const detailsContainer = getDetailsContainer(root);
    const preferredScope = detailsContainer || scope;
    const candidates = [
      preferredScope?.querySelector(":scope > .group-block > .group-block-content"),
      preferredScope?.querySelector(":scope .group-block-content.layout-panel-flex--column"),
      preferredScope?.querySelector(":scope .group-block-content"),
      preferredScope?.querySelector(":scope .layout-panel-flex--column"),
      preferredScope?.querySelector(":scope .layout-panel-flex"),
      preferredScope,
    ].filter(Boolean);

    return candidates.find((node) => !root.contains(node)) || null;
  }

  function placeBundleWidget(entry, activeEntry) {
    const root = entry.root;
    if (!root) return;

    if (!placementState.has(root)) {
      placementState.set(root, {
        parent: root.parentNode,
        nextSibling: root.nextSibling,
      });
    }

    const original = placementState.get(root);
    const isActive = Boolean(activeEntry && activeEntry.root === root && entry.state?.visible);

    if (!isActive) {
      if (original?.parent && root.parentNode !== original.parent) {
        original.parent.insertBefore(root, original.nextSibling || null);
      }
      return;
    }

    const scope = getDetailsContainer(root) || findProductScope(root);
    const target = getPlacementTarget(scope, root);
    if (!target) {
      if (scope && scope !== root.parentNode) {
        scope.appendChild(root);
      }
      return;
    }

    if (root.parentNode !== target || root !== target.lastElementChild) {
      target.appendChild(root);
    }
  }

  function getNativeControlCandidates(scope, root) {
    const detailsContainer = getDetailsContainer(root);
    const preferredScope = detailsContainer || scope;
    const selectors = [
      "variant-picker",
      "variant-selects",
      ".buy-buttons-block",
      ".product-form-buttons",
      ".quantity-selector-wrapper",
      ".accelerated-checkout-block",
      "add-to-cart-component",
      "button[name='add']",
      "button[type='submit']",
      "input[type='submit']",
      "[name='add']",
      ".product-form__input",
      ".product-form__buttons",
      ".product-form__quantity",
      ".buy-buttons",
      ".quantity-selector",
      "quantity-selector",
      ".shopify-payment-button",
      "shopify-accelerated-checkout",
      "shopify-payment-terms",
      ".product-form__submit",
      "[data-product-form-block]",
    ].join(",");

    return Array.from(preferredScope.querySelectorAll(selectors)).filter((node) => {
      if (!node || root.contains(node) || isStickyNode(node)) return false;
      return true;
    });
  }

  function syncNativeControls(activeEntry) {
    widgets.forEach((entry) => {
      const scope = findProductScope(entry.root);
      const candidates = getNativeControlCandidates(scope, entry.root);
      const shouldHide = Boolean(activeEntry && activeEntry.root === entry.root && entry.state?.visible);
      placeBundleWidget(entry, activeEntry);
      candidates.forEach((node) => setNodeHidden(node, shouldHide));
    });
  }

  function getStickyContainers() {
    return Array.from(document.querySelectorAll(stickySelector));
  }

  function syncStickyContainers(activeEntry) {
    getStickyContainers().forEach((container) => {
      const buttons = Array.from(
        container.querySelectorAll("button, input[type='submit'], input[type='button'], .button"),
      ).filter((node) => !node.closest("[data-bundle-ignore-sticky]"));

      const priceNodes = Array.from(
        container.querySelectorAll("[class*='price'], .price, [data-price], [data-product-price]"),
      ).filter((node) => !node.closest("button"));

      if (!activeEntry || !activeEntry.state?.visible) {
        container.removeAttribute("data-cashenza-bundle-active");

        buttons.forEach((button) => {
          if (button.tagName === "INPUT") {
            const originalValue = restoreText(button, "value");
            if (originalValue != null) button.value = originalValue;
            const originalType = restoreText(button, "type");
            if (originalType != null) button.setAttribute("type", originalType);
          } else {
            const originalText = restoreText(button, "text");
            if (originalText != null) button.textContent = originalText;
            const originalType = restoreText(button, "type");
            if (originalType === null) {
              button.removeAttribute("type");
            } else if (originalType != null) {
              button.setAttribute("type", originalType);
            }
          }
        });

        priceNodes.forEach((node) => {
          const originalText = restoreText(node, "text");
          if (originalText != null) node.textContent = originalText;
        });
        return;
      }

      container.setAttribute("data-cashenza-bundle-active", "true");

        buttons.forEach((button) => {
          if (button.tagName === "INPUT") {
            rememberText(button, "value", button.value);
            rememberText(button, "type", button.getAttribute("type"));
            button.value = "Add to cart";
            button.setAttribute("type", "button");
          } else {
            rememberText(button, "text", button.textContent || "");
            rememberText(button, "type", button.getAttribute("type"));
            button.textContent = "Add to cart";
            button.setAttribute("type", "button");
          }
        });

      priceNodes.slice(0, 3).forEach((node) => {
        rememberText(node, "text", node.textContent || "");
        node.textContent = activeEntry.state.priceText || "";
      });
    });
  }

  function refresh() {
    const activeEntry = getActiveEntry();
    syncNativeControls(activeEntry);
    syncStickyContainers(activeEntry);
  }

  document.addEventListener(
    "click",
    (event) => {
      const activeEntry = getActiveEntry();
      if (!activeEntry?.state?.visible) return;
      const stickyContainer = event.target.closest(stickySelector);
      if (!stickyContainer) return;
      const actionNode = event.target.closest("button, input[type='submit'], input[type='button'], .button");
      if (!actionNode) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      activeEntry.api?.addSelectedBundle?.();
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const activeEntry = getActiveEntry();
      if (!activeEntry?.state?.visible) return;
      const stickyContainer =
        event.target.closest?.(stickySelector) ||
        event.target.querySelector?.(stickySelector);
      if (!stickyContainer) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      activeEntry.api?.addSelectedBundle?.();
    },
    true,
  );

  window.__cashenzaBundleBridge = {
    register(root, api) {
      widgets.set(root, {
        root,
        api,
        state: { visible: false, priceText: "" },
      });
      refresh();
    },
    publish(root, state) {
      const current = widgets.get(root) || { root, api: {}, state: {} };
      widgets.set(root, {
        ...current,
        state: {
          ...(current.state || {}),
          ...(state || {}),
        },
      });
      refresh();
    },
    unregister(root) {
      widgets.delete(root);
      refresh();
    },
  };
})();
