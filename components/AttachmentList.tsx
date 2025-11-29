'use client'

import { useState } from 'react'
import {
  Paperclip,
  Download,
  FileText,
  Image,
  FileSpreadsheet,
  File,
  Archive,
  Music,
  Video,
  Code,
  Loader2,
  ExternalLink
} from 'lucide-react'

interface Attachment {
  id: string        // attachmentId from Gmail
  filename: string
  mimeType: string
  size: number
}

interface AttachmentListProps {
  attachments: Attachment[]
  messageId: string
  userId: string
  className?: string
}

export default function AttachmentList({
  attachments,
  messageId,
  userId,
  className = ''
}: AttachmentListProps) {
  const [downloading, setDownloading] = useState<string | null>(null)

  if (!attachments || attachments.length === 0) {
    return null
  }

  const handleDownload = async (attachment: Attachment) => {
    setDownloading(attachment.id)

    try {
      const params = new URLSearchParams({
        userId,
        messageId,
        attachmentId: attachment.id,
        filename: attachment.filename,
      })

      const response = await fetch(`/api/gmail/attachments?${params}`)

      if (!response.ok) {
        throw new Error('Failed to download attachment')
      }

      // Create blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download attachment')
    } finally {
      setDownloading(null)
    }
  }

  const getFileIcon = (mimeType: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    
    // Images
    if (mimeType.startsWith('image/')) {
      return <Image className="w-4 h-4 text-blue-500" />
    }
    
    // PDFs and documents
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return <FileText className="w-4 h-4 text-red-500" />
    }
    
    // Word docs
    if (mimeType.includes('word') || ['doc', 'docx'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-600" />
    }
    
    // Spreadsheets
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) {
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />
    }
    
    // Archives
    if (mimeType.includes('zip') || mimeType.includes('rar') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Archive className="w-4 h-4 text-yellow-600" />
    }
    
    // Audio
    if (mimeType.startsWith('audio/')) {
      return <Music className="w-4 h-4 text-purple-500" />
    }
    
    // Video
    if (mimeType.startsWith('video/')) {
      return <Video className="w-4 h-4 text-pink-500" />
    }
    
    // Code
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java'].includes(ext)) {
      return <Code className="w-4 h-4 text-gray-600" />
    }
    
    // Default
    return <File className="w-4 h-4 text-gray-500" />
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className={`border-t border-gray-100 pt-3 mt-3 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
        <Paperclip className="w-3.5 h-3.5" />
        <span>{attachments.length} attachment{attachments.length > 1 ? 's' : ''}</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <button
            key={attachment.id}
            onClick={() => handleDownload(attachment)}
            disabled={downloading === attachment.id}
            className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors group disabled:opacity-50"
          >
            {downloading === attachment.id ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              getFileIcon(attachment.mimeType, attachment.filename)
            )}
            
            <div className="text-left">
              <div className="text-xs font-medium text-gray-700 max-w-[150px] truncate">
                {attachment.filename}
              </div>
              <div className="text-[10px] text-gray-400">
                {formatFileSize(attachment.size)}
              </div>
            </div>
            
            <Download className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary-600 ml-1" />
          </button>
        ))}
      </div>
    </div>
  )
}

// Compact version for email list preview
export function AttachmentIndicator({ count }: { count: number }) {
  if (count === 0) return null
  
  return (
    <div className="flex items-center gap-1 text-gray-400" title={`${count} attachment${count > 1 ? 's' : ''}`}>
      <Paperclip className="w-3 h-3" />
      {count > 1 && <span className="text-[10px]">{count}</span>}
    </div>
  )
}
