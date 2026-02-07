import { createBase2 } from './base2'

const definition = {
  ...createBase2('default', { noAskUser: true }),
  id: 'base2-evals',
  displayName: 'Sage the Evals Orchestrator',
}
export default definition
