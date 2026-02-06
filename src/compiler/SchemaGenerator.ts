
import { ClassDeclaration, PropertyDeclaration } from 'ts-morph';

export class SchemaGenerator {
  /**
   * Generates a CREATE TABLE SQL statement from a TypeScript class declaration.
   */
  generate(classDec: ClassDeclaration): string {
    const tableDecorator = classDec.getDecorator('Table');
    if (!tableDecorator) return '';

    const args = tableDecorator.getArguments();
    const tableNameArg = args[0];
    
    // Extract the table name from the @Table({ name: '...' }) decorator.
    const tableName = tableNameArg?.getText().match(/name:\s*['"](.+)['"]/)?.[1];
    
    if (!tableName) return '';

    const columns: string[] = [];
    const storedColumns: { tsName: string, sqlName: string }[] = [];
    let pkeyConstraint = '';

    // Iterate through class properties to identify columns and primary keys.
    classDec.getProperties().forEach(prop => {
      const colDec = prop.getDecorator('Column');
      const pkDec = prop.getDecorator('PrimaryKey');
      
      if (colDec || pkDec) {
        const line = this.generateColumn(prop, !!pkDec);
        if (line) {
             const colName = this.extractColumnName(prop, colDec || pkDec);
             storedColumns.push({ tsName: prop.getName(), sqlName: colName });
             columns.push(line);
             
             // If this property is a primary key, prepare the CONSTRAINT clause.
             if (pkDec) {
                 pkeyConstraint = `CONSTRAINT ${tableName}_pkey PRIMARY KEY (${colName})`;
             }
        }
      }
    });

    if (pkeyConstraint) {
        columns.push(pkeyConstraint);
    }

    return `CREATE TABLE public.${tableName} (\n  ${columns.join(',\n  ')}\n);`;
  }

  /**
   * Resolves the SQL column name from a decorator argument or property name.
   * Maps camelCase property names to snake_case column names.
   */
  private extractColumnName(prop: PropertyDeclaration, decorator: any): string {
      const args = decorator.getArguments();
      const text = args[0]?.getText() || '';
      const match = text.match(/name:\s*['"](.+)['"]/);
      if (match) return match[1];
      
      // Automatic conversion: camelCase -> snake_case
      return prop.getName().replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, '');
  }

  /**
   * Maps a TypeScript property to its SQL column definition (name, type, constraints, defaults).
   */
  private generateColumn(prop: PropertyDeclaration, isPk: boolean): string {
    const type = prop.getType().getText();
    const name = this.extractColumnName(prop, prop.getDecorator('Column') || prop.getDecorator('PrimaryKey'));
    
    // Type Inference: TS -> Postgres
    let sqlType = 'text';
    if (type.includes('number')) sqlType = 'integer';
    if (type.includes('Date')) sqlType = 'timestamp';
    if (type.includes('boolean')) sqlType = 'boolean';
    
    // Check for explicit metadata in decorator arguments
    const dec = prop.getDecorator('Column') || prop.getDecorator('PrimaryKey');
    const args = dec?.getArguments()[0]?.getText() || '';
    
    // Special handling for UUIDs
    if (args.includes('sql.uuid()')) {
        sqlType = 'uuid';
    }
    
    // Handle Default Values
    let def = '';
    if (isPk && args.includes('sql.uuid()')) {
        def = 'DEFAULT gen_random_uuid()';
    } else if (args.includes('default:')) {
        const defaultMatch = args.match(/default:\s*([^,}\s]+)/);
        if (defaultMatch) {
            def = `DEFAULT ${defaultMatch[1]}`;
        }
    }

    const notNull = 'NOT NULL';

    return `${name} ${sqlType} ${notNull} ${def}`.trim();
  }
}
