
import { Table, Column, PrimaryKey, sql } from '../src/pg-ts';

@Table({ name: 'comments' })
export class Comment {
  @PrimaryKey({ default: () => sql.uuid() })
  id: string;

  @Column()
  userId: string;
  
  @Column()
  createdAt: Date;
}

@Table({ name: 'support_tickets' })
export class SupportTicket {
  @PrimaryKey()
  id: string;

  @Column()
  creatorId: string;
}
