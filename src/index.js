const fs = require('fs').promises;
const path = require('path');
const typescript = require('typescript');
const stripComments = require('strip-comments');

const { inspect } = require('util');

const theDecoratorFinder = new RegExp(
  /((?<![\(\s]\s*['"])@\w*[\w\d]\s*(?![;])[\((?=\s)])/
);

const theSatisfiesFinder = new RegExp(
  /((?<![\(\s]\s*['"])satisfies\s\w+)/
);

const findBetaFeatures = (fileContent) => {
  const fileContent_no_comments = stripComments(fileContent)
  if (theDecoratorFinder.test(fileContent_no_comments)) return true;
  if (theSatisfiesFinder.test(fileContent_no_comments)) return true;
  return false;
}
  

const esbuildPluginTsc = ({
  tsconfigPath = path.join(process.cwd(), './tsconfig.json'),
  force: forceTsc = true,
  tsx = true,
} = {}) => ({
  name: 'tsc',
  setup(build) {
    let parsedTsConfig = null;

    build.onLoad({ filter: tsx ? /\.tsx?$/ : /\.ts$/ }, async (args) => {
      if (!parsedTsConfig) {
        parsedTsConfig = parseTsConfig(tsconfigPath, process.cwd());
        if (parsedTsConfig.sourcemap) {
          parsedTsConfig.sourcemap = false;
          parsedTsConfig.inlineSources = true;
          parsedTsConfig.inlineSourceMap = true;
        }
      }

      // Just return if we don't need to search the file.
      /*
      if (
        !forceTsc &&
        (!parsedTsConfig ||
          !parsedTsConfig.options ||
          !parsedTsConfig.options.emitDecoratorMetadata)
      ) {
        return;
      }
      */

      const ts = await fs
        .readFile(args.path, 'utf8')
        .catch((err) => printDiagnostics({ file: args.path, err }));

      // Find the decorator and if there isn't one, return out
      const hasDecorator = findBetaFeatures(ts);
      if (!hasDecorator) {
        return;
      }

      const program = typescript.transpileModule(ts, { compilerOptions: parsedTsConfig.options });
      return { contents: program.outputText };
    });
  },
});

function parseTsConfig(tsconfig, cwd = process.cwd()) {
  const fileName = typescript.findConfigFile(
    cwd,
    typescript.sys.fileExists,
    tsconfig
  );

  // if the value was provided, but no file, fail hard
  if (tsconfig !== undefined && !fileName)
    throw new Error(`failed to open '${fileName}'`);

  let loadedConfig = {};
  let baseDir = cwd;
  let configFileName;
  if (fileName) {
    const text = typescript.sys.readFile(fileName);
    if (text === undefined) throw new Error(`failed to read '${fileName}'`);

    const result = typescript.parseConfigFileTextToJson(fileName, text);

    if (result.error !== undefined) {
      printDiagnostics(result.error);
      throw new Error(`failed to parse '${fileName}'`);
    }

    loadedConfig = result.config;
    baseDir = path.dirname(fileName);
    configFileName = fileName;
  }

  const parsedTsConfig = typescript.parseJsonConfigFileContent(
    loadedConfig,
    typescript.sys,
    baseDir
  );

  if (parsedTsConfig.errors[0]) printDiagnostics(parsedTsConfig.errors);

  return parsedTsConfig;
}

function printDiagnostics(...args) {
  console.log(inspect(args, false, 10, true));
}

const thisModule = (module.exports = esbuildPluginTsc);
thisModule.esbuildPluginTsc = esbuildPluginTsc;
