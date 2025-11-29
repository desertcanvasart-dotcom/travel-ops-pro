'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import FontFamily from '@tiptap/extension-font-family'
import { Extension } from '@tiptap/core'
import { useState, useCallback, useEffect, useRef } from 'react'
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
  AlignJustify,
  Type,
  Palette,
  Highlighter,
  Code,
  ChevronDown,
  Check,
  X
} from 'lucide-react'

// Custom FontSize extension
const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize || null,
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {}
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ commands }) => {
          return commands.setMark('textStyle', { fontSize })
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain()
            .setMark('textStyle', { fontSize: null })
            .removeEmptyTextStyle()
            .run()
        },
    }
  },
})

// Extend the Commands interface for TypeScript
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

// Font families available
const FONT_FAMILIES = [
  { name: 'Default', value: '' },
  { name: 'Arial', value: 'Arial' },
  { name: 'Times New Roman', value: 'Times New Roman' },
  { name: 'Georgia', value: 'Georgia' },
  { name: 'Verdana', value: 'Verdana' },
  { name: 'Courier New', value: 'Courier New' },
  { name: 'Trebuchet MS', value: 'Trebuchet MS' },
  { name: 'Comic Sans MS', value: 'Comic Sans MS' },
  { name: 'Impact', value: 'Impact' },
  { name: 'Tahoma', value: 'Tahoma' },
]

// Font sizes available
const FONT_SIZES = [
  { name: 'Small', value: '12px' },
  { name: 'Normal', value: '14px' },
  { name: 'Medium', value: '16px' },
  { name: 'Large', value: '18px' },
  { name: 'X-Large', value: '24px' },
  { name: 'XX-Large', value: '32px' },
]

// Common colors for text and highlight
const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Dark Gray', value: '#4B5563' },
  { name: 'Gray', value: '#9CA3AF' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Pink', value: '#EC4899' },
]

const HIGHLIGHT_COLORS = [
  { name: 'None', value: '' },
  { name: 'Yellow', value: '#FEF08A' },
  { name: 'Green', value: '#BBF7D0' },
  { name: 'Blue', value: '#BFDBFE' },
  { name: 'Pink', value: '#FBCFE8' },
  { name: 'Purple', value: '#E9D5FF' },
  { name: 'Orange', value: '#FED7AA' },
  { name: 'Gray', value: '#E5E7EB' },
]

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  maxHeight?: string
  className?: string
}

// Dropdown component for font family and size - FIXED VERSION
function Dropdown({ 
  label, 
  value, 
  options, 
  onChange,
  icon: Icon,
  editor
}: { 
  label: string
  value: string
  options: { name: string; value: string }[]
  onChange: (value: string) => void
  icon?: React.ComponentType<{ className?: string }>
  editor: Editor
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find(o => o.value === value) || options[0]

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (optionValue: string) => {
    // Store selection before closing
    const selection = editor.state.selection
    
    // Close dropdown first
    setIsOpen(false)
    
    // Then apply the change with a small delay to ensure focus is maintained
    setTimeout(() => {
      editor.chain().focus().run()
      onChange(optionValue)
    }, 10)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault() // Prevent editor blur
          setIsOpen(!isOpen)
        }}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-200 min-w-[90px]"
      >
        {Icon && <Icon className="w-3 h-3" />}
        <span className="truncate flex-1 text-left">{selectedOption.name}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px] max-h-[200px] overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value || 'default'}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault() // Prevent editor blur
                e.stopPropagation()
                handleSelect(option.value)
              }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
              style={label === 'Font' ? { fontFamily: option.value || 'inherit' } : {}}
            >
              {option.value === value && <Check className="w-3 h-3 text-primary-600" />}
              {option.value !== value && <span className="w-3" />}
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Color picker dropdown - FIXED VERSION
function ColorPicker({
  colors,
  value,
  onChange,
  icon: Icon,
  label,
  editor
}: {
  colors: { name: string; value: string }[]
  value: string
  onChange: (value: string) => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  editor: Editor
}) {
  const [isOpen, setIsOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (colorValue: string) => {
    setIsOpen(false)
    
    setTimeout(() => {
      editor.chain().focus().run()
      onChange(colorValue)
    }, 10)
  }

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          setIsOpen(!isOpen)
        }}
        className="flex items-center gap-1 p-1.5 text-gray-600 hover:bg-gray-100 rounded"
        title={label}
      >
        <Icon className="w-4 h-4" />
        <div 
          className="w-3 h-1 rounded-sm" 
          style={{ backgroundColor: value || '#000000' }}
        />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2">
          <div className="grid grid-cols-4 gap-1">
            {colors.map((color) => (
              <button
                key={color.value || 'none'}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSelect(color.value)
                }}
                className={`w-6 h-6 rounded border ${
                  color.value === value 
                    ? 'ring-2 ring-primary-500 ring-offset-1' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                style={{ backgroundColor: color.value || '#ffffff' }}
                title={color.name}
              >
                {!color.value && (
                  <X className="w-4 h-4 text-gray-400 mx-auto" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Link modal component
function LinkModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  initialUrl 
}: { 
  isOpen: boolean
  onClose: () => void
  onSubmit: (url: string) => void
  initialUrl: string
}) {
  const [url, setUrl] = useState(initialUrl)

  useEffect(() => {
    setUrl(initialUrl)
  }, [initialUrl])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg p-4 w-[360px]">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Insert Link</h3>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSubmit(url)
              onClose()
            }}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}

// HTML editor modal
function HtmlEditorModal({
  isOpen,
  onClose,
  html,
  onSave
}: {
  isOpen: boolean
  onClose: () => void
  html: string
  onSave: (html: string) => void
}) {
  const [editedHtml, setEditedHtml] = useState(html)

  useEffect(() => {
    setEditedHtml(html)
  }, [html])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">Edit HTML Source</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            value={editedHtml}
            onChange={(e) => setEditedHtml(e.target.value)}
            className="w-full h-full min-h-[300px] px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            spellCheck={false}
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(editedHtml)
              onClose()
            }}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// Toolbar button component
function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault() // Prevent editor blur
        onClick()
      }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive 
          ? 'bg-primary-100 text-primary-700' 
          : 'text-gray-600 hover:bg-gray-100'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}

// Toolbar divider
function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />
}

// Main toolbar component
function EditorToolbar({ editor }: { editor: Editor }) {
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showHtmlModal, setShowHtmlModal] = useState(false)

  const setLink = useCallback((url: string) => {
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  // Get current font family
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || ''
  
  // Get current font size
  const currentFontSize = editor.getAttributes('textStyle').fontSize || '14px'
  
  // Get current color
  const currentColor = editor.getAttributes('textStyle').color || '#000000'
  
  // Get current highlight
  const currentHighlight = editor.getAttributes('highlight').color || ''

  return (
    <>
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-gray-200 bg-gray-50/50">
        {/* Font Family */}
        <Dropdown
          label="Font"
          value={currentFontFamily}
          options={FONT_FAMILIES}
          onChange={(value) => {
            if (value) {
              editor.chain().focus().setFontFamily(value).run()
            } else {
              editor.chain().focus().unsetFontFamily().run()
            }
          }}
          icon={Type}
          editor={editor}
        />

        {/* Font Size */}
        <Dropdown
          label="Size"
          value={currentFontSize}
          options={FONT_SIZES}
          onChange={(value) => {
            editor.chain().focus().setFontSize(value).run()
          }}
          editor={editor}
        />

        <ToolbarDivider />

        {/* Basic Formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text Color */}
        <ColorPicker
          colors={COLORS}
          value={currentColor}
          onChange={(color) => {
            editor.chain().focus().setColor(color).run()
          }}
          icon={Palette}
          label="Text Color"
          editor={editor}
        />

        {/* Highlight Color */}
        <ColorPicker
          colors={HIGHLIGHT_COLORS}
          value={currentHighlight}
          onChange={(color) => {
            if (color) {
              editor.chain().focus().toggleHighlight({ color }).run()
            } else {
              editor.chain().focus().unsetHighlight().run()
            }
          }}
          icon={Highlighter}
          label="Highlight Color"
          editor={editor}
        />

        <ToolbarDivider />

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

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title="Justify"
        >
          <AlignJustify className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

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

        <ToolbarDivider />

        {/* Link */}
        <ToolbarButton
          onClick={() => setShowLinkModal(true)}
          isActive={editor.isActive('link')}
          title="Insert Link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        {/* HTML Source */}
        <ToolbarButton
          onClick={() => setShowHtmlModal(true)}
          title="Edit HTML Source"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Link Modal */}
      <LinkModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onSubmit={setLink}
        initialUrl={editor.getAttributes('link').href || ''}
      />

      {/* HTML Editor Modal */}
      <HtmlEditorModal
        isOpen={showHtmlModal}
        onClose={() => setShowHtmlModal(false)}
        html={editor.getHTML()}
        onSave={(html) => editor.commands.setContent(html)}
      />
    </>
  )
}

// Main RichTextEditor component
export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start typing...',
  minHeight = '200px',
  maxHeight = '400px',
  className = ''
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary-600 underline',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['paragraph', 'heading'],
      }),
      // IMPORTANT: TextStyle MUST be added for Color, FontFamily, FontSize to work
      TextStyle,
      Color.configure({
        types: ['textStyle'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      FontFamily.configure({
        types: ['textStyle'],
      }),
      FontSize,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
        style: `min-height: ${minHeight}; max-height: ${maxHeight}; overflow-y: auto; padding: 12px;`,
      },
    },
  })

  // Update content when prop changes (for signatures/templates)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  if (!editor) {
    return (
      <div className={`border border-gray-200 rounded-lg ${className}`}>
        <div className="h-10 bg-gray-50/50 border-b border-gray-200 animate-pulse" />
        <div style={{ minHeight }} className="p-3 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
    )
  }

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden bg-white ${className}`}>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <style jsx global>{`
        .ProseMirror {
          outline: none;
        }
        .ProseMirror p {
          margin: 0.25rem 0;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .ProseMirror li {
          margin: 0.25rem 0;
        }
        .ProseMirror li p {
          margin: 0;
        }
        .ProseMirror a {
          color: #4f7942;
          text-decoration: underline;
        }
        .ProseMirror mark {
          border-radius: 0.25rem;
          padding: 0.125rem 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

// Export a simpler version for signatures
export function SignatureEditor({
  content,
  onChange,
  placeholder = 'Create your email signature...'
}: {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  return (
    <RichTextEditor
      content={content}
      onChange={onChange}
      placeholder={placeholder}
      minHeight="150px"
      maxHeight="300px"
    />
  )
}

// Export a version for templates
export function TemplateEditor({
  content,
  onChange,
  placeholder = 'Create your email template...'
}: {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  return (
    <RichTextEditor
      content={content}
      onChange={onChange}
      placeholder={placeholder}
      minHeight="250px"
      maxHeight="500px"
    />
  )
}