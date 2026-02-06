
import { Project } from 'ts-morph';
import { SchemaGenerator } from './SchemaGenerator';
import { TriggerGenerator } from './TriggerGenerator';
import { PolicyGenerator } from './PolicyGenerator';

export class TypeSqlCompiler {
  private project: Project;
  private schemaGen = new SchemaGenerator();
  private triggerGen = new TriggerGenerator();
  private policyGen = new PolicyGenerator();

  constructor() {
    // Initialize the ts-morph project using the local tsconfig.json.
    this.project = new Project({
        tsConfigFilePath: "tsconfig.json",
        skipAddingFilesFromTsConfig: true
    });
  }

  /**
   * Adds source files to the compiler project for analysis.
   */
  addFiles(filePaths: string[]) {
      this.project.addSourceFilesAtPaths(filePaths);
  }

  /**
   * Orchestrates the compilation of all loaded TypeScript files into a single SQL migration string.
   */
  compile(): string {
    const tables: string[] = [];
    const triggers: string[] = [];
    const policies: string[] = [];

    const sourceFiles = this.project.getSourceFiles();

    // Iterate through all classes in all source files to generate SQL components.
    sourceFiles.forEach(file => {
      file.getClasses().forEach(cls => {
        // 1. Generate Schema (Tables)
        const tableSql = this.schemaGen.generate(cls);
        if (tableSql) {
            tables.push(`-- TypeSQL: ${cls.getName()} (${file.getBaseName()})\n${tableSql}`);
        }

        // 2. Generate Logic (Triggers) and Security (Policies) from static methods
        cls.getStaticMethods().forEach(method => {
            // Check if method defines a database trigger
            const triggerSql = this.triggerGen.generate(method);
            if (triggerSql) {
                triggers.push(`-- TypeSQL Trigger: ${method.getName()}\n${triggerSql}`);
            }
            
            // Check if method defines a security policy
            const policySql = this.policyGen.generate(method);
             if (policySql) {
                policies.push(`-- TypeSQL Policy: ${method.getName()}\n${policySql}`);
            }
        });
      });
    });

    let sqlOutput = "-- TypeSQL Generated Migration\n\n";

    // Injection: Infrastructure/Boilerplate for environment compatibility
    sqlOutput += `DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN 
    CREATE ROLE authenticated; 
  END IF; 
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN 
    CREATE ROLE anon; 
  END IF; 
END $$;

-- Mock for Supabase auth.uid() schema/functionality for local testing
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS text AS $$ SELECT '00000000-0000-0000-0000-000000000000'; $$ LANGUAGE sql;
\n\n`;

    // Assembly: Order is critical for dependency resolution (Tables -> Logic -> Policies)
    sqlOutput += tables.join('\n\n') + '\n\n';
    sqlOutput += triggers.join('\n\n') + '\n\n';
    sqlOutput += policies.join('\n\n');

    return sqlOutput;
  }
}
