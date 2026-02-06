
import { Table, Column, PrimaryKey, sql } from '../src/pg-ts';

@Table({ name: 'posts' })
export class Post {
  @PrimaryKey({ default: () => sql.uuid() })
  id: string;

  @Column()
  user_id: string;

  @Column()
  title: string;

  @Column()
  content: string;

  @Column({ default: false })
  is_published: boolean;
}
