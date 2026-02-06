
import { Trigger, Event, sql } from '../src/pg-ts';
import { Comment } from './tables';

export class CommentGuard {
  
  // Runs before a new row is inserted
  @Trigger({ on: Comment, when: Event.BeforeInsert })
  static rateLimit(newComment: Comment) {
    
    // LINQ-like query syntax
    const recentCount = sql.from(Comment)
      .where(c => c.userId === newComment.userId 
               && c.createdAt > sql.now().minus('1 minute'))
      .count();

    if (recentCount >= 3) {
      // Throws a transaction-blocking error
      throw new Error("Slow down!"); 
    }
  }
}
