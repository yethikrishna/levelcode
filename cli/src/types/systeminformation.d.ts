/**
 * Minimal type declarations for the optional `systeminformation` dependency.
 * This module is dynamically imported and may not be installed.
 */
declare module 'systeminformation' {
  export function system(): Promise<{
    manufacturer: string
    model: string
    serial: string
    uuid: string
  }>
  export function cpu(): Promise<{
    manufacturer: string
    brand: string
    cores: number
    physicalCores: number
  }>
  export function osInfo(): Promise<{
    platform: string
    distro: string
    arch: string
    hostname: string
  }>
}
