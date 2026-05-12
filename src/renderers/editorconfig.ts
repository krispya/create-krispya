import { defaultFormatterMetaConfig } from '../defaults/formatter.js';
import type { FormatterMetaConfig, VirtualFile } from '../types.js';

export function renderEditorConfig(
  config: FormatterMetaConfig = defaultFormatterMetaConfig
): VirtualFile {
  const indentStyle = config.useTabs ? 'tab' : 'space';
  const indentSize = config.useTabs ? 'tab' : String(config.tabWidth);

  return {
    type: 'text',
    content: [
      'root = true',
      '',
      '[*]',
      'charset = utf-8',
      'end_of_line = lf',
      'insert_final_newline = true',
      `indent_style = ${indentStyle}`,
      `indent_size = ${indentSize}`,
      `tab_width = ${config.tabWidth}`,
      `max_line_length = ${config.printWidth}`,
    ].join('\n'),
  };
}

export function renderVscodeEditorSettings(
  config: FormatterMetaConfig = defaultFormatterMetaConfig
): Record<string, unknown> {
  return {
    'editor.detectIndentation': false,
    'editor.insertSpaces': !config.useTabs,
    'editor.tabSize': config.tabWidth,
    'files.eol': '\n',
    'files.insertFinalNewline': true,
  };
}
