import { Component } from '@theme/component';

/**
 * A grid tile with a hotspot marker that opens the theme's quick-add modal.
 *
 * The marker is the only visible trigger. The quick-add component is rendered
 * inside the tile but hidden, so its variant resolution, swatches and
 * add-to-cart form are reused rather than reimplemented.
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement} trigger - The marker button.
 *
 * @extends Component<Refs>
 */
export class GiftGridItemComponent extends Component {
  requiredRefs = ['trigger'];

    /**
   * Opens the quick-add modal for this tile's product.
   * @param {Event} event
   */
  openQuickAdd = (event) => {
    event.preventDefault();

    const quickAdd = /** @type {import('./quick-add').QuickAddComponent | null} */ (
      this.querySelector('quick-add-component')
    );

    if (!quickAdd) return;

    // quick-add only finds its product URL inside a product card or a hotspot.
    // Give this instance the tile's URL so it fetches the right product.
    Object.defineProperty(quickAdd, 'productPageUrl', {
      configurable: true,
      get: () => this.dataset.productUrl ?? '',
    });

    quickAdd.handleClick(new MouseEvent('click', { cancelable: true }));
  };
}