import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

import knowledge from './knowledge'
import task from './task'
import skill from './skill'
import message from './message'
import admin from './admin'
import type { EntryType } from './common'

export const MAX_PAYLOAD_BYTES = 64 * 1024

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

export const validators: Record<EntryType, ValidateFunction> = {
  knowledge: ajv.compile(knowledge),
  task: ajv.compile(task),
  skill: ajv.compile(skill),
  message: ajv.compile(message),
  admin: ajv.compile(admin),
}

export type ValidationReason = 'not-an-object' | 'unknown-type' | 'schema' | 'payload-too-large'

export interface ValidationOk {
  valid: true
}

export interface ValidationFail {
  valid: false
  reason: ValidationReason
  errors?: ErrorObject[] | null
  payloadSize?: number
}

export type ValidationResult = ValidationOk | ValidationFail

export function validate(entry: unknown): ValidationResult {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, reason: 'not-an-object' }
  }
  const e = entry as { type?: string; payload?: unknown }
  const v = e.type ? validators[e.type as EntryType] : undefined
  if (!v) return { valid: false, reason: 'unknown-type' }
  if (!v(entry)) return { valid: false, reason: 'schema', errors: v.errors }

  const payloadSize = Buffer.byteLength(JSON.stringify(e.payload), 'utf8')
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    return { valid: false, reason: 'payload-too-large', payloadSize }
  }

  return { valid: true }
}

export const schemas = { knowledge, task, skill, message, admin }
