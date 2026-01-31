'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { X, Clock, AlertCircle, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

const supabase = createClient()

interface AddFollowupModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  onSuccess: () => void
  editFollowup?: any // Pass existing followup to edit
}

export default function AddFollowupModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  onSuccess,
  editFollowup
}: AddFollowupModalProps) {
  const t = useTranslations('followups')
  const tCommon = useTranslations('common')
  const isEditMode = !!editFollowup

  const [formData, setFormData] = useState({
    followup_type: 'call',
    due_date: '',
    priority: 'medium',
    notes: ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editFollowup) {
      setFormData({
        followup_type: editFollowup.followup_type || 'call',
        due_date: editFollowup.due_date || '',
        priority: editFollowup.priority || 'medium',
        notes: editFollowup.description || ''
      })
    } else {
      // Reset form for adding new
      setFormData({
        followup_type: 'call',
        due_date: '',
        priority: 'medium',
        notes: ''
      })
    }
  }, [editFollowup, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      // Validate due date
      if (!formData.due_date) {
        throw new Error(t('selectDueDate'))
      }

      // Generate a title based on the follow-up type
      const typeKey = formData.followup_type as 'call' | 'email' | 'whatsapp' | 'meeting' | 'quote' | 'booking_confirmation' | 'payment_reminder' | 'feedback' | 'other'
      const followupTypeLabel = t(`types.${typeKey}`)

      const title = `${followupTypeLabel} - ${clientName}`

      if (isEditMode) {
        // Update existing followup
        const { error: updateError } = await supabase
          .from('client_followups')
          .update({
            title: title,
            followup_type: formData.followup_type,
            due_date: formData.due_date,
            priority: formData.priority,
            description: formData.notes || null
          })
          .eq('id', editFollowup.id)

        if (updateError) throw updateError
      } else {
        // Create new followup
        const { error: insertError } = await supabase
          .from('client_followups')
          .insert({
            client_id: clientId,
            title: title,
            followup_type: formData.followup_type,
            due_date: formData.due_date,
            priority: formData.priority,
            status: 'pending',
            description: formData.notes || null
          })

        if (insertError) throw insertError
      }

      // Reset form
      setFormData({
        followup_type: 'call',
        due_date: '',
        priority: 'medium',
        notes: ''
      })

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error saving follow-up:', err)
      setError(err.message || t('failedToSave'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('client_followups')
        .delete()
        .eq('id', editFollowup.id)

      if (deleteError) throw deleteError

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error deleting follow-up:', err)
      setError(err.message || t('failedToDelete'))
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isEditMode ? t('editFollowup') : t('addFollowup')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isEditMode ? t('updateFollowupDetails') : t('scheduleFollowupWith', { clientName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={tCommon('close')}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">{tCommon('error')}</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Follow-up Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('followupType')} *
            </label>
            <select
              value={formData.followup_type}
              onChange={(e) => handleChange('followup_type', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              title={t('followupType')}
            >
              <option value="call">{t('types.call')}</option>
              <option value="email">{t('types.email')}</option>
              <option value="whatsapp">{t('types.whatsapp')}</option>
              <option value="meeting">{t('types.meeting')}</option>
              <option value="quote">{t('types.quote')}</option>
              <option value="booking_confirmation">{t('types.booking_confirmation')}</option>
              <option value="payment_reminder">{t('types.payment_reminder')}</option>
              <option value="feedback">{t('types.feedback')}</option>
              <option value="other">{t('types.other')}</option>
            </select>
          </div>

          {/* Due Date & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('dueDate')} *
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => handleChange('due_date', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                title={t('dueDate')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('priority')} *
              </label>
              <select
                value={formData.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                title={t('priority')}
              >
                <option value="low">{t('priorities.low')}</option>
                <option value="medium">{t('priorities.medium')}</option>
                <option value="high">{t('priorities.high')}</option>
                <option value="urgent">{t('priorities.urgent')}</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('notesOptional')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder={t('notesPlaceholder')}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            {isEditMode && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-3 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 font-medium transition-colors flex items-center gap-2"
                disabled={isSaving || isDeleting}
              >
                <Trash2 className="w-4 h-4" />
                {tCommon('delete')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              disabled={isSaving || isDeleting}
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || isDeleting}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors disabled:bg-purple-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {t('saving')}
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  {isEditMode ? t('updateFollowup') : t('scheduleFollowup')}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t('deleteFollowup')}</h3>
              <p className="text-gray-600 mb-6">
                {t('deleteConfirmMessage')}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={isDeleting}
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300"
                  disabled={isDeleting}
                >
                  {isDeleting ? t('deleting') : tCommon('delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}