import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { EntryValidationError } from '../pact'
import { ERROR_CODES, type ErrorCode } from '../error-codes'

export class HttpError extends Error {
  status: number
  code: ErrorCode

  constructor(status: number, code: ErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'HttpError'
  }
}

export interface ErrorEnvelope {
  error: ErrorCode
  message: string
  status: number
}

export function envelope(status: number, code: ErrorCode, message: string): ErrorEnvelope {
  return { error: code, message, status }
}

export function errorHandler(
  err: FastifyError | HttpError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (err instanceof HttpError) {
    return reply.status(err.status).send(envelope(err.status, err.code, err.message))
  }
  if (err instanceof EntryValidationError) {
    // Pre-append validation failures map to 400 / 413. This is the
    // "local log stayed clean" path; the wider Autobase-side reducer
    // enforces the same rules on inbound replicated entries.
    if (err.reason === 'payload-too-large') {
      return reply.status(413).send(envelope(413, ERROR_CODES.PAYLOAD_TOO_LARGE, err.message))
    }
    return reply.status(400).send(envelope(400, ERROR_CODES.BAD_ENTRY, err.message))
  }
  // Fastify's request validation errors carry a `validation` array.
  const fastifyErr = err as FastifyError
  if (fastifyErr.validation) {
    return reply.status(400).send(envelope(400, ERROR_CODES.BAD_REQUEST, err.message))
  }
  // @fastify default body-too-large errors.
  if (fastifyErr.statusCode === 413 || fastifyErr.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return reply
      .status(413)
      .send(envelope(413, ERROR_CODES.PAYLOAD_TOO_LARGE, err.message || 'request body too large'))
  }
  if (fastifyErr.statusCode === 404) {
    return reply.status(404).send(envelope(404, ERROR_CODES.NOT_FOUND, err.message))
  }
  // @fastify/rate-limit throws with statusCode=429; errorResponseBuilder
  // gives us the envelope shape, but the error still ends up here.
  if (fastifyErr.statusCode === 429) {
    return reply
      .status(429)
      .send(envelope(429, ERROR_CODES.RATE_LIMITED, err.message || 'rate limit exceeded'))
  }
  req.log.error({ err }, 'unhandled error in API')
  return reply.status(500).send(envelope(500, ERROR_CODES.INTERNAL, 'internal daemon error'))
}
