// Blog post editor (TipTap 3, MIT): a separate bundle (public/admin/blog-editor.js), loaded only
// when Admin > Blog opens a post, so the rest of the admin stays light. Plain @tiptap/core on a
// DOM element: no second React. The admin screen (src/admin/blog.js) draws the toolbar and calls
// the editor's commands. Headings start at H2 (the post title is the H1); pasted Word/Docs text
// keeps only what the schema knows; the server cleans the HTML again (src/blog/content.js).
import { Editor, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder, CharacterCount } from '@tiptap/extensions';

// A highlighted box (note or call to action): <div class="callout|cta"> around paragraphs.
const Box = Node.create({
  name: 'box',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() { return { kind: { default: 'callout', parseHTML: el => (el.classList.contains('cta') ? 'cta' : 'callout'), renderHTML: attrs => ({ class: attrs.kind === 'cta' ? 'cta' : 'callout' }) } }; },
  parseHTML() { return [{ tag: 'div.callout' }, { tag: 'div.cta' }, { tag: 'aside.callout' }, { tag: 'aside.cta' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes), 0]; },
  addCommands() {
    return {
      toggleBox: kind => ({ commands, editor }) => (editor.isActive('box', { kind }) ? commands.lift('box') : commands.wrapIn('box', { kind })),
    };
  },
});

function create(element, { content = '', placeholder = 'Viết nội dung bài…', onUpdate = () => {}, onSelection = () => {} } = {}) {
  const editor = new Editor({
    element,
    content,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: null, target: null } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ nocookie: false, controls: true, width: 640, height: 360 }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
      Box,
    ],
    editorProps: { attributes: { class: 'blog-prose', spellcheck: 'true', lang: 'vi' } },
    onUpdate: ({ editor: e }) => onUpdate(e),
    onSelectionUpdate: ({ editor: e }) => onSelection(e),
    onTransaction: ({ editor: e }) => onSelection(e),
  });
  return editor;
}

window.BlogEditor = { create };
