# Changelog

## v1.1.1

### Fixes

- **Light theme compatibility** — Custom CSS with a light background no longer breaks the dashboard. All widget and service text now inherits its color from the page theme instead of using hardcoded light values. Secondary text uses opacity for hierarchy, so it adapts correctly to both dark and light themes.
- **Config panel visibility** — The configuration panel is now fully protected from custom CSS: styles are suspended while the panel is open, preventing white-on-white rendering issues.
- **Widget text colors** — Clock, weather, countdown, bookmarks, text widget, image captions, separator labels, and integration widgets all use `color: inherit` so they remain readable on any background.

### UI

- **Column toggle** — The two separate "1 col" / "2 col" buttons in config mode are replaced by a single toggle button with a grid icon, consistent with the button on the home view.
- **Lock page button** — The lock page button is now grouped next to the column toggle in the config header instead of being isolated on the right side.

---

## v1.1.0

### New features

**Rich layout options**

The service configuration panel now includes a full set of layout controls: adjust icon size, choose between list and grid layouts, set the number of columns per category, and reorder everything inline with drag handles.

![Better layout options](assets/better%20layout%20options.png)

---

**PIN-protected pages**

Lock any page behind a numeric PIN. When a PIN is set, a lock icon appears next to the page tab. Visitors see a PIN pad overlay before accessing the page content.

![PIN lock](assets/pin.png)

---

**Custom CSS per page**

Each page now has a dedicated CSS field. Write any valid CSS and it is applied instantly - override fonts, colors, spacing, or completely retheme the dashboard to match your style.

![Custom CSS](assets/custom%20css.png)

---

### Improvements

- **Text color control** - Choose a custom text color per page to match your wallpaper or CSS theme
- **Config panel polish** - Smoother transitions, better button placement, and clearer section separators

---

## v1.0.0

Initial public release.
