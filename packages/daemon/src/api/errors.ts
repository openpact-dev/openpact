import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export class HttpError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'HttpError'
  }
}

export interface ErrorEnvelope {
  error: string
  message: string
  status: number
}

export function envelope(status: number, code: string, message: string): ErrorEnvelope {
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
  // Fastify's request validation errors carry a `validation` array.
  const fastifyErr = err as FastifyError
  if (fastifyErr.validation) {
    return reply.status(400).send(envelope(400, 'BAD_REQUEST', err.message))
  }
  if (fastifyErr.statusCode === 404) {
    return reply.status(404).send(envelope(404, 'NOT_FOUND', err.message))
  }
  req.log.error({ err }, 'unhandled error in API')
  return reply.status(500).send(envelope(500, 'INTERNAL', 'internal daemon error'))
}
