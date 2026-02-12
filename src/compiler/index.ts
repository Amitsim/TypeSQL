
import { Project } from 'ts-morph';
import { SchemaGenerator } from './SchemaGenerator';
import { TriggerGenerator } from './TriggerGenerator';
import { PolicyGenerator } from './PolicyGenerator';
import { TypeSqlConfig, defaultConfig, AuthTranspiler } from './AuthConfig';

export class TypeSqlCompiler {
  private project: Project;
  private schemaGen = new SchemaGenerator();
  private triggerGen: TriggerGenerator;
  private policyGen: PolicyGenerator;
  private config: TypeSqlConfig;
  private authTranspiler: AuthTranspiler;

  constructor(config?: Partial<TypeSqlConfig>) {
    // Initialize the ts-morph project using the local tsconfig.json.
    this.project = new Project({
        tsConfigFilePath: "tsconfig.json",
        skipAddingFilesFromTsConfig: true
    });
    
    // Merge user config with defaults
    this.config = { ...defaultConfig, ...config };
    this.authTranspiler = new AuthTranspiler(this.config);
    
    // Inject auth transpiler into generators
    this.triggerGen = new TriggerGenerator(this.authTranspiler);
    this.policyGen = new PolicyGenerator(this.authTranspiler);
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
    sqlOutput += this.generateRoleSetup();
    sqlOutput += this.generateAuthSetup();

    // Assembly: Order is critical for dependency resolution (Tables -> Logic -> Policies)
    sqlOutput += tables.join('\n\n') + '\n\n';
    sqlOutput += triggers.join('\n\n') + '\n\n';
    sqlOutput += policies.join('\n\n');

    return sqlOutput;
  }

  /**
   * Generates role setup SQL
   */
  private generateRoleSetup(): string {
    return `DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN 
    CREATE ROLE authenticated; 
  END IF; 
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN 
    CREATE ROLE anon; 
  END IF; 
END $$;\n\n`;
  }

  /**
   * Generates auth setup SQL based on provider target
   */
  private generateAuthSetup(): string {
    switch (this.config.authProvider) {
      case 'PostgREST':
        // PostgREST will provide request.jwt.claim.* automatically
        return `-- Auth Provider: PostgREST/Supabase\n-- Session context available via request.jwt.claim.*\n\n`;
      case 'Session':
        // Provide helper functions for setting session variables
        return `-- Auth Provider: Session Variables\n-- Set session context using: SELECT set_config('${this.config.sessionVariables?.userId}', 'user_id_here', false);\n\n`;
      case 'Native':
        // Native uses current_user
        return `-- Auth Provider: Native Postgres Roles\n-- Use SET ROLE to switch users\n\n`;
      default:
        return '';
    }
  }
}
