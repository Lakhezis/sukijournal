import { formattedSegments } from "./formatting.js";

// El textarea conserva selección, teclado e IME; la capa visual muestra sus marcas.
export function createTextView(input) {
  const node = document.createElement("div");
  node.className = "formatted-text";
  node.setAttribute("aria-hidden", "true");
  const content = document.createElement("div");
  content.className = "formatted-text-content";
  node.append(content);
  function sync() {
    content.style.width = `${input.clientWidth}px`;
    content.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  }
  input.addEventListener("scroll", sync);
  const observer = new ResizeObserver(sync);
  observer.observe(input);
  let signature = null;
  return { node, destroy: () => observer.disconnect(),
    render(element) {
      const next = JSON.stringify([element.text, element.marks]);
      if (signature !== next) {
        signature = next;
        const formatted = Boolean(element.marks?.length);
        node.hidden = !formatted;
        input.classList.toggle("has-format", formatted);
        content.replaceChildren();
        for (const segment of formattedSegments(element.text, element.marks)) {
          const span = document.createElement("span");
          span.textContent = segment.text;
          if (segment.underline) span.classList.add("is-underlined");
          if (segment.highlight) {
            span.classList.add("is-highlighted");
            span.dataset.highlightColor = segment.highlightColor;
          }
          content.append(span);
        }
        // Una línea final vacía debe ocupar el mismo espacio que en el campo.
        if (element.text.endsWith("\n")) content.append(document.createTextNode("\u200b"));
      }
      sync();
    },
  };
}
