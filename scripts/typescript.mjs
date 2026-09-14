import path from "node:path";
import process from "node:process";

import ts from "typescript";

export const root = process.cwd();

export function compile(configPath, options = {}) {
  const absoluteConfigPath = path.join(root, configPath);
  const configFile = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(absoluteConfigPath),
    options,
    absoluteConfigPath,
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const emitResult = program.emit();
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    });
    throw new Error(formatted);
  }
}
