 
/**
 * Core TypeSQL Decorators and Helpers. 
 * These are used by developers to define schemas, triggers, and policies.
 * They have zero runtime impact as the compiler only uses them for static analysis.
 */

// Basic types for the "virtual" runtime
export type SqlType = string | number | boolean | Date | null;

/**
 * Marks a class as a database Table.
 * @param options.name The actual table name in PostgreSQL.
 */
export function Table(options: { name: string }) {
  return function (target: any) {};
}

/**
 * Marks a property as a database Column.
 */
export function Column(options?: { name?: string; default?: any; type?: string }) {
  return function (target: any, propertyKey: string) {};
}

/**
 * Marks a property as the Primary Key for the table.
 */
export function PrimaryKey(options?: { default?: any }) {
  return function (target: any, propertyKey: string) {};
}

// Trigger related
export enum Event {
  BeforeInsert = 'BEFORE INSERT',
  AfterInsert = 'AFTER INSERT',
  BeforeUpdate = 'BEFORE UPDATE',
  AfterUpdate = 'AFTER UPDATE',
  BeforeDelete = 'BEFORE DELETE',
  AfterDelete = 'AFTER DELETE',
}

/**
 * Marks a static method as a database Trigger.
 * @param options.on The Class reference for the table to attach to.
 * @param options.when The event that fires the trigger.
 */
export function Trigger(options: { on: any; when: Event }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {};
}

// Security related
export enum Role {
  Authenticated = 'authenticated',
  Anon = 'anon',
  ServiceRole = 'service_role',
}

export class Security {
  /**
   * Marks a static method as a Row Level Security (RLS) Policy definition.
   * @param table The Class reference for the table to protect.
   */
  static Policy(table: any) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {};
  }
}

/**
 * Fluent API Builder for constructing RLS Policies.
 */
export namespace Security {
    export interface Builder<T> {
        allowSelect(name: string): PolicyRule<T>;
        allowInsert(name: string): PolicyRule<T>;
        allowUpdate(name: string): PolicyRule<T>;
        allowDelete(name: string): PolicyRule<T>;
        allowAll(name: string): PolicyRule<T>;
    }
}

export interface PolicyRule<T> {
  to(...roles: Role[]): PolicyRule<T>;
  using(expression: (row: T) => boolean): PolicyRule<T>;
}

export interface SqlDate extends Date {
    minus(interval: string): SqlDate;
}

/**
 * SQL Helpers used inside triggers and policies to represent native database functions.
 */
export const sql = {
  /** Map to gen_random_uuid() */
  uuid: () => 'gen_random_uuid()' as unknown as string,
  /** Map to now() with interval math support */
  now: () => ({
    minus: (interval: string) => '' as unknown as SqlDate,
  }) as unknown as SqlDate,
  /** Security helpers mapping to auth.uid() */
  auth: {
    userId: () => '' as unknown as string,
  },
  /** LINQ-style entry point for database queries inside triggers */
  from: <T>(table: new () => T) => {
    return new QueryBuilder<T>();
  }
};

/**
 * Virtual Query Builder for transpilation.
 */
export class QueryBuilder<T> {
  where(predicate: (row: T) => boolean): QueryBuilder<T> {
    return this;
  }
  count(): number {
    return 0;
  }
}
