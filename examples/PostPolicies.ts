
import { Security, Role, sql } from '../src/pg-ts';
import { Post } from './Post';

export class PostPolicies {

  @Security.Policy(Post)
  static defineRules(policy: Security.Builder<Post>) {
    
    // Rule 1: Users can only view their own posts
    policy.allowSelect("Owner Read")
      .to(Role.Authenticated)
      .using(post => post.user_id === sql.auth.userId());

    // Rule 2: Admin users can view all posts
    policy.allowSelect("Admin Read All")
      .to(Role.Authenticated)
      .using(post => sql.auth.jwt<string>('role') === 'admin');

    // Rule 3: Users can only update their own posts
    policy.allowUpdate("Owner Update")
      .to(Role.Authenticated)
      .using(post => post.user_id === sql.auth.userId());

    // Rule 4: Only authenticated users can insert posts
    policy.allowInsert("Authenticated Insert")
      .to(Role.Authenticated)
      .using(post => sql.auth.isAuthenticated());
  }
}
