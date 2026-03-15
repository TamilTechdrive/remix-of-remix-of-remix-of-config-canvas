import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add source_module to processed files (extracted from path like Samples\\eDBE\\src\\... → eDBE)
  await knex.schema.alterTable('parser_processed_files', (table) => {
    table.string('source_module', 100).nullable(); // eDBE, epress, egos, eintr, ekernal, etc.
    table.string('source_path_prefix', 500).nullable(); // e.g., Samples\\eDBE\\src
    table.index(['source_module']);
  });

  // Add source_module to define vars for quick module filtering
  await knex.schema.alterTable('parser_define_vars', (table) => {
    table.string('source_module', 100).nullable();
    table.string('source_file_name', 500).nullable(); // extracted file name from HitSLNR
    table.integer('source_line_number').nullable(); // extracted line number from HitSLNR
    table.string('diagnostic_level', 20).defaultTo('info'); // info, warning, error
    table.text('diagnostic_message').nullable(); // user-facing message about this define
    table.index(['source_module']);
    table.index(['diagnostic_level']);
  });

  // Add hit_src_scope to all hits table
  await knex.schema.alterTable('parser_define_var_hits', (table) => {
    table.string('hit_src_scope', 100).nullable(); // DEF-LHS, COND_IF, COND_ELSE, etc.
    table.string('source_file_name', 500).nullable(); // extracted from HitSLNR
    table.integer('source_line_number').nullable();
    table.string('source_module', 100).nullable();
  });

  // Add source_module to included files
  await knex.schema.alterTable('parser_included_files', (table) => {
    table.string('source_module', 100).nullable();
    table.string('source_file_name', 500).nullable(); // file that includes it
    table.integer('source_line_number').nullable(); // line where the #include appears
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('parser_processed_files', (table) => {
    table.dropColumn('source_module');
    table.dropColumn('source_path_prefix');
  });
  await knex.schema.alterTable('parser_define_vars', (table) => {
    table.dropColumn('source_module');
    table.dropColumn('source_file_name');
    table.dropColumn('source_line_number');
    table.dropColumn('diagnostic_level');
    table.dropColumn('diagnostic_message');
  });
  await knex.schema.alterTable('parser_define_var_hits', (table) => {
    table.dropColumn('hit_src_scope');
    table.dropColumn('source_file_name');
    table.dropColumn('source_line_number');
    table.dropColumn('source_module');
  });
  await knex.schema.alterTable('parser_included_files', (table) => {
    table.dropColumn('source_module');
    table.dropColumn('source_file_name');
    table.dropColumn('source_line_number');
  });
}
