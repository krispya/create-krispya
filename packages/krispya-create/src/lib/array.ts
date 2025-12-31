export function unique<T>(...array: T[][]): T[] {
  const set = new Set<T>()

  for (const arr of array) {
    for (const item of arr) {
      set.add(item)
    }
  }

  return Array.from(set)
}
