'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

export type ValidationRule =
  | { type: 'required' }
  | { type: 'email' }
  | { type: 'minLength'; min: number }
  | { type: 'maxLength'; max: number }
  | { type: 'pattern'; pattern: RegExp; message?: string }
  | { type: 'number' }
  | { type: 'positive' }
  | { type: 'integer' }
  | { type: 'min'; min: number }
  | { type: 'max'; max: number }
  | { type: 'date' }
  | { type: 'dateRange'; startDate: Date; endDate: Date }
  | { type: 'phone' }
  | { type: 'url' }
  | { type: 'match'; other: string; otherValue: string }
  | { type: 'custom'; validate: (value: any) => boolean; message: string }

export interface FieldValidation {
  field: string
  fieldKey?: string // Key for fieldNames translation
  rules: ValidationRule[]
}

export interface ValidationResult {
  isValid: boolean
  errors: Record<string, string>
}

interface UseLocalizedValidationReturn {
  validate: (value: any, rules: ValidationRule[], fieldKey?: string) => string | null
  validateField: (value: any, fieldValidation: FieldValidation) => string | null
  validateForm: (values: Record<string, any>, validations: FieldValidation[]) => ValidationResult
  getFieldName: (fieldKey: string) => string
  validators: {
    required: (value: any) => boolean
    email: (value: string) => boolean
    minLength: (value: string, min: number) => boolean
    maxLength: (value: string, max: number) => boolean
    pattern: (value: string, pattern: RegExp) => boolean
    number: (value: any) => boolean
    positive: (value: number) => boolean
    integer: (value: number) => boolean
    min: (value: number, min: number) => boolean
    max: (value: number, max: number) => boolean
    date: (value: any) => boolean
    phone: (value: string) => boolean
    url: (value: string) => boolean
  }
}

// Email regex pattern
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Phone pattern (allows various formats)
const PHONE_PATTERN = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/

// URL pattern
const URL_PATTERN = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/

export function useLocalizedValidation(): UseLocalizedValidationReturn {
  const t = useTranslations('validation')
  const tFields = useTranslations('fieldNames')

  const validators = useMemo(() => ({
    required: (value: any): boolean => {
      if (value === null || value === undefined) return false
      if (typeof value === 'string') return value.trim().length > 0
      if (Array.isArray(value)) return value.length > 0
      return true
    },

    email: (value: string): boolean => {
      if (!value) return true // Let required handle empty values
      return EMAIL_PATTERN.test(value)
    },

    minLength: (value: string, min: number): boolean => {
      if (!value) return true
      return value.length >= min
    },

    maxLength: (value: string, max: number): boolean => {
      if (!value) return true
      return value.length <= max
    },

    pattern: (value: string, pattern: RegExp): boolean => {
      if (!value) return true
      return pattern.test(value)
    },

    number: (value: any): boolean => {
      if (value === '' || value === null || value === undefined) return true
      return !isNaN(Number(value))
    },

    positive: (value: number): boolean => {
      if (value === null || value === undefined) return true
      return Number(value) > 0
    },

    integer: (value: number): boolean => {
      if (value === null || value === undefined) return true
      return Number.isInteger(Number(value))
    },

    min: (value: number, min: number): boolean => {
      if (value === null || value === undefined) return true
      return Number(value) >= min
    },

    max: (value: number, max: number): boolean => {
      if (value === null || value === undefined) return true
      return Number(value) <= max
    },

    date: (value: any): boolean => {
      if (!value) return true
      const date = new Date(value)
      return !isNaN(date.getTime())
    },

    phone: (value: string): boolean => {
      if (!value) return true
      return PHONE_PATTERN.test(value)
    },

    url: (value: string): boolean => {
      if (!value) return true
      return URL_PATTERN.test(value)
    },
  }), [])

  const getFieldName = (fieldKey: string): string => {
    try {
      return tFields(fieldKey as any)
    } catch {
      // If field key not found, return the key with first letter capitalized
      return fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1)
    }
  }

  const validate = (value: any, rules: ValidationRule[], fieldKey?: string): string | null => {
    const fieldName = fieldKey ? getFieldName(fieldKey) : 'Field'

    for (const rule of rules) {
      switch (rule.type) {
        case 'required':
          if (!validators.required(value)) {
            return t('required', { field: fieldName })
          }
          break

        case 'email':
          if (!validators.email(value)) {
            return t('email')
          }
          break

        case 'minLength':
          if (!validators.minLength(value, rule.min)) {
            return t('minLength', { field: fieldName, min: rule.min })
          }
          break

        case 'maxLength':
          if (!validators.maxLength(value, rule.max)) {
            return t('maxLength', { field: fieldName, max: rule.max })
          }
          break

        case 'pattern':
          if (!validators.pattern(value, rule.pattern)) {
            return rule.message || t('pattern', { field: fieldName })
          }
          break

        case 'number':
          if (!validators.number(value)) {
            return t('number')
          }
          break

        case 'positive':
          if (!validators.positive(value)) {
            return t('positive')
          }
          break

        case 'integer':
          if (!validators.integer(value)) {
            return t('integer')
          }
          break

        case 'min':
          if (!validators.min(value, rule.min)) {
            return t('min', { field: fieldName, min: rule.min })
          }
          break

        case 'max':
          if (!validators.max(value, rule.max)) {
            return t('max', { field: fieldName, max: rule.max })
          }
          break

        case 'date':
          if (!validators.date(value)) {
            return t('date')
          }
          break

        case 'dateRange':
          if (rule.startDate && rule.endDate && rule.endDate <= rule.startDate) {
            return t('dateRange')
          }
          break

        case 'phone':
          if (!validators.phone(value)) {
            return t('phone')
          }
          break

        case 'url':
          if (!validators.url(value)) {
            return t('url')
          }
          break

        case 'match':
          if (value !== rule.otherValue) {
            const otherFieldName = getFieldName(rule.other)
            return t('match', { field: fieldName, other: otherFieldName })
          }
          break

        case 'custom':
          if (!rule.validate(value)) {
            return rule.message
          }
          break
      }
    }

    return null
  }

  const validateField = (value: any, fieldValidation: FieldValidation): string | null => {
    return validate(value, fieldValidation.rules, fieldValidation.fieldKey || fieldValidation.field)
  }

  const validateForm = (values: Record<string, any>, validations: FieldValidation[]): ValidationResult => {
    const errors: Record<string, string> = {}

    for (const validation of validations) {
      const value = values[validation.field]
      const error = validateField(value, validation)

      if (error) {
        errors[validation.field] = error
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    }
  }

  return {
    validate,
    validateField,
    validateForm,
    getFieldName,
    validators
  }
}

// Helper function to create common validation rules
export const validationRules = {
  required: (): ValidationRule => ({ type: 'required' }),
  email: (): ValidationRule => ({ type: 'email' }),
  minLength: (min: number): ValidationRule => ({ type: 'minLength', min }),
  maxLength: (max: number): ValidationRule => ({ type: 'maxLength', max }),
  pattern: (pattern: RegExp, message?: string): ValidationRule => ({ type: 'pattern', pattern, message }),
  number: (): ValidationRule => ({ type: 'number' }),
  positive: (): ValidationRule => ({ type: 'positive' }),
  integer: (): ValidationRule => ({ type: 'integer' }),
  min: (min: number): ValidationRule => ({ type: 'min', min }),
  max: (max: number): ValidationRule => ({ type: 'max', max }),
  date: (): ValidationRule => ({ type: 'date' }),
  phone: (): ValidationRule => ({ type: 'phone' }),
  url: (): ValidationRule => ({ type: 'url' }),
  match: (other: string, otherValue: string): ValidationRule => ({ type: 'match', other, otherValue }),
  custom: (validate: (value: any) => boolean, message: string): ValidationRule => ({ type: 'custom', validate, message }),
}
