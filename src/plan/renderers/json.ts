export type RenderJsonOptions = {
  inlineArrays?: boolean;
  printWidth?: number;
};

export function renderJson(value: unknown, options: RenderJsonOptions = {}): string {
  const json = JSON.stringify(value, null, 2);
  const content = options.inlineArrays === false ? json : inlinePrimitiveArrays(json, options);

  return `${content}\n`;
}

function inlinePrimitiveArrays(json: string, options: RenderJsonOptions): string {
  const printWidth = options.printWidth ?? 102;
  const lines = json.split('\n');
  const output: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const openIndex = line.indexOf('[');

    if (openIndex === -1 || line.slice(openIndex).trim() !== '[') {
      output.push(line);
      continue;
    }

    const items: string[] = [];
    let cursor = index + 1;
    let closingComma = '';

    for (; cursor < lines.length; cursor++) {
      const item = lines[cursor]!.trim();
      const closingMatch = item.match(/^\](,?)$/);

      if (closingMatch) {
        closingComma = closingMatch[1] ?? '';
        break;
      }

      if (!/^(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null),?$/.test(item)) {
        items.length = 0;
        break;
      }

      items.push(item.replace(/,$/, ''));
    }

    if (items.length === 0 || cursor >= lines.length) {
      output.push(line);
      continue;
    }

    const nextLine = `${line.slice(0, openIndex)}[${items.join(', ')}]${closingComma}`;
    if (nextLine.length > printWidth) {
      output.push(line);
      continue;
    }

    output.push(nextLine);
    index = cursor;
  }

  return output.join('\n');
}
