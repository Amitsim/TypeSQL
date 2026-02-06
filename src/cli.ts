
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TypeSqlCompiler } from './compiler';
import * as fs from 'fs';

yargs(hideBin(process.argv))
  .command('compile [files..]', 'Compile TypeSQL files to SQL', (yargs) => {
    return yargs.positional('files', {
      describe: 'List of files to compile',
      type: 'string',
      array: true,
      default: ['src/**/*.ts']
    });
  }, (argv) => {
    const files = argv.files as string[];
    console.log(`Compiling ${files.length} files...`);
    
    const compiler = new TypeSqlCompiler();
    compiler.addFiles(files);
    const sql = compiler.compile();
    
    // Output to stdout or file. For now stdout.
    console.log("---------------------------------------------------");
    console.log(sql);
    console.log("---------------------------------------------------");
    
    // Save to file for verification
    fs.writeFileSync('output.sql', sql);
    console.log("Written to output.sql");
    
  })
  .parse();
