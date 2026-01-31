'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { X, FileText, AlertCircle, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

const supabase = createClient()

interface AddNoteModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  onSuccess: () => void
  editNote?: any // Pass existing note to edit
}

export default function AddNoteModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  onSuccess,
  editNote
}: AddNoteModalProps) {
  const t = useTranslations('notes')
  const tCommon = useTranslations('common')
  const isEditMode = !!editNote

  const [formData, setFormData] = useState({
    note_text: '',
    note_type: 'general',
    is_internal: false
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editNote) {
      setFormData({
        note_text: editNote.content || '',
        note_type: editNote.note_type || 'general',
        is_internal: editNote.is_important || false
      })
    } else {
      // Reset form for adding new
      setFormData({
        note_text: '',
        note_type: 'general',
        is_internal: false
      })
    }
  }, [editNote, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      // Validate note text
      if (!formData.note_text.trim()) {
        throw new Error(t('enterNote'))
      }

      if (isEditMode) {
        // Update existing note
        const { error: updateError } = await supabase
          .from('client_notes')
          .update({
            content: formData.note_text,
            note_type: formData.note_type,
            is_important: formData.is_internal
          })
          .eq('id', editNote.id)

        if (updateError) throw updateError
      } else {
        // Create new note
        const { error: insertError } = await supabase
          .from('client_notes')
          .insert({
            client_id: clientId,
            content: formData.note_text,
            note_type: formData.note_type,
            is_important: formData.is_internal
          })

        if (insertError) throw insertError
      }

      // Reset form
      setFormData({
        note_text: '',
        note_type: 'general',
        is_internal: false
      })

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error saving note:', err)
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
        .from('client_notes')
        .delete()
        .eq('id', editNote.id)

      if (deleteError) throw deleteError

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error deleting note:', err)
      setError(err.message || t('failedToDelete'))
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
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
              {isEditMode ? t('editNote') : t('addNote')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isEditMode ? t('updateNoteDetails') : t('addNoteAbout', { clientName })}
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

          {/* Note Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('noteType')} *
            </label>
            <select
              value={formData.note_type}
              onChange={(e) => handleChange('note_type', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              title={t('noteType')}
            >
              <option value="general">{t('types.general')}</option>
              <option value="preference">{t('types.preference')}</option>
              <option value="complaint">{t('types.complaint')}</option>
              <option value="compliment">{t('types.compliment')}</option>
              <option value="dietary">{t('types.dietary')}</option>
              <option value="accessibility">{t('types.accessibility')}</option>
              <option value="travel_history">{t('types.travel_history')}</option>
              <option value="payment">{t('types.payment')}</option>
              <option value="special_request">{t('types.special_request')}</option>
              <option value="internal">{t('types.internal')}</option>
            </select>
          </div>

          {/* Note Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('note')} *
            </label>
            <textarea
              value={formData.note_text}
              onChange={(e) => handleChange('note_text', e.target.value)}
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder={t('enterNotePlaceholder')}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.note_text.length}/2000 {t('characters')}
            </p>
          </div>

          {/* Internal Note Toggle */}
          <div className="bg-gray-50 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_internal}
                onChange={(e) => handleChange('is_internal', e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900">{t('importantNote')}</div>
                <p className="text-sm text-gray-600 mt-1">
                  {t('markAsImportant')}
                </p>
              </div>
            </label>
          </div>

          {/* Quick Note Templates - Only show when adding new */}
          {!isEditMode && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{t('quickTemplates')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('note_text', t('templates.culturalInterestText'))}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('templates.culturalInterest')}
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', t('templates.luxuryPreferenceText'))}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('templates.luxuryPreference')}
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', t('templates.budgetConsciousText'))}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('templates.budgetConscious')}
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', t('templates.familyTravelText'))}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('templates.familyTravel')}
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', t('templates.communicationPrefText'))}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('templates.communicationPref')}
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', t('templates.repeatCustomerText'))}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('templates.repeatCustomer')}
                </button>
              </div>
            </div>
          )}

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
              disabled={isSaving || isDeleting || !formData.note_text.trim()}
              className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors disabled:bg-orange-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {t('saving')}
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  {isEditMode ? t('updateNote') : t('saveNote')}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t('deleteNote')}</h3>
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