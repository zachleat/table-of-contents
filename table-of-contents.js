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
		this.scrollController?.abort();
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
		this.scrollController?.abort();

		let headingSet = new Set(headings);
		let targets = new Map();
		let visible = new Set();
		let bestMatch = this.hasAttribute("best-match");
		let current;
		let atBottom = false;

		let render = activeIds => {
			for(let link of this.list.querySelectorAll("a[href^='#']")) {
				let id = link.getAttribute("href").slice(1);
				link.classList.toggle(TableOfContents.defaults.activeClass, activeIds.has(id));
			}
		};

		let renderBestMatch = () => {
			// Short final sections may never reach the reading line, so the last visible one wins at the bottom of the page.
			let id = atBottom ? headings.findLast(h => h.id && TableOfContents.isVisible(h))?.id : current;
			render(new Set(id ? [id] : []));
		};

		this.observer = new IntersectionObserver(entries => {
			for(let entry of entries) {
				if(entry.isIntersecting) {
					visible.add(entry.target);
				} else {
					visible.delete(entry.target);
				}
			}

			let activeIds = new Set(Array.from(visible, el => targets.get(el)));
			if(bestMatch) {
				// Keeps the previous match while the reading line sits in a gap between elements.
				current = headings.findLast(h => activeIds.has(h.id))?.id ?? current;
				renderBestMatch();
			} else {
				render(activeIds);
			}
		// A zero-height root at 25% of the viewport acts as the reading line.
		}, bestMatch ? { rootMargin: "-25% 0px -75% 0px" } : undefined);

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

		if(bestMatch) {
			this.scrollController = new AbortController();
			let checkBottom = () => {
				let { scrollY, innerHeight } = window;
				let bottom = scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 1;
				if(bottom !== atBottom) {
					atBottom = bottom;
					renderBestMatch();
				}
			};
			let options = { passive: true, signal: this.scrollController.signal };
			window.addEventListener("scroll", checkBottom, options);
			window.addEventListener("resize", checkBottom, options);
			checkBottom();
		}
	}
}

if(!new URL(import.meta.url).searchParams.has("nodefine")) {
	TableOfContents.define();
}
