import * as path from 'node:path';
import ts from 'typescript';

// Resolve metadata types against source symbols, so similarly named local types
// are not mistaken for globals or for public exports.
export function typeReferencesPlugin() {
  const sourcePaths = new WeakMap();
  return {
    name: 'shoelace-type-references',
    moduleLinkPhase({ moduleDoc }) {
      sourcePaths.set(moduleDoc, moduleDoc.path);
    },
    packageLinkPhase({ customElementsManifest }) {
      const config = ts.readConfigFile('tsconfig.prod.json', ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
      const program = ts.createProgram(parsed.fileNames, parsed.options);
      const checker = program.getTypeChecker();
      const entrypoint = program.getSourceFile(path.resolve('src/shoelace.ts'));
      const resolveAlias = symbol =>
        symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(entrypoint));
      const publicNames = new Map(exports.map(symbol => [resolveAlias(symbol), symbol.name]));
      const exportedNames = new Set(exports.map(symbol => symbol.name));

      for (const module of customElementsManifest.modules) {
        const source = program.getSourceFile(path.resolve(sourcePaths.get(module)));
        if (!source) continue;

        function addReferences(value) {
          if (!value || typeof value !== 'object') return;
          if (value.type?.text && !value.type.references?.length) {
            const prefix = 'type CemType = ';
            const fragment = ts.createSourceFile('cem-type.ts', prefix + value.type.text, ts.ScriptTarget.Latest, true);
            const references = [];
            function visit(node) {
              if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
                const name = node.typeName.text;
                const symbol = resolveAlias(checker.resolveName(name, source, ts.SymbolFlags.Type, false));
                const publicName = publicNames.get(symbol);
                const reference = publicName
                  ? { name: publicName, module: 'shoelace.js' }
                  : symbol?.declarations?.length &&
                      symbol.declarations.some(declaration =>
                        program.isSourceFileDefaultLibrary(declaration.getSourceFile())
                      )
                    ? { name, package: 'global:' }
                    : undefined;
                if (reference) {
                  references.push({
                    ...reference,
                    start: node.typeName.getStart(fragment) - prefix.length,
                    end: node.typeName.getEnd() - prefix.length
                  });
                }
              }
              ts.forEachChild(node, visit);
            }
            visit(fragment);
            if (references.length) value.type.references = references;
          }
          for (const child of Object.values(value)) {
            if (Array.isArray(child)) child.forEach(addReferences);
            else if (child && typeof child === 'object') addReferences(child);
          }
        }

        for (const declaration of module.declarations ?? []) {
          for (const event of declaration.events ?? []) {
            // These aliases are already used by the generated React wrappers and
            // exported by shoelace.ts. Keep their precise CustomEvent detail types.
            if (exportedNames.has(event.eventName)) {
              event.type = {
                text: event.eventName,
                references: [{ name: event.eventName, module: 'shoelace.js' }]
              };
            }
          }
        }
        addReferences(module);
      }
    }
  };
}
