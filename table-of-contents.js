export class TableOfContents extends HTMLElement {
	static tagName = "table-of-contents";

	static defaults = {
		selector: "main :is(h2, h3, h4, h5, h6)",
		activeClass: "toc-in-view",
	};

	static define(tagName = this.tagName, registry = globalThis.customElements) {
		if(registry && !registry.get(tagName)) {
			registry.define(tagName, this);
		}
	}

	static getLevel(heading) {
		return parseInt(heading.tagName.slice(1), 10);
	}

	// Ignores same-page anchor links and hidden decorations inside headings.
	static getText(heading) {
		let clone = heading.cloneNode(true);
		for(let el of clone.querySelectorAll("a[href^='#'], button, script, style, template, [hidden], [aria-hidden='true']")) {
			el.remove();
		}
		let text = clone.textContent.trim() || heading.textContent.trim();
		return text.replace(/\s+/g, " ");
	}

	static isVisible(heading) {
		return heading.checkVisibility?.() ?? true;
	}

	// `items` (optional) receives each generated <li> mapped to its heading.
	static generate(headings, items) {
		let root = document.createElement("ol");
		let stack = [{ level: this.getLevel(headings[0]), list: root }];
		for(let heading of headings) {
			let level = this.getLevel(heading);
			let top = stack.at(-1);
			let popped;

			while(stack.length > 1 && level < top.level) {
				popped = stack.pop();
				top = stack.at(-1);
			}

			if(stack.length === 1 && level < top.level) {
				top.level = level;
			} else if(level > top.level) {
				if(popped) {
					popped.level = level;
				} else {
					popped = { level, list: document.createElement("ol") };
					top.item.append(popped.list);
				}
				stack.push(popped);
				top = popped;
			}

			let text = this.getText(heading);
			top.item = document.createElement("li");

			if(heading.id) {
				let link = document.createElement("a");
				link.setAttribute("href", `#${heading.id}`);
				link.textContent = text;
				top.item.append(link);
			} else {
				top.item.append(text);
			}

			top.list.append(top.item);
			items?.set(top.item, heading);
		}

		return root;
	}

	connectedCallback() {
		if(document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
		} else {
			this.init();
		}
	}

	disconnectedCallback() {
		this.observer?.disconnect();
		this.resizeObserver?.disconnect();
	}

	// Hides the element without overriding an author-set `hidden`.
	setAutoHidden(force) {
		if(this.autoHidden) {
			this.hidden = false;
		}
		this.autoHidden = force && !this.hidden;
		if(force) {
			this.hidden = true;
		}
	}

	init() {
		if(!this.isConnected) {
			return;
		}

		let selector = this.getAttribute("selector") || TableOfContents.defaults.selector;
		let headings = Array.from(document.querySelectorAll(selector)).filter(h => !this.contains(h));

		this.observer?.disconnect();
		this.resizeObserver?.disconnect();
		this.generatedList?.remove();
		this.generatedList = undefined;

		// A child list (e.g. server-rendered) is used as-is.
		this.list = this.querySelector(":scope > :is(ol, ul)");

		let empty = !this.list && headings.length === 0;
		this.setAutoHidden(empty);
		if(empty) {
			return;
		}

		let items = new Map();
		if(this.list) {
			for(let heading of headings) {
				if(heading.id) {
					for(let link of this.list.querySelectorAll(`a[href="#${CSS.escape(heading.id)}"]`)) {
						items.set(link.closest("li"), heading);
					}
				}
			}
			items.delete(null);
		} else {
			// Existing child content is kept before the generated list.
			this.list = this.generatedList = TableOfContents.generate(headings, items);
			this.append(this.list);
		}

		this.observe(headings);
		this.observeVisibility(headings, items);
	}

	// Hides entries for headings hidden by CSS (e.g. `display: none` on an ancestor).
	observeVisibility(headings, items) {
		let update = () => {
			let visible = new Map(headings.map(h => [h, TableOfContents.isVisible(h)]));

			// Reverse order so nested entries are updated before their parents.
			for(let li of Array.from(this.list.querySelectorAll("li")).reverse()) {
				let heading = items.get(li);
				if(heading) {
					li.hidden = !visible.get(heading) && !li.querySelector("li:not([hidden])");
				}
			}

			this.setAutoHidden(headings.length > 0 && !headings.some(h => visible.get(h)));
		};

		update();

		this.resizeObserver = new ResizeObserver(update);
		for(let heading of headings) {
			this.resizeObserver.observe(heading);
		}
	}

	// A heading is active while it or any content before the next heading is visible.
	observe(headings) {
		this.observer?.disconnect();

		let headingSet = new Set(headings);
		let targets = new Map();
		let visible = new Set();

		this.observer = new IntersectionObserver(entries => {
			for(let entry of entries) {
				visible[entry.isIntersecting ? "add" : "delete"](entry.target);
			}

			let activeIds = new Set(Array.from(visible, el => targets.get(el)));
			for(let link of this.list.querySelectorAll("a[href^='#']")) {
				let id = link.getAttribute("href").slice(1);
				link.classList.toggle(TableOfContents.defaults.activeClass, activeIds.has(id));
			}
		});

		for(let heading of headings) {
			if(!heading.id) {
				continue;
			}

			let el = heading;
			do {
				targets.set(el, heading.id);
				this.observer.observe(el);
			} while((el = el.nextElementSibling) && !headingSet.has(el));
		}
	}
}

if(!new URL(import.meta.url).searchParams.has("nodefine")) {
	TableOfContents.define();
}
