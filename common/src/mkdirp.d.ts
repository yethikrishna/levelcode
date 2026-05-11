declare namespace mkdirp {
  function sync(dir: string, opts?: { mode?: string | number }): string
}
declare module 'mkdirp' {
  export = mkdirp
}