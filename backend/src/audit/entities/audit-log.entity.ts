import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per API request. Fields that identify or profile a person (IP
 * address, user agent, free-form metadata) are stored encrypted; the columns
 * needed to filter and aggregate (who, what, when, outcome) stay in the clear.
 * `ipHash` is a keyed hash of the IP so logs can be searched by address
 * without decrypting every row.
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_user_created', ['userId', 'createdAt'])
@Index('IDX_audit_logs_endpoint_created', ['endpoint', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_audit_logs_created_at')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** The authenticated user, or `null` for anonymous requests. */
  @Column({ name: 'user_id', type: 'varchar', length: 64, nullable: true })
  userId: string | null;

  /** What happened, e.g. "POST /api/v1/savings/deposit" or "auth.login". */
  @Index('IDX_audit_logs_action')
  @Column({ type: 'varchar', length: 255 })
  action: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  /** The matched route template (e.g. /api/v1/goals/:id), never the raw URL. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  endpoint: string | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  /** Keyed hash (HMAC-SHA256, hex) of the client IP, used for search only. */
  @Index('IDX_audit_logs_ip_hash')
  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true })
  ipHash: string | null;

  /** AES-256-GCM ciphertext of the client IP address. */
  @Column({ name: 'ip_address_enc', type: 'text', nullable: true })
  ipAddressEnc: string | null;

  /** AES-256-GCM ciphertext of the User-Agent header. */
  @Column({ name: 'user_agent_enc', type: 'text', nullable: true })
  userAgentEnc: string | null;

  /** AES-256-GCM ciphertext of the JSON metadata. */
  @Column({ name: 'metadata_enc', type: 'text', nullable: true })
  metadataEnc: string | null;
}
