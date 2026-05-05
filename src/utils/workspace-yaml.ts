export function parseWorkspaceYamlContent(content: string): string[] {
    const directories: string[] = [];
    let inPackagesSection = false;

    for (const line of content.split('\n')) {
        const trimmed = line.trim();

        if (trimmed === 'packages:') {
            inPackagesSection = true;
            continue;
        }

        if (
            inPackagesSection &&
            trimmed &&
            !line.startsWith(' ') &&
            !line.startsWith('\t') &&
            !trimmed.startsWith('-')
        ) {
            break;
        }

        if (inPackagesSection && trimmed.startsWith('-')) {
            const entry = trimmed
                .slice(1)
                .trim()
                .replace(/^["']|["']$/g, '')
                .replace(/^\.\//, '')
                .replace(/\/\*.*$/, '');

            if (entry && !entry.startsWith('.')) {
                directories.push(entry);
            }
        }
    }

    return directories;
}
