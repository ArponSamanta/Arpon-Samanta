import { Component } from '@theme/component';
import { CartLinesUpdateEvent } from '@shopify/events';

/** Options whose name matches this render as colour chips; the rest as dropdowns. */
const COLOUR_OPTION = /colou?r/i;

const CHEVRON =
  '<svg width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true" focusable="false"><path d="M1 1l6 6 6-6" stroke="currentColor" stroke-width="1.4"/></svg>';

let instanceCount = 0;

/**
 * @typedef {{ name: string, swatch: string | null }} OptionValue
 * @typedef {{ name: string, values: OptionValue[] }} ProductOption
 * @typedef {{ id: number, available: boolean, options: string[], price: string, image: string | null }} Variant
 * @typedef {{ title: string, url: string, description: string, image: string, imageAlt: string,
 *   options: ProductOption[], variants: Variant[] }} PopupProduct
 */

/**
 * The gift grid. Each tile's marker opens one shared popup, built from the JSON
 * the tile prints, where the shopper picks a colour and size and adds to cart.
 * The add is announced with the theme's cart event, so the cart drawer and the
 * cart count update exactly as they do for the theme's own buttons.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog
 * @property {HTMLFormElement} form
 * @property {HTMLImageElement} image
 * @property {HTMLElement} title
 * @property {HTMLElement} price
 * @property {HTMLElement} description
 * @property {HTMLElement} options
 * @property {HTMLElement} message
 * @property {HTMLButtonElement} addButton
 * @property {HTMLElement} addLabel
 *
 * @extends Component<Refs>
 */
export class GiftGridComponent extends Component {
  requiredRefs = ['dialog', 'form', 'image', 'title', 'price', 'description', 'options', 'message', 'addButton', 'addLabel'];

  /** @type {PopupProduct | null} */
  #product = null;

  /** @type {(string | null)[]} One entry per option; null until the shopper chooses. */
  #selected = [];

  /** @type {HTMLElement | null} The marker that opened the popup, for returning focus. */
  #trigger = null;

  /** @type {HTMLDialogElement | null} */
  #dialog = null;

  /** @type {HTMLFormElement | null} */
  #form = null;

  #busy = false;
  #addLabel = '';
  #idPrefix = `gift-popup-${++instanceCount}`;

  connectedCallback() {
    super.connectedCallback();

    this.#dialog = this.refs.dialog;
    this.#form = this.refs.form;
    this.#addLabel = this.refs.addLabel.textContent?.trim() ?? '';

    this.#dialog.addEventListener('click', this.#handleClick);
    this.#dialog.addEventListener('keydown', this.#handleKeydown);
    this.#dialog.addEventListener('cancel', this.#handleCancel);
    this.#dialog.addEventListener('close', this.#handleClose);
    this.#form.addEventListener('submit', this.#handleSubmit);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#dialog?.removeEventListener('click', this.#handleClick);
    this.#dialog?.removeEventListener('keydown', this.#handleKeydown);
    this.#dialog?.removeEventListener('cancel', this.#handleCancel);
    this.#dialog?.removeEventListener('close', this.#handleClose);
    this.#form?.removeEventListener('submit', this.#handleSubmit);
  }

  /* ---------- Opening and closing ---------- */

  /**
   * Opens the popup for the tile whose marker was clicked. Bound with on:click.
   * @param {Event} event
   */
  openPopup = (event) => {
    const trigger = /** @type {HTMLElement | null} */ (event.target);
    const blockId = trigger?.dataset.blockId;
    if (!trigger || !blockId || !this.#dialog) return;

    const script = this.querySelector(`script[data-gift-product="${CSS.escape(blockId)}"]`);
    if (!script) return;

    try {
      this.#product = JSON.parse(script.textContent ?? '');
    } catch (error) {
      console.error('[gift-grid] The product data for this tile could not be read.', error);
      return;
    }

    if (!this.#product) return;

    this.#trigger = trigger;
    // An option with a single value needs no choice, so it starts selected.
    this.#selected = this.#product.options.map((option) => (option.values.length === 1 ? option.values[0]?.name ?? null : null));

    this.#render();
    this.#dialog.showModal();
  };

  /** Closes the popup. Bound with on:click on the close button. */
  closePopup = () => {
    this.#dialog?.close();
  };

  #handleClose = () => {
    this.#closeLists();
    this.#setMessage('');
    this.#trigger?.focus();
  };

  /**
   * Escape closes an open size list first, and only then the popup.
   * @param {Event} event
   */
  #handleCancel = (event) => {
    if (this.#openList()) {
      event.preventDefault();
      this.#closeLists(true);
    }
  };

  /* ---------- Rendering ---------- */

  #render() {
    const product = this.#product;
    if (!product) return;

    this.refs.title.textContent = product.title;
    this.refs.description.textContent = product.description;
    this.#setMessage('');

    this.refs.options.replaceChildren(
      ...product.options.map((option, index) =>
        COLOUR_OPTION.test(option.name) ? this.#buildChips(option, index) : this.#buildSelect(option, index)
      )
    );

    this.#update();
  }

  /**
   * @param {ProductOption} option
   * @param {number} index
   */
  #buildChips(option, index) {
    const labelId = `${this.#idPrefix}-label-${index}`;
    const group = createElement('div', 'gift-popup__group');
    const label = createElement('span', 'gift-popup__label', option.name);
    label.id = labelId;

    const chips = createElement('div', 'gift-popup__chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-labelledby', labelId);
    chips.style.setProperty('--chip-count', String(Math.min(option.values.length, 3)));

    for (const value of option.values) {
      const chip = createElement('button', 'gift-popup__chip', value.name);
      chip.setAttribute('type', 'button');
      chip.setAttribute('aria-pressed', 'false');
      chip.dataset.optionIndex = String(index);
      chip.dataset.value = value.name;
      chip.style.setProperty('--chip-color', value.swatch || cssColour(value.name));
      chips.append(chip);
    }

    group.append(label, chips);
    return group;
  }

  /**
   * @param {ProductOption} option
   * @param {number} index
   */
  #buildSelect(option, index) {
    const labelId = `${this.#idPrefix}-label-${index}`;
    const valueId = `${this.#idPrefix}-value-${index}`;
    const listId = `${this.#idPrefix}-list-${index}`;

    const group = createElement('div', 'gift-popup__group');
    const label = createElement('span', 'gift-popup__label', option.name);
    label.id = labelId;

    const wrapper = createElement('div', 'gift-popup__select');

    const button = createElement('button', 'gift-popup__select-button');
    button.setAttribute('type', 'button');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', listId);
    button.setAttribute('aria-labelledby', `${labelId} ${valueId}`);
    button.dataset.optionIndex = String(index);
    button.dataset.placeholder = `Choose your ${option.name.toLowerCase()}`;

    const value = createElement('span', 'gift-popup__select-value');
    value.id = valueId;
    const chevron = createElement('span', 'gift-popup__select-chevron');
    chevron.innerHTML = CHEVRON;
    button.append(value, chevron);

    const list = createElement('ul', 'gift-popup__listbox');
    list.id = listId;
    list.hidden = true;
    list.tabIndex = -1;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', labelId);

    option.values.forEach((optionValue, valueIndex) => {
      const item = createElement('li', 'gift-popup__option', optionValue.name);
      item.id = `${listId}-${valueIndex}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.dataset.optionIndex = String(index);
      item.dataset.value = optionValue.name;
      list.append(item);
    });

    wrapper.append(button, list);
    group.append(label, wrapper);
    return group;
  }

  /** Brings every control, the price, the image and the button in line with the selection. */
  #update() {
    const product = this.#product;
    if (!product) return;

    const options = this.refs.options;

    for (const chip of options.querySelectorAll('.gift-popup__chip')) {
      if (!(chip instanceof HTMLButtonElement)) continue;
      const index = Number(chip.dataset.optionIndex);
      const value = chip.dataset.value ?? '';
      chip.setAttribute('aria-pressed', String(this.#selected[index] === value));
      chip.disabled = !this.#isReachable(index, value);
    }

    for (const item of options.querySelectorAll('.gift-popup__option')) {
      if (!(item instanceof HTMLElement)) continue;
      const index = Number(item.dataset.optionIndex);
      const value = item.dataset.value ?? '';
      item.setAttribute('aria-selected', String(this.#selected[index] === value));
      item.setAttribute('aria-disabled', String(!this.#isReachable(index, value)));
    }

    for (const button of options.querySelectorAll('.gift-popup__select-button')) {
      if (!(button instanceof HTMLElement)) continue;
      const chosen = this.#selected[Number(button.dataset.optionIndex)];
      const value = button.querySelector('.gift-popup__select-value');
      if (value) value.textContent = chosen ?? button.dataset.placeholder ?? '';
      button.toggleAttribute('data-chosen', chosen != null);
    }

    const variant = this.#currentVariant();
    const shown = variant ?? product.variants.find((candidate) => candidate.available) ?? product.variants[0];

    this.refs.price.textContent = shown?.price ?? '';

    const image = variant?.image || product.image;
    if (image) this.refs.image.src = image;
    this.refs.image.alt = product.imageAlt;

    const soldOut = variant != null && !variant.available;
    this.refs.addLabel.textContent = soldOut ? this.refs.addButton.dataset.soldOutLabel || 'Sold out' : this.#addLabel;
    this.refs.addButton.disabled = soldOut;
  }

  /* ---------- Variant logic ---------- */

  /** @returns {Variant | null} The variant matching every selected value, or null while a choice is missing. */
  #currentVariant() {
    const product = this.#product;
    if (!product || this.#selected.some((value) => value == null)) return null;

    return product.variants.find((variant) => variant.options.every((value, i) => value === this.#selected[i])) ?? null;
  }

  /**
   * Whether choosing `value` for option `index` can still lead to a variant in
   * stock, given what is already chosen for the other options.
   * @param {number} index
   * @param {string} value
   */
  #isReachable(index, value) {
    return (this.#product?.variants ?? []).some(
      (variant) =>
        variant.available &&
        variant.options[index] === value &&
        variant.options.every((other, i) => i === index || this.#selected[i] == null || this.#selected[i] === other)
    );
  }

  /**
   * @param {number} index
   * @param {string} value
   */
  #choose(index, value) {
    this.#selected[index] = value;
    this.#setMessage('');
    this.#update();
  }

  /**
   * The bonus product's variant id when the chosen variant matches the section's
   * rule (for example Black and Medium), otherwise null.
   * @param {Variant} variant
   */
  #bonusVariantId(variant) {
    const bonusId = Number(this.dataset.bonusVariantId);
    if (!bonusId || bonusId === variant.id) return null;

    const wanted = (this.dataset.bonusTrigger ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (wanted.length === 0) return null;

    const chosen = variant.options.map((value) => value.toLowerCase());
    return wanted.every((value) => chosen.includes(value)) ? bonusId : null;
  }

  /* ---------- Interaction ---------- */

  /**
   * One click handler for the whole dialog.
   * @param {MouseEvent} event
   */
  #handleClick = (event) => {
    const target = event.target;

    // The form fills the dialog, so a click landing on the dialog itself is on the backdrop.
    if (target === this.#dialog) {
      this.#dialog?.close();
      return;
    }

    if (!(target instanceof Element)) return;

    const chip = target.closest('.gift-popup__chip');
    if (chip instanceof HTMLButtonElement) {
      if (!chip.disabled) this.#choose(Number(chip.dataset.optionIndex), chip.dataset.value ?? '');
      return;
    }

    const selectButton = target.closest('.gift-popup__select-button');
    if (selectButton instanceof HTMLElement) {
      this.#toggleList(selectButton);
      return;
    }

    const option = target.closest('.gift-popup__option');
    if (option instanceof HTMLElement) {
      this.#pick(option);
      return;
    }

    if (!target.closest('.gift-popup__select')) this.#closeLists();
  };

  /**
   * Keyboard support for the size list.
   * @param {KeyboardEvent} event
   */
  #handleKeydown = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('.gift-popup__select-button') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.#toggleList(target, true);
      return;
    }

    if (!target.matches('.gift-popup__listbox')) return;

    const items = [...target.querySelectorAll('.gift-popup__option:not([aria-disabled="true"])')].filter(
      (item) => item instanceof HTMLElement
    );
    const position = items.findIndex((item) => item.hasAttribute('data-active'));

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.#setActive(target, items[Math.min(position + 1, items.length - 1)]);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#setActive(target, items[Math.max(position - 1, 0)]);
        break;
      case 'Home':
        event.preventDefault();
        this.#setActive(target, items[0]);
        break;
      case 'End':
        event.preventDefault();
        this.#setActive(target, items[items.length - 1]);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const active = items[position];
        if (active instanceof HTMLElement) this.#pick(active);
        break;
      }
      case 'Tab':
        this.#closeLists();
        break;
    }
  };

  /**
   * @param {HTMLElement} button
   * @param {boolean} [open]
   */
  #toggleList(button, open = button.getAttribute('aria-expanded') !== 'true') {
    this.#closeLists();
    if (!open) return;

    const list = this.#listFor(button);
    if (!list) return;

    button.setAttribute('aria-expanded', 'true');
    list.hidden = false;

    const start =
      list.querySelector('[aria-selected="true"]') ?? list.querySelector('.gift-popup__option:not([aria-disabled="true"])');
    if (start instanceof HTMLElement) this.#setActive(list, start);
    list.focus();
  }

  /** @param {boolean} [returnFocus] Move focus back to the list's button. */
  #closeLists(returnFocus = false) {
    const open = this.#openList();

    for (const button of this.refs.options.querySelectorAll('.gift-popup__select-button[aria-expanded="true"]')) {
      button.setAttribute('aria-expanded', 'false');
    }
    for (const list of this.refs.options.querySelectorAll('.gift-popup__listbox')) {
      if (list instanceof HTMLElement) list.hidden = true;
    }

    if (returnFocus && open) this.#buttonFor(open)?.focus();
  }

  /** @returns {HTMLElement | null} */
  #openList() {
    const list = this.refs.options?.querySelector('.gift-popup__listbox:not([hidden])');
    return list instanceof HTMLElement ? list : null;
  }

  /** @param {HTMLElement} item */
  #pick(item) {
    if (item.getAttribute('aria-disabled') === 'true') return;

    this.#choose(Number(item.dataset.optionIndex), item.dataset.value ?? '');
    const list = item.closest('.gift-popup__listbox');
    this.#closeLists();
    if (list instanceof HTMLElement) this.#buttonFor(list)?.focus();
  }

  /**
   * @param {HTMLElement} list
   * @param {Element | undefined} item
   */
  #setActive(list, item) {
    if (!(item instanceof HTMLElement)) return;

    for (const other of list.querySelectorAll('[data-active]')) other.removeAttribute('data-active');
    item.setAttribute('data-active', '');
    list.setAttribute('aria-activedescendant', item.id);
    item.scrollIntoView({ block: 'nearest' });
  }

  /** @param {HTMLElement} button */
  #listFor(button) {
    const id = button.getAttribute('aria-controls');
    const list = id ? this.refs.options.querySelector(`#${CSS.escape(id)}`) : null;
    return list instanceof HTMLElement ? list : null;
  }

  /** @param {HTMLElement} list */
  #buttonFor(list) {
    const button = this.refs.options.querySelector(`[aria-controls="${CSS.escape(list.id)}"]`);
    return button instanceof HTMLElement ? button : null;
  }

  /** @param {string} text */
  #setMessage(text) {
    if (this.refs.message) this.refs.message.textContent = text;
  }

  /* ---------- Cart ---------- */

  /** @param {SubmitEvent} event */
  #handleSubmit = async (event) => {
    event.preventDefault();

    const product = this.#product;
    if (!product || this.#busy) return;

    const missing = this.#selected.findIndex((value) => value == null);
    if (missing !== -1) {
      this.#setMessage(`Choose your ${(product.options[missing]?.name ?? 'option').toLowerCase()}`);
      const control = this.refs.options.querySelector(`[data-option-index="${missing}"]`);
      if (control instanceof HTMLElement) control.focus();
      return;
    }

    const variant = this.#currentVariant();
    if (!variant || !variant.available) {
      this.#setMessage('This combination is not available.');
      return;
    }

    /** @type {{ id: number, quantity: number }[]} */
    const items = [{ id: variant.id, quantity: 1 }];
    const bonusId = this.#bonusVariantId(variant);
    if (bonusId) items.push({ id: bonusId, quantity: 1 });

    await this.#addToCart(items);
  };

  /**
   * Adds the items in one request and tells the theme, so the cart drawer and
   * cart count refresh the same way they do after the theme's own add to cart.
   * @param {{ id: number, quantity: number }[]} items
   */
  async #addToCart(items) {
    const routes = Theme.routes;
    const sectionIds = [...document.querySelectorAll('cart-items-component')]
      .map((element) => (element instanceof HTMLElement ? element.dataset.sectionId : ''))
      .filter(Boolean);

    this.#setBusy(true);
    this.#setMessage('');

    const deferred = CartLinesUpdateEvent.createPromise();

    // Dispatched from inside the open dialog, so the cart drawer waits for the
    // popup to close before it opens.
    this.refs.form.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
        promise: deferred.promise,
      })
    );

    try {
      const response = await fetch(routes.cart_add_url ?? '/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          items,
          ...(sectionIds.length > 0 ? { sections: sectionIds.join(',') } : {}),
        }),
      });

      const result = await response.json();
      const failed = !response.ok || Boolean(result.status);

      const cartResponse = await fetch(`${routes.cart_url ?? '/cart'}.js`, { headers: { Accept: 'application/json' } });
      const cart = await cartResponse.json();

      deferred.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
        detail: {
          items: cart.items,
          sections: failed ? undefined : result.sections,
          itemCount: items.length,
          source: 'gift-grid-component',
          sourceId: this.id || 'gift-grid',
          didError: failed,
        },
      });

      if (failed) {
        this.#setMessage(result.description || result.message || 'This item could not be added to the cart.');
        return;
      }

      this.#dialog?.close();
    } catch (error) {
      console.error('[gift-grid] Add to cart failed.', error);
      deferred.reject(error);
      this.#setMessage('This item could not be added. Check your connection and try again.');
    } finally {
      this.#setBusy(false);
    }
  }

  /** @param {boolean} busy */
  #setBusy(busy) {
    this.#busy = busy;
    this.refs.addButton.setAttribute('aria-busy', String(busy));
  }
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 */
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

/**
 * Uses the value's own name as a CSS colour (Blue, Black, Light Grey) and falls
 * back to grey when the browser does not recognise it.
 * @param {string} name
 */
function cssColour(name) {
  const candidate = name.toLowerCase().replace(/\s+/g, '');
  return CSS.supports('color', candidate) ? candidate : '#cccccc';
}

if (!customElements.get('gift-grid-component')) {
  customElements.define('gift-grid-component', GiftGridComponent);
}