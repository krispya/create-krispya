export function merge(target: any, modification: any) {
  if (modification == null) {
    throw new Error(`Cannot merge "${modification}" modification into target "${target}"`)
  }
  if (target == null) {
    return modification
  }
  if (Array.isArray(target)) {
    if (!Array.isArray(modification)) {
      throw new Error(`Cannot merge non-array modification "${modification}" into array target "${target}"`)
    }
    return [...target, ...modification]
  }
  if (typeof target === 'object') {
    if (typeof modification != 'object') {
      throw new Error(`Cannot merge non-object modification "${modification}" into object target "${target}"`)
    }
    const result = { ...target }
    for (const modificationKey in modification) {
      result[modificationKey] = merge(target[modificationKey], modification[modificationKey])
    }
    return result
  }
  console.warn(`target "${target}" is overwritten with modification "${modification}"`)
  return modification
}
