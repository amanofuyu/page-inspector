export function formatBytes(bytes: number | null | undefined) {
  return bytes == null ? '未知' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1048576).toFixed(2)} MiB`
}
