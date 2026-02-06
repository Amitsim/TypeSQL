
import { Trigger, Event, sql } from '../src/pg-ts';
import { Post } from './Post';

export class PostGuard {
  
  // Rule: Cannot edit content after publication
  @Trigger({ on: Post, when: Event.BeforeUpdate })
  static preventEditIfPublished(newPost: Post, oldPost: Post) {

    if (oldPost.is_published) {
        throw new Error("Cannot edit content of a published post.");
    }

  }

  // Rule: Max 5 posts per day
  @Trigger({ on: Post, when: Event.BeforeInsert })
  static dailyLimit(newPost: Post) {
      const todayCount = sql.from(Post)
        .where(p => p.user_id === newPost.user_id 
                 && p.is_published === true) // Only count published? Valid LINQ expression
        .count();
      
      if (todayCount >= 5) {
          throw new Error("Daily post limit reached.");
      }
  }
}
