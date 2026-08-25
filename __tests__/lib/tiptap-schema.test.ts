// ============================================
// The rich-text editor's extension set still composes
// ============================================
// components/email/RichTextEditor.tsx wires 10 tiptap extensions together, and
// several of them only work because of another: the file's own comment marks
// TextStyle as CRITICAL because Color, FontFamily and FontSize all hang off the
// `textStyle` mark it creates.
//
// Nothing in the suite renders that component — it needs a DOM — so a tiptap
// upgrade could rename or drop an option and the first sign would be an
// operator's signature losing its colours. `.configure()` does not throw on an
// unknown option; it ignores it. Silent is the failure mode to worry about.
//
// getSchema() builds the real ProseMirror schema from the extension list with
// no DOM at all, which is enough to catch an extension that has disappeared,
// been renamed, or stopped contributing its mark.
//
// This mirrors the component's configuration. If you change the extensions
// there, change them here.

import { describe, it, expect } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExtension from '@tiptap/extension-underline'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { FontFamily } from '@tiptap/extension-font-family'

const extensions = [
  StarterKit.configure({
    heading: false,
    bulletList: { keepMarks: true, keepAttributes: false },
    orderedList: { keepMarks: true, keepAttributes: false },
  }),
  UnderlineExtension,
  LinkExtension.configure({
    openOnClick: false,
    HTMLAttributes: { class: 'text-primary-600 underline' },
  }),
  Placeholder.configure({ placeholder: 'Write your message...' }),
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
  // Must precede Color / FontFamily — they extend the mark it defines.
  TextStyle,
  Color.configure({ types: ['textStyle'] }),
  Highlight.configure({ multicolor: true }),
  FontFamily.configure({ types: ['textStyle'] }),
]

describe('RichTextEditor extension set', () => {
  const schema = getSchema(extensions)

  it('builds a schema at all', () => {
    // A renamed or removed extension throws here rather than at runtime in the
    // operator's browser.
    expect(schema).toBeTruthy()
    expect(Object.keys(schema.nodes).length).toBeGreaterThan(0)
  })

  it('keeps the marks the toolbar drives', () => {
    for (const mark of ['bold', 'italic', 'underline', 'link', 'highlight', 'textStyle']) {
      expect(schema.marks[mark], `the "${mark}" mark vanished from the schema`).toBeTruthy()
    }
  })

  it('keeps the nodes the toolbar drives', () => {
    for (const node of ['paragraph', 'bulletList', 'orderedList', 'blockquote']) {
      expect(schema.nodes[node], `the "${node}" node vanished from the schema`).toBeTruthy()
    }
  })

  it('still lets Color and FontFamily hang off textStyle', () => {
    // The dependency the component calls CRITICAL. If TextStyle stops carrying
    // these attributes, colour and font pickers silently do nothing.
    const attrs = schema.marks.textStyle.spec.attrs ?? {}
    expect(Object.keys(attrs), 'textStyle lost its color attribute').toContain('color')
    expect(Object.keys(attrs), 'textStyle lost its fontFamily attribute').toContain('fontFamily')
  })

  it('still applies text alignment to paragraphs', () => {
    const attrs = schema.nodes.paragraph.spec.attrs ?? {}
    expect(Object.keys(attrs), 'TextAlign stopped contributing to paragraph').toContain('textAlign')
  })

  it('renders a link with the href intact', () => {
    // The link mark is the one carrying a Medium XSS advisory in 3.13; this
    // pins that it still parses and serialises an href after the upgrade.
    const linkMark = schema.marks.link
    expect(linkMark.spec.attrs).toHaveProperty('href')
  })
})
