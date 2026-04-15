import fastify, { type FastifyInstance } from 'fastify'
import type { Daemon } from '../daemon'
import { errorHandler, envelope } from './errors'
import pingRoute from './routes/ping'
import statusRoute from './routes/status'
import peersRoute from './routes/peers'
import knowledgeRoute from './routes/knowledge'
import messagesRoute from './routes/messages'
import skillsRoute from './routes/skills'
import tasksRoute from './routes/tasks'
import adminRoute from './routes/admin'
import entriesRoute from './routes/entries'
import eventsRoute from './routes/events'

export { HttpError, type ErrorEnvelope } from './errors'
export { bind, DEFAULT_PORT, type BindOpts } from './bind'

export interface ApiOpts {
  logger?: boolean | object
}

export function createApi(daemon: Daemon, opts: ApiOpts = {}): FastifyInstance {
  const app = fastify({ logger: opts.logger ?? false })
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(envelope(404, 'NOT_FOUND', `route ${req.method} ${req.url} not found`))
  })
  app.register(pingRoute, { daemon })
  app.register(statusRoute, { daemon })
  app.register(peersRoute, { daemon })
  app.register(knowledgeRoute, { daemon })
  app.register(messagesRoute, { daemon })
  app.register(skillsRoute, { daemon })
  app.register(tasksRoute, { daemon })
  app.register(adminRoute, { daemon })
  app.register(entriesRoute, { daemon })
  app.register(eventsRoute, { daemon })
  return app
}
