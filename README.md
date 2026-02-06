# TypeSQL: Zero-Runtime TypeScript to PostgreSQL Transpiler

TypeSQL is a tool that allows you to define your database schema, business logic (triggers), and security policies (RLS) using TypeScript, and compiles them into high-performance, native PostgreSQL SQL.

## How It Works

TypeSQL uses **compile-time introspection** to read your TypeScript code and generate equivalent SQL. It does not run "on top" of your database; it simply generates the migration files you need.

### 1. Schema Definition (`@Table`, `@Column`)

You define your database tables as TypeScript classes using decorators.

**TypeScript Input:**
```typescript
@Table({ name: 'users' })
export class User {
  @PrimaryKey({ default: () => sql.uuid() })
  id: string;

  @Column({ name: 'display_name' })
  displayName: string;
}
```

**Compiler Action:**
The compiler reads the class properties and decorators. It maps TypeScript types (`string`, `number`, `Date`) to PostgreSQL types (`text`, `integer`, `timestamp`).

**SQL Output:**
```sql
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
```

### 2. Business Logic (`@Trigger`)

Instead of writing complex PL/pgSQL syntax (`DECLARE`, `BEGIN`, `NEW`, `OLD`), you write standard TypeScript functions.

**TypeScript Input:**
```typescript
@Trigger({ on: Comment, when: Event.BeforeInsert })
static rateLimit(newComment: Comment) {
  const recentCount = sql.from(Comment)
    .where(c => c.userId === newComment.userId 
             && c.createdAt > sql.now().minus('1 minute'))
    .count();

  if (recentCount >= 3) {
    throw new Error("Slow down!");
  }
}
```

**Compiler Action:**
1.  **AST Analysis**: The compiler uses `ts-morph` to parse the function body.
2.  **Query Transpilation**: It translates the fluent `sql.from(...).where(...)` chain into a `SELECT ... INTO ... FROM ... WHERE` SQL statement.
3.  **Logical Translation**: It converts TypeScript operators (`===`, `&&`) and methods (`throw new Error`) into their SQL equivalents (`=`, `AND`, `RAISE EXCEPTION`).
4.  **Wiring**: It generates the boilerplate `CREATE FUNCTION` and `CREATE TRIGGER` statements to hook everything together.

**SQL Output:**
```sql
CREATE FUNCTION public.commentguard_rateLimit() RETURNS trigger AS $function$
DECLARE
    recent_count integer;
BEGIN
    SELECT count(*) INTO recent_count FROM public.comments
    WHERE comments.user_id = NEW.user_id AND ...;
    
    IF (recent_count >= 3) THEN
        RAISE EXCEPTION 'Slow down!';
    END IF;
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER on_comment_rateLimit ...
```

### 3. Security (`@Security.Policy`)

Row Level Security (RLS) is defined using a fluent, type-safe API.

**TypeScript Input:**
```typescript
@Security.Policy(SupportTicket)
static defineRules(policy: Security.Builder<SupportTicket>) {
  policy.allowSelect("Owner Read")
    .to(Role.Authenticated)
    .using(t => t.creatorId === sql.auth.userId());
}
```

**Compiler Action:**
The compiler walks the method chain to extract the permission (`SELECT`), the role (`authenticated`), and the condition (`USING` clause). It transpiles the arrow function into a SQL boolean expression.

**SQL Output:**
```sql
CREATE POLICY owner_read ON public.support_tickets
FOR SELECT TO authenticated
USING ( (creator_id = auth.uid()) );
```

## Running the Compiler

To compile your project:

```bash
npm start compile examples/**/*.ts
```

This will run the CLI tool, which:
1.  Loads the TypeScript files.
2.  Compiles tables, triggers, and policies.
3.  Injects necessary mocks (like `auth.uid()`) for local testing.
4.  Outputs the full migration to `output.sql` and `stdout`.
