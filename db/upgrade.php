<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Upgrade steps for mod_securevideo.
 *
 * @package    mod_securevideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Execute mod_securevideo upgrade steps.
 *
 * @param int $oldversion The version we are upgrading from.
 * @return bool Always true on success.
 */
function xmldb_securevideo_upgrade(int $oldversion): bool {
    global $DB;

    $dbman = $DB->get_manager();

    if ($oldversion < 2026102903) {
        // 1. Add completionrequirequestions to securevideo if missing.
        $table = new xmldb_table('securevideo');
        $field = new xmldb_field(
            'completionrequirequestions',
            XMLDB_TYPE_INTEGER,
            '1',
            null,
            XMLDB_NOTNULL,
            null,
            '0',
            'completionminpercent'
        );

        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // 2. Define table securevideo_questions.
        $tablequestions = new xmldb_table('securevideo_questions');
        $tablequestions->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $tablequestions->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tablequestions->add_field('questionbankentryid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tablequestions->add_field('questionid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tablequestions->add_field('timecode', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tablequestions->add_field('title', XMLDB_TYPE_CHAR, '255', null, null, null, null);
        $tablequestions->add_field('requirecorrect', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '1');
        $tablequestions->add_field('rewindonfail', XMLDB_TYPE_INTEGER, '5', null, XMLDB_NOTNULL, null, '0');
        $tablequestions->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tablequestions->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');

        $tablequestions->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $tablequestions->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'securevideo', ['id']);

        $tablequestions->add_index('instanceid_timecode_idx', XMLDB_INDEX_NOTUNIQUE, ['instanceid', 'timecode']);

        if (!$dbman->table_exists($tablequestions)) {
            $dbman->create_table($tablequestions);
        }

        // 3. Define table securevideo_qattempts.
        $tableattempts = new xmldb_table('securevideo_qattempts');
        $tableattempts->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $tableattempts->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tableattempts->add_field('svquestionid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tableattempts->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tableattempts->add_field('qubaid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $tableattempts->add_field('slot', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '1');
        $tableattempts->add_field('passed', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0');
        $tableattempts->add_field('attempts', XMLDB_TYPE_INTEGER, '5', null, XMLDB_NOTNULL, null, '0');
        $tableattempts->add_field('fraction', XMLDB_TYPE_NUMBER, '12, 7', null, null, null, null);
        $tableattempts->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');

        $tableattempts->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $tableattempts->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'securevideo', ['id']);
        $tableattempts->add_key('svquestionid_fk', XMLDB_KEY_FOREIGN, ['svquestionid'], 'securevideo_questions', ['id']);

        $tableattempts->add_index('svquestionid_userid_idx', XMLDB_INDEX_UNIQUE, ['svquestionid', 'userid']);
        $tableattempts->add_index('instanceid_userid_idx', XMLDB_INDEX_NOTUNIQUE, ['instanceid', 'userid']);

        if (!$dbman->table_exists($tableattempts)) {
            $dbman->create_table($tableattempts);
        }

        upgrade_mod_savepoint(true, 2026102903, 'securevideo');
    }

    if ($oldversion < 2026102909) {
        $table = new xmldb_table('securevideo_questions');
        $field = new xmldb_field(
            'rewindto',
            XMLDB_TYPE_INTEGER,
            '10',
            null,
            XMLDB_NOTNULL,
            null,
            '-1',
            'rewindonfail'
        );

        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_mod_savepoint(true, 2026102909, 'securevideo');
    }

    if ($oldversion < 2026102910) {
        $table = new xmldb_table('securevideo_questions');
        $field = new xmldb_field(
            'questionstyle',
            XMLDB_TYPE_CHAR,
            '20',
            null,
            XMLDB_NOTNULL,
            null,
            'compact',
            'rewindto'
        );

        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_mod_savepoint(true, 2026102910, 'securevideo');
    }

    return true;
}
