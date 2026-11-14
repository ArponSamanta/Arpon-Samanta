import { Component } from '@theme/component';

/**
 * The gift header. On mobile the tagline and button sit in a panel behind a
 * menu toggle; on desktop the panel is always visible and the toggle is hidden.
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement} toggle - The menu button.
 * @property {HTMLElement} panel - The collapsible panel.
 *
 * @extends Component<Refs>
 */
export class GiftHeaderComponent extends Component {
  requiredRefs = ['toggle', 'panel'];

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('keydown', this.#handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this.#handleKeydown);
  }

  /** Opens or closes the mobile panel. */
  toggleMenu = () => {
    this.#setOpen(!this.hasAttribute('data-open'));
  };

  /**
   * @param {boolean} open
   */
  #setOpen(open) {
    this.toggleAttribute('data-open', open);
    this.refs.toggle.setAttribute('aria-expanded', String(open));
  }

  /**
   * Closes the panel on Escape and hands focus back to the toggle.
   * @param {KeyboardEvent} event
   */
  #handleKeydown = (event) => {
    if (event.key !== 'Escape' || !this.hasAttribute('data-open')) return;

    this.#setOpen(false);
    this.refs.toggle.focus();
  };
}

if (!customElements.get('gift-header-component')) {
  customElements.define('gift-header-component', GiftHeaderComponent);
}