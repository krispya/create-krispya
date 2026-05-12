export function merge(target: any, modification: any) {
  const targetLabel = JSON.stringify(target);
  const modificationLabel = JSON.stringify(modification);

  if (modification == null) {
    throw new Error(`Cannot merge "${modificationLabel}" modification into target "${targetLabel}"`);
  }
  if (target == null) {
    return modification;
  }
  if (Array.isArray(target)) {
    if (!Array.isArray(modification)) {
      throw new Error(
        `Cannot merge non-array modification "${modificationLabel}" into array target "${targetLabel}"`
      );
    }
    return [...target, ...modification];
  }
  if (typeof target === 'object') {
    if (typeof modification !== 'object') {
      throw new Error(
        `Cannot merge non-object modification "${modificationLabel}" into object target "${targetLabel}"`
      );
    }
    const result = { ...target };
    for (const modificationKey in modification) {
      result[modificationKey] = merge(target[modificationKey], modification[modificationKey]);
    }
    return result;
  }
  console.warn(`target "${targetLabel}" is overwritten with modification "${modificationLabel}"`);
  return modification;
}
