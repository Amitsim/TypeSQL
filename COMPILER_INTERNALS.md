# TypeSQL Compiler Internals

This document explains the internal architecture of the TypeSQL compiler. It details how TypeScript source code is parsed, analyzed, and transformed into SQL.

## Architecture Overview

The compiler is built around the [ts-morph](https://ts-morph.com/) library, which provides a convenient API for navigating and manipulating the TypeScript Abstract Syntax Tree (AST).

The compilation process follows a linear pipeline:
1.  **Project Initialization**: Load TypeScript files into a virtual project.
2.  **Schema Generation**: Parse classes decorated with `@Table`.
3.  **Logic Transpilation**: Parse methods decorated with `@Trigger`.
4.  **Policy Generation**: Parse methods decorated with `@Security.Policy`.
5.  **Assembly**: Combine all generated SQL fragments into a correctly ordered migration file.

### Directory Structure

```text
src/compiler/
├── index.ts            # Main Compiler class (Orchestrator)
├── SchemaGenerator.ts  # Handles @Table classes -> CREATE TABLE
├── TriggerGenerator.ts # Handles @Trigger methods -> CREATE FUNCTION/TRIGGER
└── PolicyGenerator.ts  # Handles @Security.Policy -> CREATE POLICY
```

## 1. Schema Generation (`SchemaGenerator.ts`)

**Goal**: Convert a TypeScript Class definition into `CREATE TABLE` SQL.

**Process**:
1.  **Decorator Detection**: It looks for classes with the `@Table({ name: '...' })` decorator.
2.  **Property Iteration**: It iterates over all properties of the class.
3.  **Type Mapping**: It infers the SQL type from the TypeScript type:
    *   `string` -> `text`
    *   `number` -> `integer`
    *   `boolean` -> `boolean`
    *   `Date` -> `timestamp`
4.  **Metadata Extraction**: It checks for `@Column` and `@PrimaryKey` decorators to find metadata like:
    *   Column names (`name: 'display_name'`)
    *   Defaults (`default: sql.uuid()` -> `DEFAULT gen_random_uuid()`)
    *   Constraints (`NOT NULL`)

## 2. Trigger Generation (`TriggerGenerator.ts`)

**Goal**: Convert an imperative TypeScript function into a declarative PL/pgSQL function. This is the most complex part of the compiler.

**Process**:
1.  **Signature Analysis**: It extracts metadata from the `@Trigger` decorator to determine the event (`BEFORE INSERT`), the table, and the trigger name.
2.  **Body Transpilation**: It walks the AST of the function body statement by statement.
    *   **Variable Declarations**: `const x = ...` -> translated to SQL logic or ignored if it's just a query builder start.
    *   **Query Building**: It detects usage of `sql.from(...)`. It then "unwinds" the Fluent API chain (`.where().count()`) to reconstruct a `SELECT ... INTO ...` statement.
    *   **Control Flow**:
        *   `if (condition) { ... }` -> `IF (condition) THEN ... END IF;`
        *   `throw new Error(...)` -> `RAISE EXCEPTION ...;`
3.  **Expression Transpilation**:
    *   The compiler performs simple Regex and string replacements to map TypeScript operators to SQL.
    *   `===` -> `=`
    *   `&&` -> `AND`
    *   `newComment.userId` -> `NEW.user_id` (It intelligently maps parameter names to `NEW` or `OLD` references).

## 3. Policy Generation (`PolicyGenerator.ts`)

**Goal**: Convert fluent security rule definitions into `CREATE POLICY` statements.

**Process**:
1.  **Chain Unwinding**: The generator expects a specific fluent pattern: `policy.allow...().to().using()`.
2.  **Reverse Traversal**: Since the AST represents a nested call expression (e.g., `using(to(allow(...)))`), the compiler traverses *up* the call chain to extract:
    *   **Command**: `allowSelect` -> `FOR SELECT`
    *   **Roles**: `.to(Role.Authenticated)` -> `TO authenticated`
    *   **Condition**: `.using(expr)` -> `USING (expr)`
3.  **Condition Mapping**: The arrow function passed to `.using()` is transpiled similarly to trigger logic, mapping `sql.auth.userId()` to the native PostgreSQL `auth.uid()`.

## 4. Assembly (`index.ts`)

The main `TypeSqlCompiler` class orchestrates the generators.

**Ordering Strategy**:
To avoid "relation does not exist" errors in PostgreSQL, the compiler strictly enforces the output order:
1.  **Tables**: Created first so types exist.
2.  **Functions**: Created next so triggers can reference them.
3.  **Triggers**: Attached to the tables.
4.  **Policies**: Applied last (requires RLS enabled on tables).

It also injects a `DO $$ ... END $$;` block to safely create roles (`authenticated`, `anon`) and mock schemas (`auth.uid()`) if they don't exist, ensuring the generated SQL is runnable in development environments (like Docker).
