import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useEditorState } from "@tiptap/react";
import Select from "../Select/Select";
import Button from "../Button/Button";
import LinkPopover from "./LinkPopover";
import { LINE_SPACING_OPTIONS } from "./extensions";
import { primitiveColors } from "../../tokens/colors";
import { BODY_FONT_SIZE, FONTS, MAX_FONT_SIZE, MIN_FONT_SIZE, NAME_FONT_SIZE, fontNameFor, toPoints } from "./fonts";
import arrowDownDisabled from "../../assets/resume-assistant/toolbar-arrow-down.svg";
import minusDisabled from "../../assets/resume-assistant/toolbar-minus.svg";
import plusDisabled from "../../assets/resume-assistant/toolbar-plus.svg";
import boldDisabled from "../../assets/resume-assistant/toolbar-bold.svg";
import underlineDisabled from "../../assets/resume-assistant/toolbar-underline.svg";
import linkDisabled from "../../assets/resume-assistant/toolbar-link.svg";
import textColorDisabled from "../../assets/resume-assistant/toolbar-text-color.svg";
import lineHeightDisabled from "../../assets/resume-assistant/toolbar-line-height.svg";
import formatDisabled from "../../assets/resume-assistant/toolbar-format.svg";
import minusIcon from "../../assets/resume-assistant/toolbar-minus-enabled.svg";
import plusIcon from "../../assets/resume-assistant/toolbar-plus-enabled.svg";
import boldIcon from "../../assets/resume-assistant/toolbar-bold-enabled.svg";
import underlineIcon from "../../assets/resume-assistant/toolbar-underline-enabled.svg";
import linkIcon from "../../assets/resume-assistant/toolbar-link-enabled.svg";
import textColorIcon from "../../assets/resume-assistant/toolbar-text-color-enabled.svg";
import lineHeightIcon from "../../assets/resume-assistant/toolbar-line-height-enabled.svg";
import formatIcon from "../../assets/resume-assistant/toolbar-format-enabled.svg";
import dividerIcon from "../../assets/resume-assistant/toolbar-divider.svg";

const ALIGNMENTS = ["Left", "Center", "Right", "Justify"];
// The color input needs a hex value; unset text is the document's Neutral/700.
const DEFAULT_TEXT_COLOR = primitiveColors.neutral[700];
const BAR_CLASSES = "hidden items-center gap-sp12 border-b border-neutral-100 bg-white px-sp12 py-sp4 md:flex";

function Divider() {
  return (
    <span className="flex h-6 w-0 shrink-0 items-center justify-center" aria-hidden="true">
      <img src={dividerIcon} alt="" className="rotate-90" />
    </span>
  );
}

// Figma's disabled toolbar (Neutral/200 strokes and text): shown while tailoring runs.
function DisabledToolbar() {
  const icon = (src, label) => (
    <button type="button" disabled aria-label={label} className="grid shrink-0 cursor-not-allowed place-items-center">
      <img src={src} alt="" />
    </button>
  );
  return (
    <div className={BAR_CLASSES} role="toolbar" aria-label="Formatting" aria-disabled="true">
      <button
        type="button"
        disabled
        className="flex shrink-0 cursor-not-allowed items-center gap-sp8 rounded-sm border border-neutral-50 bg-white px-sp12 py-sp8 text-body-small text-neutral-200"
      >
        Merriweather
        <img src={arrowDownDisabled} alt="" />
      </button>
      <Divider />
      <div className="flex shrink-0 items-center gap-sp8 rounded-sm border border-neutral-50 bg-white px-sp12 py-sp8 text-body-small text-neutral-200">
        {icon(minusDisabled, "Smaller text")}
        <span>{BODY_FONT_SIZE}</span>
        {icon(plusDisabled, "Larger text")}
      </div>
      <Divider />
      {icon(boldDisabled, "Bold")}
      {icon(underlineDisabled, "Underline")}
      {icon(linkDisabled, "Link")}
      {icon(textColorDisabled, "Text color")}
      <Divider />
      {icon(lineHeightDisabled, "Line spacing")}
      {icon(formatDisabled, "Alignment")}
    </div>
  );
}

// disabledSrc: Figma's disabled (Neutral/200) version of the icon. The icons are images with
// their color baked in, so the Button's disabled text color alone wouldn't show.
function IconButton({ src, disabledSrc, label, active = false, onClick, size = "size-8", disabled = false }) {
  return (
    <Button
      variant="link"
      iconPosition="alone"
      icon={<img src={disabled && disabledSrc ? disabledSrc : src} alt="" />}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${size} ${active ? "bg-primary-50" : ""}`}
    />
  );
}

IconButton.propTypes = {
  src: PropTypes.string.isRequired,
  disabledSrc: PropTypes.string,
  label: PropTypes.string.isRequired,
  active: PropTypes.bool,
  onClick: PropTypes.func,
  size: PropTypes.string,
  disabled: PropTypes.bool,
};

function toolbarState(editor) {
  const style = editor.getAttributes("textStyle");
  const block = editor.isActive("heading") ? editor.getAttributes("heading") : editor.getAttributes("paragraph");
  const explicitSize = toPoints(style.fontSize);
  return {
    font: fontNameFor(style.fontFamily),
    fontSize: explicitSize !== null
      ? explicitSize
      : editor.isActive("heading", { level: 1 })
        ? NAME_FONT_SIZE
        : BODY_FONT_SIZE,
    bold: editor.isActive("bold"),
    underline: editor.isActive("underline"),
    link: editor.isActive("link"),
    linkHref: editor.getAttributes("link").href ?? "",
    // A link needs words to hang on: a selection, or the caret inside an existing link.
    canLink: !editor.state.selection.empty || editor.isActive("link"),
    color: /^#[0-9a-f]{6}$/i.test(style.color ?? "") ? style.color : null,
    lineSpacing: block.lineSpacing ?? "Default",
    align: ALIGNMENTS.find((a) => editor.isActive({ textAlign: a.toLowerCase() })) ?? "Left",
  };
}

// Figma "Editor toolbar" (Ready to review). Applies to the selection, like a word processor.
function ActiveToolbar({ editor }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => toolbarState(e) });
  const chain = () => editor.chain().focus();

  // Link popover (Ctrl/Cmd+K or the toolbar button). The editor keeps its selection while the
  // popover's field has focus, so applying acts on the words that were selected.
  const linkAnchorRef = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkStart, setLinkStart] = useState("");
  const openLink = useCallback(() => {
    if (editor.state.selection.empty && !editor.isActive("link")) return;
    setLinkStart(editor.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }, [editor]);
  const closeLink = useCallback(() => {
    setLinkOpen(false);
    editor.chain().focus().run();
  }, [editor]);
  // A caret inside a link (no selection) edits the whole link, not just the caret.
  const linkChain = () => {
    const c = editor.chain().focus();
    return editor.state.selection.empty ? c.extendMarkRange("link") : c;
  };
  const applyLink = (href) => {
    linkChain().setLink({ href }).run();
    setLinkOpen(false);
  };
  const removeLink = () => {
    linkChain().unsetLink().run();
    setLinkOpen(false);
  };
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      openLink();
    };
    const dom = editor.view.dom;
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, openLink]);

  const setFont = (name) => {
    const font = FONTS.find((f) => f.name === name);
    if (!font?.stack) chain().unsetFontFamily().run();
    else chain().setFontFamily(font.stack).run();
  };
  const stepSize = (delta) => {
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, state.fontSize + delta));
    chain().setFontSize(`${next}pt`).run();
  };

  return (
    <div className={BAR_CLASSES} role="toolbar" aria-label="Formatting">
      <div className="shrink-0">
        <Select
          value={state.font}
          onChange={setFont}
          options={[{ items: FONTS.map((f) => f.name) }]}
          menuWidth="content"
          getItemClassName={(name) => FONTS.find((f) => f.name === name)?.className}
        />
      </div>
      <Divider />
      <div className="flex shrink-0 items-center gap-sp8 rounded-sm border border-neutral-100 bg-white px-sp8 py-sp4 text-body-small text-neutral-700">
        <IconButton src={minusIcon} disabledSrc={minusDisabled} label="Smaller text" size="size-6" onClick={() => stepSize(-1)} disabled={state.fontSize <= MIN_FONT_SIZE} />
        <span aria-label={`Font size ${state.fontSize} points`}>{state.fontSize}</span>
        <IconButton src={plusIcon} disabledSrc={plusDisabled} label="Larger text" size="size-6" onClick={() => stepSize(1)} disabled={state.fontSize >= MAX_FONT_SIZE} />
      </div>
      <Divider />
      <IconButton src={boldIcon} label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()} />
      <IconButton src={underlineIcon} label="Underline" active={state.underline} onClick={() => chain().toggleUnderline().run()} />
      <div ref={linkAnchorRef} className="shrink-0">
        <IconButton
          src={linkIcon}
          disabledSrc={linkDisabled}
          label="Link (Ctrl+K)"
          active={state.link || linkOpen}
          disabled={!state.canLink}
          onClick={() => (linkOpen ? setLinkOpen(false) : openLink())}
        />
      </div>
      {linkOpen && (
        <LinkPopover
          anchorRef={linkAnchorRef}
          initialValue={linkStart}
          onApply={applyLink}
          onRemove={state.link ? removeLink : undefined}
          onClose={closeLink}
        />
      )}
      {/* Any color: the browser's own color picker behind Figma's text-color icon. */}
      <label className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm hover:bg-neutral-50" aria-label="Text color">
        <img src={textColorIcon} alt="" />
        <input
          type="color"
          value={state.color ?? DEFAULT_TEXT_COLOR}
          onChange={(e) => chain().setColor(e.target.value).run()}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Divider />
      <div className="shrink-0">
        <Select
          value={state.lineSpacing}
          onChange={(v) => chain().setLineSpacing(v).run()}
          leftIcon={<img src={lineHeightIcon} alt="" />}
          options={[{ group: "Line spacing", items: LINE_SPACING_OPTIONS }]}
        />
      </div>
      <div className="shrink-0">
        <Select
          value={state.align}
          onChange={(v) => chain().setTextAlign(v.toLowerCase()).run()}
          leftIcon={<img src={formatIcon} alt="" />}
          options={[{ group: "Alignment", items: ALIGNMENTS }]}
        />
      </div>
    </div>
  );
}

ActiveToolbar.propTypes = { editor: PropTypes.object.isRequired };

/** Formatting toolbar, desktop only. Disabled (Figma's disabled look) until there's an editor. */
const EditorToolbar = ({ editor = null }) => (editor ? <ActiveToolbar editor={editor} /> : <DisabledToolbar />);

EditorToolbar.propTypes = {
  /** The TipTap editor, or null while tailoring runs */
  editor: PropTypes.object,
};

export default EditorToolbar;
