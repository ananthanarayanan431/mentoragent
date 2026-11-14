/**
 * The mentor agent's REST contract, generated from its OpenAPI document
 * (agents/mentor_agent, `make openapi`). Import request and response shapes from
 * here instead of declaring them by hand, so a backend change that breaks the web
 * app fails type-checking.
 */
import type { components } from './schema'

export type { components, paths } from './schema'

type Schemas = components['schemas']

export type MentorOut = Schemas['MentorOut']
export type ChatRequest = Schemas['ChatRequest']
export type ChatResponse = Schemas['ChatResponse']
export type ResetMemoryResponse = Schemas['ResetMemoryResponse']
export type HealthResponse = Schemas['HealthResponse']
export type MentorUpdate = Schemas['MentorUpdate']
export type MentorCreate = Schemas['MentorCreate']
export type MentorSources = Schemas['MentorSources']
export type PoolOut = Schemas['PoolOut']
