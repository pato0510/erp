import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CORS_METHODS } from './cors-methods';

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('COM-023-B CORS methods', () => {
  it('allows PUT and OPTIONS alongside the existing methods', () => {
    expect(CORS_METHODS).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
  });

  it('covers every explicit HTTP verb used by Nest controllers', () => {
    const httpDecorators = new Set([
      'Get',
      'Post',
      'Put',
      'Patch',
      'Delete',
      'Options',
      'Head',
      'All',
    ]);
    const controllers = controllerFiles(__dirname);
    expect(controllers.length).toBeGreaterThan(0);
    let checkedHandlers = 0;
    for (const path of controllers) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const importedVerbs = new Map<string, string>();
      for (const statement of source.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          statement.moduleSpecifier.text !== '@nestjs/common'
        )
          continue;
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const binding of bindings.elements) {
          const name = (binding.propertyName ?? binding.name).text;
          if (httpDecorators.has(name)) importedVerbs.set(binding.name.text, name.toUpperCase());
        }
      }
      const visit = (node: ts.Node) => {
        if (
          ts.isDecorator(node) &&
          ts.isCallExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression)
        ) {
          const verb = importedVerbs.get(node.expression.expression.text);
          if (verb) {
            checkedHandlers += 1;
            // @All also fails this gate: a wildcard needs an explicit CORS policy review.
            expect({ controller: path, verb, allowed: CORS_METHODS.includes(verb) }).toMatchObject({
              allowed: true,
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(checkedHandlers).toBeGreaterThan(0);
  });
});
