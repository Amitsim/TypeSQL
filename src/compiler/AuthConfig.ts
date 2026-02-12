/**
 * TypeSQL Compiler Configuration
 * Defines how the compiler should transpile auth and other context-specific code.
 */

export type AuthProviderTarget = 'PostgREST' | 'Session' | 'Native';

export interface TypeSqlConfig {
  /**
   * The authentication provider target determines how sql.auth.* calls are transpiled.
   * - 'PostgREST': Supabase/PostgREST style using request.jwt.claim.*
   * - 'Session': Custom session variables (app.current_user_id, etc.)
   * - 'Native': Postgres native current_user
   */
  authProvider: AuthProviderTarget;
  
  /**
   * Custom session variable names (only used when authProvider = 'Session')
   */
  sessionVariables?: {
    userId?: string;
    userRole?: string;
  };
}

export const defaultConfig: TypeSqlConfig = {
  authProvider: 'PostgREST',
  sessionVariables: {
    userId: 'app.current_user_id',
    userRole: 'app.current_user_role'
  }
};

/**
 * Auth Transpiler - converts sql.auth.* calls to provider-specific SQL
 */
export class AuthTranspiler {
  constructor(private config: TypeSqlConfig) {}

  /**
   * Transpiles sql.auth.userId() to the appropriate SQL expression
   */
  transpileUserId(): string {
    switch (this.config.authProvider) {
      case 'PostgREST':
        return "(current_setting('request.jwt.claim.sub', true))::uuid";
      case 'Session':
        const userIdVar = this.config.sessionVariables?.userId || 'app.current_user_id';
        return `current_setting('${userIdVar}', true)`;
      case 'Native':
        return 'current_user';
      default:
        return 'auth.uid()'; // fallback
    }
  }

  /**
   * Transpiles sql.auth.jwt<T>(claim) to the appropriate SQL expression
   */
  transpileJwtClaim(claim: string): string {
    switch (this.config.authProvider) {
      case 'PostgREST':
        return `current_setting('request.jwt.claim.${claim}', true)`;
      case 'Session':
        return `current_setting('app.${claim}', true)`;
      case 'Native':
        // Native doesn't have JWT claims, return NULL
        return 'NULL';
      default:
        return 'NULL';
    }
  }

  /**
   * Transpiles sql.auth.isAuthenticated() to the appropriate SQL expression
   */
  transpileIsAuthenticated(): string {
    switch (this.config.authProvider) {
      case 'PostgREST':
        return "(current_setting('request.jwt.claim.sub', true) IS NOT NULL)";
      case 'Session':
        const userIdVar = this.config.sessionVariables?.userId || 'app.current_user_id';
        return `(current_setting('${userIdVar}', true) IS NOT NULL AND current_setting('${userIdVar}', true) != '')`;
      case 'Native':
        return "(current_user != 'postgres')";
      default:
        return 'true';
    }
  }
}
