
import { MethodDeclaration, Node, CallExpression } from 'ts-morph';

export class PolicyGenerator {
  /**
   * Generates Row Level Security (RLS) SQL policies from a method decorated with @Security.Policy.
   */
  generate(method: MethodDeclaration): string {
    // Find the @Security.Policy or @Policy decorator
    const policyDec = method.getDecorators().find(d => {
        const text = d.getText();
        return text.startsWith('@Security.Policy') || text.startsWith('@Policy');
    });
    
    if (!policyDec) return '';

    const args = policyDec.getArguments();
    const tableArg = args[0]?.getText(); // e.g. SupportTicket
    
    // Infer the table name (simple lowercase + pluralization)
    const tableName = 'public.' + this.toSnakeCase(tableArg || '') + 's';

    const commands: string[] = [];
    // Always ensure RLS is enabled on the target table
    commands.push(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);

    // The method body is expected to contain a fluent chain: policy.allow...().to().using()
    const body = method.getBody();
    if (!body || !Node.isBlock(body)) return '';

    body.getStatements().forEach((stmt: Node) => {
        if (Node.isExpressionStatement(stmt)) {
            const expr = stmt.getExpression();
            if (Node.isCallExpression(expr)) {
                // Transpile the fluent chain into a CREATE POLICY statement
                const policySql = this.transpilePolicyChain(expr, tableName);
                if (policySql) {
                    commands.push(policySql);
                }
            }
        }
    });

    return commands.join('\n\n');
  }

  /**
   * Navigates the fluent method chain (nested CallExpressions) to extract policy details.
   */
  private transpilePolicyChain(call: CallExpression, tableName: string): string {
      let current: CallExpression | undefined = call;
      let usingClause = '';
      let roles: string[] = [];
      let cmdType = '';
      let policyName = '';
      
      // Unwind the chain: using() -> to() -> allowSelect()
      while (current && Node.isCallExpression(current)) {
          const expr = current.getExpression();
          if (!Node.isPropertyAccessExpression(expr)) break;
          
          const method = expr.getName(); 
          const args = current.getArguments();
          
          if (method === 'using') {
              const func = args[0];
              if (Node.isArrowFunction(func)) {
                  // Transpile the boolean logic inside .using(row => ...)
                  usingClause = this.transpileUsing(func.getBody() as Node, func.getParameters()[0].getName());
              }
          } else if (method === 'to') {
              args.forEach(arg => {
                  // Extract role names: Role.Authenticated -> authenticated
                  const role = arg.getText().split('.').pop()?.toLowerCase();
                  if (role) roles.push(role);
              });
          } else if (method.startsWith('allow')) {
              // Extract the SQL command: allowSelect -> SELECT
              if (method === 'allowSelect') cmdType = 'SELECT';
              if (method === 'allowInsert') cmdType = 'INSERT';
              if (method === 'allowUpdate') cmdType = 'UPDATE';
              if (method === 'allowDelete') cmdType = 'DELETE';
              
              const nameArg = args[0];
              if (nameArg) {
                  // Extract the policy name: "Owner Read" -> owner_read
                  policyName = nameArg.getText().replace(/['"]/g, '').toLowerCase().replace(/ /g, '_');
              }
          }

          // Move up to the next member in the call chain
          const expression = current.getExpression();
          if (Node.isPropertyAccessExpression(expression)) {
            const sub = expression.getExpression();
            if (Node.isCallExpression(sub)) {
                current = sub;
            } else {
                current = undefined; 
            }
        } else {
             current = undefined;
        }
      }

      if (!policyName || !cmdType) return '';

      return `DROP POLICY IF EXISTS ${policyName} ON ${tableName};

CREATE POLICY ${policyName} 
ON ${tableName}
FOR ${cmdType}
TO ${roles.join(', ')}
USING (
    (${usingClause})
);`;
  }

  /**
   * Transpiles the arrow function body of a .using() call into a SQL expression.
   */
  private transpileUsing(body: Node, alias: string): string {
      let text = body.getText();
      
      // Basic operator mapping
      text = text.replace(/===/g, '=');
      text = text.replace(/!==/g, '<>');
      text = text.replace(/&&/g, 'AND');
      text = text.replace(/\|\|/g, 'OR');
      
      // Map property access: t.creatorId -> creator_id
      text = text.replace(new RegExp(`${alias}\\.([a-zA-Z0-9]+)`, 'g'), (_, prop) => {
          return this.toSnakeCase(prop);
      });

      // Map security helpers: sql.auth.userId() -> auth.uid()
      text = text.replace(/sql\.auth\.userId[^)]*\)/g, 'auth.uid()');

      return text;
  }

  private toSnakeCase(str: string): string {
      return str.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, '');
  }
}
