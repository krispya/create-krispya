function validateNameSegment(segment: string, label: string): string | undefined {
    if (!segment.length) {
        return `${label} is required`;
    }

    if (!/^[a-z0-9-]+$/.test(segment)) {
        return `${label} must be lowercase and contain only letters, numbers, and hyphens`;
    }

    if (segment.startsWith('-') || segment.endsWith('-')) {
        return `${label} cannot start or end with a hyphen`;
    }

    if (segment.includes('--')) {
        return `${label} cannot contain consecutive hyphens`;
    }

    return undefined;
}

export function validatePackageName(name: string): string | undefined {
    if (!name.length) {
        return 'Package name is required';
    }

    if (name.includes('..') || name.includes('\\')) {
        return 'Package name cannot contain path traversal sequences';
    }

    if (name.startsWith('@')) {
        const slashIndex = name.indexOf('/');
        if (slashIndex === -1) {
            return 'Scoped package name must include a package name after the scope (e.g., @scope/name)';
        }

        if (name.indexOf('/', slashIndex + 1) !== -1) {
            return 'Package name can only have one slash for scoped packages';
        }

        const scope = name.slice(1, slashIndex);
        const packageName = name.slice(slashIndex + 1);

        const scopeError = validateNameSegment(scope, 'Scope');
        if (scopeError) return scopeError;

        const nameError = validateNameSegment(packageName, 'Package name');
        if (nameError) return nameError;

        return undefined;
    }

    if (name.includes('/')) {
        return 'Unscoped package name cannot contain slashes. Use @scope/name format for scoped packages';
    }

    return validateNameSegment(name, 'Package name');
}
