
import { Table, Column, PrimaryKey, sql } from '../src/pg-ts';

@Table({ name: 'users' })
export class User {
    @PrimaryKey({ default: () => sql.uuid() })
    id: string; // Transpiles to UUID

    @Column({ name: 'display_name' })
    displayName: string; // Transpiles to TEXT

    @Column({ default: 0 })
    reputation: number; // Transpiles to INTEGER
}
