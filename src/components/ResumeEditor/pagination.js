import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// US Letter at the browser's 96px per inch, with the 0.5in margins of @page (src/index.css).
// The Tailwind tokens w-page, h-page, w-page-content and p-page-margin are the same sizes.
export const PAGE_WIDTH = 8.5 * 96;
export const PAGE_HEIGHT = 11 * 96;
export const PAGE_MARGIN = 0.5 * 96;
export const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - 2 * PAGE_MARGIN;
// Grey gap between sheets on screen (sp16).
export const PAGE_GAP = 16;

/**
 * The blocks a printed page can break between, in document order: every top-level block (name,
 * paragraph, section heading, entry line), with bullet lists opened up into their bullets. Works on
 * the printed HTML (a container of editor.getHTML()) and lines up one-to-one with atomPositions().
 */
export function atomElements(container) {
  const atoms = [];
  for (const el of container.children) {
    if (el.tagName === "UL") atoms.push(...[...el.children].filter((c) => c.tagName === "LI"));
    else atoms.push(el);
  }
  return atoms;
}

/** Editor positions of the same blocks (just before each node), in the same order. */
export function atomPositions(doc) {
  const positions = [];
  doc.forEach((node, offset) => {
    if (node.type.name === "bulletList") node.forEach((_, liOffset) => positions.push(offset + 1 + liOffset));
    else positions.push(offset);
  });
  return positions;
}

// The print rules (src/index.css): blocks never split (break-inside: avoid), and section and entry
// headings (h2, h3) stay with the block after them (break-after: avoid).
function keepsWithNext(atom) {
  return atom.tag === "H2" || atom.tag === "H3";
}

/**
 * Where the printed pages break, replaying the print rules on the blocks' laid-out boxes
 * (`top` and `bottom` in px, as laid out at the printed content width, plus `tag`).
 * Returns { breaks: indexes of the blocks that start pages 2, 3…, pageCount }.
 *
 * A block that would cross the bottom of the page moves to the next page whole. If the block
 * before it is a heading, the heading moves too (and a heading before that, and so on), unless that
 * would leave the page empty, in which case the browser breaks anyway and so does this. A block
 * taller than a whole page can't be kept whole; it starts a page and runs over, as in print. At an
 * unforced break the browser drops the margin above the page's first block, so each page measures
 * from its first block's top edge.
 */
export function paginate(atoms) {
  const breaks = [];
  let first = 0;
  let pageTop = atoms[0]?.top ?? 0;
  for (let i = 0; i < atoms.length; i++) {
    if (atoms[i].bottom - pageTop <= PAGE_CONTENT_HEIGHT || i === first) continue;
    let k = i;
    while (k - 1 > first && keepsWithNext(atoms[k - 1])) k--;
    if (k - 1 === first && keepsWithNext(atoms[first])) k = i;
    breaks.push(k);
    first = k;
    pageTop = atoms[k].top;
    i = k;
  }
  return { breaks, pageCount: breaks.length + 1 };
}

export const paginationKey = new PluginKey("resumePagination");

function spacer(height) {
  const el = document.createElement("div");
  el.className = "resume-page-spacer";
  el.setAttribute("contenteditable", "false");
  el.setAttribute("aria-hidden", "true");
  // The one value only known at run time: how far to push the next block down to the next sheet.
  el.style.height = `${height}px`;
  return el;
}

/**
 * On-screen page breaks: spacer widgets before the blocks that start pages 2, 3…, so they land on
 * the next sheet. Decorations only: never part of the document, getHTML() or the printed PDF.
 * Set with `tr.setMeta(paginationKey, [{ pos, height }])`; between updates they follow edits.
 */
export const Pagination = Extension.create({
  name: "resumePagination",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const spacers = tr.getMeta(paginationKey);
            if (spacers) {
              return DecorationSet.create(
                tr.doc,
                spacers.map(({ pos, height }) =>
                  Decoration.widget(pos, () => spacer(height), {
                    side: -1,
                    ignoreSelection: true,
                    key: `page-break-${pos}-${Math.round(height * 10)}`,
                  })
                )
              );
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state),
        },
      }),
    ];
  },
});
