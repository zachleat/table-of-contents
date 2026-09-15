# `<table-of-contents>`

A zero-dependency web component that client renders a table of contents from the headings on the page and highlights the sections currently in view.

## Installation

```sh
npm install @zachleat/table-of-contents
```

## Usage

```html
<script type="module" src="table-of-contents.js"></script>

<nav aria-labelledby="toc-title">
	<table-of-contents>
		<h2 id="toc-title">Table of Contents</h2>
	</table-of-contents>
</nav>
```

Child content is kept and the list is added after it. Wrap it in a labeled `<nav>` so assistive technology can find it. The element is hidden when no headings match.

A child `<ol>` or `<ul>` (for example, server-rendered) is used instead of generating one, and its `#` links are highlighted for headings matching `selector`.

Add `?nodefine` to skip auto-registration and define it yourself:

```js
import { TableOfContents } from "./table-of-contents.js?nodefine";

TableOfContents.define("my-toc");
```

`?nodefine` reads `import.meta.url`, so it only works with unbundled ES modules.

## Attributes

- `selector`: headings to include (default `main :is(h2, h3, h4, h5, h6)`). Headings without an `id` are listed without a link.

## Styling

No styles are included. Links for sections in view get the `toc-in-view` class.
