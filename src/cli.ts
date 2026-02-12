
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TypeSqlCompiler } from './compiler';
import { TypeSqlConfig, AuthProviderTarget } from './compiler/AuthConfig';
import * as fs from 'fs';
import * as path from 'path';

yargs(hideBin(process.argv))
  .command('compile [files..]', 'Compile TypeSQL files to SQL', (yargs) => {
    return yargs
      .positional('files', {
        describe: 'List of files to compile',
        type: 'string',
        array: true,
        default: ['src/**/*.ts']
      })
      .option('auth-provider', {
        describe: 'Authentication provider target',
        choices: ['PostgREST', 'Session', 'Native'] as AuthProviderTarget[],
        default: 'PostgREST' as AuthProviderTarget
      })
      .option('config', {
        describe: 'Path to TypeSQL config file',
        type: 'string',
        default: 'typesql.config.json'
      })
      .option('output', {
        alias: 'o',
        describe: 'Output SQL file path',
        type: 'string',
        default: 'output.sql'
      });
  }, (argv) => {
    const files = argv.files as string[];
    
    // Load config from file if it exists
    let config: Partial<TypeSqlConfig> = {};
    const configPath = path.resolve(argv.config as string);
    if (fs.existsSync(configPath)) {
      console.log(`Loading config from ${configPath}...`);
      const configFile = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configFile);
    } else {
      // Use CLI flags
      config = {
        authProvider: argv['auth-provider'] as AuthProviderTarget
      };
    }
    
    console.log(`Compiling ${files.length} files with auth provider: ${config.authProvider}...`);
    
    const compiler = new TypeSqlCompiler(config);
    compiler.addFiles(files);
    const sql = compiler.compile();
    
    // Output to stdout
    console.log("---------------------------------------------------");
    console.log(sql);
    console.log("---------------------------------------------------");
    
    // Save to file
    const outputPath = argv.output as string;
    fs.writeFileSync(outputPath, sql);
    console.log(`Written to ${outputPath}`);
    
  })
  .parse();
