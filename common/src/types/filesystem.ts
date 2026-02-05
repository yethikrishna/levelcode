import type fs from 'fs'

/** File system used for LevelCode SDK.
 *
 * Compatible with `fs.promises` from the `'fs'` module.
 */
export type LevelCodeFileSystem = Pick<
  typeof fs.promises,
  'mkdir' | 'readdir' | 'readFile' | 'stat' | 'writeFile'
>
