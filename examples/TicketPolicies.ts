
import { Security, Role, sql } from '../src/pg-ts';
import { SupportTicket } from './tables';

export class TicketPolicies {

  @Security.Policy(SupportTicket)
  static defineRules(policy: Security.Builder<SupportTicket>) {
    
    // Rule: Authenticated users can ONLY view tickets they created
    policy.allowSelect("Owner Read")
      .to(Role.Authenticated)
      // Fluent, type-safe expression
      .using(t => t.creatorId === sql.auth.userId()); // Example of allowing a specific ticket for testing
  }
}
