// vinext's fetch-handler declaration imports this generated Vite module.
// Its public tarball omits the virtual module's declaration.
declare module 'virtual:vinext-worker-entry' {
  const handler: ExportedHandler<import('./lib/server/env').Env>
  export default handler
}
