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

	static generate(headings) {
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
	}

	init() {
		if(!this.isConnected) {
			return;
		}

		let selector = this.getAttribute("selector") || TableOfContents.defaults.selector;
		let headings = Array.from(document.querySelectorAll(selector)).filter(h => !this.contains(h));

		this.observer?.disconnect();
		this.generatedList?.remove();
		this.generatedList = undefined;

		// A child list (e.g. server-rendered) is used as-is.
		this.list = this.querySelector(":scope > :is(ol, ul)");

		// Hide when empty, without overriding an author-set `hidden`.
		let empty = !this.list && headings.length === 0;
		if(this.hiddenWhenEmpty) {
			this.hidden = false;
		}
		this.hiddenWhenEmpty = empty && !this.hidden;
		if(empty) {
			this.hidden = true;
			return;
		}

		// Existing child content is kept before the generated list.
		if(!this.list) {
			this.list = this.generatedList = TableOfContents.generate(headings);
			this.append(this.list);
		}

		this.observe(headings);
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
