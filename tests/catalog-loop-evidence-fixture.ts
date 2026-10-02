import { fixture } from './catalog-loop-fixture'

function requiredMemory(index: number): string {
  const id = fixture.memoryIds[index]
  if (id === undefined) {
    throw new Error('Missing fixture memory')
  }
  return id
}
export { requiredMemory }
