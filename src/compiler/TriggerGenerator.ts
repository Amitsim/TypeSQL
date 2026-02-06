
import { MethodDeclaration, Node, SyntaxKind, CallExpression, BinaryExpression, ThrowStatement, IfStatement, ClassDeclaration } from 'ts-morph';

export class TriggerGenerator {
  generate(method: MethodDeclaration): string {
    const triggerDec = method.getDecorator('Trigger');
    if (!triggerDec) return '';

    const args = triggerDec.getArguments(); // { on: Comment, when: Event.BeforeInsert }
    const argText = args[0]?.getText() || '';
    
    // Extract Table Name and Event
    const onMatch = argText.match(/on:\s*([A-Za-z0-9_]+)/);
    const whenMatch = argText.match(/when:\s*Event\.([A-Za-z]+)/);
    
    const className = onMatch ? onMatch[1] : 'unknown';
    // Simplified table name guess (pluralize or snake case)
    const tableName = 'public.' + className.toLowerCase() + 's'; 
    const eventName = whenMatch ? whenMatch[1].replace(/([A-Z])/g, ' $1').trim().toUpperCase() : 'BEFORE INSERT';
    
    const parent = method.getParent();
    const parentClass = Node.isClassDeclaration(parent) ? parent : undefined;
    
    const funcName = `public.${parentClass?.getName()?.toLowerCase() || 'func'}_${method.getName()}`;
    const triggerName = `on_${className.toLowerCase()}_${method.getName()}`;

    
    // Transpile Body
    const bodyText = this.transpileBody(method);

    return `
CREATE FUNCTION ${funcName}()
 RETURNS trigger AS $function$
DECLARE
${this.declarations.join('\n    ')}
BEGIN
${bodyText}
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName} 
${eventName} ON ${tableName} 
FOR EACH ROW EXECUTE FUNCTION ${funcName}();
`.trim();
  }

  private declarations: string[] = [];

  private transpileBody(method: MethodDeclaration): string {
    this.declarations = [];
    const block = method.getBody();
    if (!block || !Node.isBlock(block)) return '';

    const statements: string[] = [];
    
    block.getStatements().forEach((stmt: Node) => {
        if (Node.isVariableStatement(stmt)) {
            const declList = stmt.getDeclarationList();
            declList.getDeclarations().forEach(decl => {
                const name = decl.getName();
                const init = decl.getInitializer();
                
                // Check if it's a sql.from(...) call
                if (init && Node.isCallExpression(init)) {
                   if (this.isSqlFrom(init)) {
                       const sql = this.transpileQuery(init, name);
                       statements.push(sql);
                       // Add to declarations (assuming integer for count for now)
                       this.declarations.push(`${this.toSnakeCase(name)} integer;`);
                   }
                }
            });
        } else if (Node.isIfStatement(stmt)) {
            statements.push(this.transpileIf(stmt));
        }
    });

    return statements.map(s => '    ' + s).join('\n');
  }

  private isSqlFrom(node: CallExpression): boolean {
    const text = node.getText();
    return text.includes('sql.from');
  }

  private transpileQuery(node: CallExpression, targetVar: string): string {
    // Expecting: sql.from(Comment).where(...).count()
    // AST structure is nested calls. count() -> where() -> from()
    
    // Simple text search for prototype
    const text = node.getText();
    
    // Extract WHERE clause
    // This is hard to do robustly with Regex on the full text, need to walk up the chain
    let current: CallExpression | undefined = node;
    let whereClause = '';
    
    while(current && Node.isCallExpression(current)) {
        const expr = current.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
             const name = expr.getName();
             if (name === 'where') {
                 const arg = current.getArguments()[0];
                 if (Node.isArrowFunction(arg)) {
                     whereClause = this.transpileWhere(arg.getBody() as Node, arg.getParameters()[0].getName());
                 }
             }
        }
        
        // Go to child (the thing being called) - wait, call expression structure is explicit.
        // sql.from().where().count() -> count is the outer call. expression is (sql.from().where()).count
        const expression = current.getExpression();
        if (Node.isPropertyAccessExpression(expression)) {
            const sub = expression.getExpression(); // this is the object being called on
            if (Node.isCallExpression(sub)) {
                current = sub;
            } else {
                current = undefined;
            }
        } else {
             current = undefined;
        }
    }
    
    // Assume it's always count(*) for now based on example
    
    // Extract table name from sql.from(Table)
    const matches = text.match(/sql\.from\(([A-Za-z0-9_]+)\)/);
    let tableVar = 'comments'; 
    if (matches && matches[1]) {
        tableVar = this.toSnakeCase(matches[1]) + 's'; // simplistic pluralization
    }
    
    // Pass tableVar to transpileWhere effectively by hacking the 'comments' hardcode replacement?
    // No, transpileWhere assumes 'comments'. We need to fix that too.
    
    // Actually, let's fix transpileWhere to accept tableName context if possible, 
    // OR just use the same replacement logic.
    // For now, let's strictly replace the alias.prop with TABLE.col
    
    // RE-process where clause with correct table name if needed? 
    // transpileWhere is doing `comments.col`.
    // We should pass tableVar to transpileWhere.
    
    // Refactoring transpileWhere signature to take tableName
    
    return `SELECT count(*)
    INTO ${this.toSnakeCase(targetVar)}
    FROM public.${tableVar}
    WHERE ${whereClause.replace(/comments\./g, tableVar + '.')};`; 
  }

  private transpileWhere(body: Node, alias: string): string {
     // c.userId === newComment.userId && c.createdAt > sql.now().minus('1 minute')
     // Transpile to SQL boolean expression
     let text = body.getText();
     
     // Replace '===' with '='
     text = text.replace(/===/g, '=');
     
     // Replace '&&' with 'AND'
     text = text.replace(/&&/g, 'AND');
     
     // Replace '||' with 'OR'
     text = text.replace(/\|\|/g, 'OR');

     // Replace alias.prop with table.col
     // Need to map camelCase props to snake_case cols
     // And handle 'newComment' -> 'NEW'
     
     // Regex replacements for the demo
     // c.userId -> comments.user_id
     text = text.replace(new RegExp(`${alias}\\.([a-zA-Z0-9]+)`, 'g'), (_, prop) => {
         return `comments.${this.toSnakeCase(prop)}`;
     });

     // Generic NEW/OLD replacement
     text = text.replace(/([a-zA-Z0-9]+)\.([a-zA-Z0-9]+)/g, (match, varName, prop) => {
         if (varName === alias) return match; // already handled
         if (varName.startsWith('new')) return `NEW.${this.toSnakeCase(prop)}`;
         if (varName.startsWith('old')) return `OLD.${this.toSnakeCase(prop)}`;
         // Skip SQL helpers
         if (varName === 'sql') return match; 
         return match;
     });
     
     // Replace !== with <>
     text = text.replace(/!==/g, '<>');

     // sql.now().minus('1 minute') -> (now() - '1 minute'::interval)
     text = text.replace(/sql\.now\(\)\.minus\((['"][^'"]+['"])\)/g, (match, interval) => {
        return `(now() - ${interval.replace(/"/g, "'")}::interval)`;
     });

     return text;
  }

  private transpileIf(stmt: IfStatement): string {
     const expression = stmt.getExpression();
     let condition = expression.getText();
     
     // variable name mapping
     condition = condition.replace(/([a-zA-Z0-9]+)/g, (match) => {
        // if it matches a known variable, snake_case it? 
        // For now, assume variables defined in the function needs snake_casing
        // Getting context is hard, doing simple heuristic
        if (match === 'recentCount') return 'recent_count';
        return match;
     });
     
     const thenBlock = stmt.getThenStatement();
     let inner = '';
     if (Node.isBlock(thenBlock)) {
         thenBlock.getStatements().forEach(s => {
             if (Node.isThrowStatement(s)) {
                 const expr = s.getExpression(); // new Error("Slow down!")
                 if (Node.isNewExpression(expr)) {
                     let msg = expr.getArguments()[0]?.getText();
                     // Convert double quotes to single quotes for SQL
                     if (msg) msg = msg.replace(/"/g, "'");
                     inner += `RAISE EXCEPTION ${msg};\n`;
                 }
             }
         });
     }

     return `IF (${condition}) THEN\n        ${inner}    END IF;`;
  }

  private toSnakeCase(str: string): string {
      return str.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, '');
  }
}
