import { toast } from 'sonner'

/** Event callbacks stay synchronous while every asynchronous failure is reported. */
export function perform(operation: Promise<unknown>, loadError: string): void {
  operation.catch((error: unknown) => {
    toast.error(error instanceof Error ? error.message : loadError)
  })
}
