import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Creates `audit_logs`. IP address, user agent and metadata are stored as
 * AES-256-GCM ciphertext; `ip_hash` is a keyed hash used only for search.
 */
export class CreateAuditLogs1793000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          { name: 'user_id', type: 'varchar', length: '64', isNullable: true },
          { name: 'action', type: 'varchar', length: '255', isNullable: false },
          { name: 'method', type: 'varchar', length: '10', isNullable: true },
          {
            name: 'endpoint',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          { name: 'status_code', type: 'int', isNullable: true },
          { name: 'duration_ms', type: 'int', isNullable: true },
          { name: 'ip_hash', type: 'varchar', length: '64', isNullable: true },
          { name: 'ip_address_enc', type: 'text', isNullable: true },
          { name: 'user_agent_enc', type: 'text', isNullable: true },
          { name: 'metadata_enc', type: 'text', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('audit_logs', [
      new TableIndex({
        name: 'IDX_audit_logs_created_at',
        columnNames: ['created_at'],
      }),
      new TableIndex({
        name: 'IDX_audit_logs_user_created',
        columnNames: ['user_id', 'created_at'],
      }),
      new TableIndex({
        name: 'IDX_audit_logs_endpoint_created',
        columnNames: ['endpoint', 'created_at'],
      }),
      new TableIndex({
        name: 'IDX_audit_logs_action',
        columnNames: ['action'],
      }),
      new TableIndex({
        name: 'IDX_audit_logs_ip_hash',
        columnNames: ['ip_hash'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_logs', true);
  }
}
