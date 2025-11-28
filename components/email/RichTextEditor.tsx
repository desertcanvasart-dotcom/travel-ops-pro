'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TiptapLink from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { useCallback, useState } from 'react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Highlighter,
  Type,
  ChevronDown,
  Code
} from 'lucide-react'

interface RichTextEditorProps {
  content?: string
  onChange?: (html: string) => void
  placeholder?: string
  minHeight?: string
}

const fontFamilies = [
  { label: 'Default', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
]

const fontSizes = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '14px' },
  { label: 'Medium', value: '16px' },
  { label: 'Large', value: '18px' },
  { label: 'X-Large', value: '24px' },
  { label: 'XX-Large', value: '32px' },
]

const textColors = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6',
  '#6366F1', '#8B5CF6', '#A855F7', '#EC4899',
]

const highlightColors = [
  '#FEF08A', '#FDE68A', '#FECACA', '#FED7AA',
  '#D9F99D', '#A7F3D0', '#A5F3FC', '#BFDBFE',
  '#DDD6FE', '#FBCFE8', '#E5E7EB', '#FFFFFF',
]

export default function RichTextEditor({ 
  content = '', 
  onChange,
  placeholder = 'Write something...',
  minHeight = '200px'
}: RichTextEditorProps) {
  const [showFontDropdown, setShowFontDropdown] = useState(false)
  const [showSizeDropdown, setShowSizeDropdown] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary-600 underline' },
      }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['paragraph'] }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-4 py-3`,
        style: `min-height: ${minHeight}`,
      },
    },
  })

  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const setFontFamily = (fontFamily: string) => {
    if (!editor) return
    if (fontFamily) {
      editor.chain().focus().setMark('textStyle', { fontFamily }).run()
    } else {
      editor.chain().focus().unsetMark('textStyle').run()
    }
    setShowFontDropdown(false)
  }

  const setFontSize = (fontSize: string) => {
    if (!editor) return
    editor.chain().focus().setMark('textStyle', { fontSize }).run()
    setShowSizeDropdown(false)
  }

  const setTextColor = (color: string) => {
    if (!editor) return
    editor.chain().focus().setColor(color).run()
    setShowColorPicker(false)
  }

  const setHighlightColor = (color: string) => {
    if (!editor) return
    editor.chain().focus().setHighlight({ color }).run()
    setShowHighlightPicker(false)
  }

  if (!editor) return null

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/80">
        {/* Font Family */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFontDropdown(!showFontDropdown)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            <Type className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Font</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showFontDropdown && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
              {fontFamilies.map((font) => (
                <button
                  key={font.value}
                  onClick={() => setFontFamily(font.value)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                  style={{ fontFamily: font.value || 'inherit' }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font Size */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSizeDropdown(!showSizeDropdown)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            <span className="text-[10px] font-bold">A</span>
            <span className="text-xs font-bold">A</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showSizeDropdown && (
            <div className="absolute left-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
              {fontSizes.map((size) => (
                <button
                  key={size.value}
                  onClick={() => setFontSize(size.value)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  {size.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Basic Formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Underline"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Text Color */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors"
            title="Text Color"
          >
            <Palette className="w-4 h-4 text-gray-600" />
          </button>
          {showColorPicker && (
            <div className="absolute left-0 top-full mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
              <div className="grid grid-cols-4 gap-1">
                {textColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setTextColor(color)}
                    className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Highlight Color */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowHighlightPicker(!showHighlightPicker)}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors"
            title="Highlight"
          >
            <Highlighter className="w-4 h-4 text-gray-600" />
          </button>
          {showHighlightPicker && (
            <div className="absolute left-0 top-full mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
              <div className="grid grid-cols-4 gap-1">
                {highlightColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setHighlightColor(color)}
                    className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Align Left"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Align Center"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Align Right"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Link */}
        <ToolbarButton
          onClick={setLink}
          isActive={editor.isActive('link')}
          title="Add Link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* Click outside to close dropdowns */}
      {(showFontDropdown || showSizeDropdown || showColorPicker || showHighlightPicker) && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => {
            setShowFontDropdown(false)
            setShowSizeDropdown(false)
            setShowColorPicker(false)
            setShowHighlightPicker(false)
          }}
        />
      )}

      <style jsx global>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror:focus { outline: none; }
        .ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; }
        .ProseMirror li { margin: 0.25rem 0; }
        .ProseMirror a { color: #4a5d4a; text-decoration: underline; }
        .ProseMirror mark { padding: 0.125rem 0; }
      `}</style>
    </div>
  )
}

function ToolbarButton({ 
  onClick, 
  isActive = false, 
  disabled = false,
  children,
  title
}: { 
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive 
          ? 'bg-primary-100 text-primary-700' 
          : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

// Export editor hook for external use
export { useEditor }
export type { RichTextEditorProps }