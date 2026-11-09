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
 * Upgrade steps for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Execute mod_smartvideo upgrade steps.
 *
 * @param int $oldversion The version we are upgrading from.
 * @return bool Always true on success.
 */
function xmldb_smartvideo_upgrade(int $oldversion): bool {
    global $DB;

    $dbman = $DB->get_manager();

    if ($oldversion < 2026110501) {
        // Migrate tables if migrating from previous mod_securevideo.
        $renames = [
            'securevideo' => 'smartvideo',
            'securevideo_progress' => 'smartvideo_progress',
            'securevideo_questions' => 'smartvideo_questions',
            'securevideo_qattempts' => 'smartvideo_qattempts',
        ];

        foreach ($renames as $oldname => $newname) {
            $oldtable = new xmldb_table($oldname);
            $newtable = new xmldb_table($newname);
            if ($dbman->table_exists($oldtable) && !$dbman->table_exists($newtable)) {
                $dbman->rename_table($oldtable, $newname);
            }
        }

        upgrade_mod_savepoint(true, 2026110501, 'smartvideo');
    }

    if ($oldversion < 2026110504) {
        // Define table smartvideo_chapters to be created.
        $table = new xmldb_table('smartvideo_chapters');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecode', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('title', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL, null, null);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'smartvideo', ['id']);
        $table->add_index('instanceid_timecode_idx', XMLDB_INDEX_NOTUNIQUE, ['instanceid', 'timecode']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        // Define table smartvideo_callouts to be created.
        $table = new xmldb_table('smartvideo_callouts');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecode', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('duration', XMLDB_TYPE_INTEGER, '5', null, XMLDB_NOTNULL, null, '8');
        $table->add_field('title', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL, null, null);
        $table->add_field('body', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('linkurl', XMLDB_TYPE_CHAR, '512', null, null, null, null);
        $table->add_field('linklabel', XMLDB_TYPE_CHAR, '100', null, null, null, null);
        $table->add_field('autopause', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('position', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL, null, 'bottom-right');
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'smartvideo', ['id']);
        $table->add_index('instanceid_timecode_idx', XMLDB_INDEX_NOTUNIQUE, ['instanceid', 'timecode']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_mod_savepoint(true, 2026110504, 'smartvideo');
    }

    if ($oldversion < 2026110505) {
        // Define table smartvideo_notes to be created.
        $table = new xmldb_table('smartvideo_notes');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecode', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('content', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL, null, null);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'smartvideo', ['id']);
        $table->add_index('instanceid_userid_idx', XMLDB_INDEX_NOTUNIQUE, ['instanceid', 'userid']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        // Define table smartvideo_reports to be created.
        $table = new xmldb_table('smartvideo_reports');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('findings', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('impression', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('diagnosis', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('recommendations', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('status', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL, null, 'draft');
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'smartvideo', ['id']);
        $table->add_index('instanceid_userid_idx', XMLDB_INDEX_UNIQUE, ['instanceid', 'userid']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_mod_savepoint(true, 2026110505, 'smartvideo');
    }

    if ($oldversion < 2026110506) {
        // Define table smartvideo_subtitles to be created.
        $table = new xmldb_table('smartvideo_subtitles');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('lang', XMLDB_TYPE_CHAR, '10', null, XMLDB_NOTNULL, null, 'en');
        $table->add_field('label', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL, null, 'English');
        $table->add_field('content', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL, null, null);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'smartvideo', ['id']);
        $table->add_index('instanceid_lang_idx', XMLDB_INDEX_UNIQUE, ['instanceid', 'lang']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        // Define table smartvideo_discussions to be created.
        $table = new xmldb_table('smartvideo_discussions');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('instanceid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecode', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('content', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL, null, null);
        $table->add_field('parentid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('instanceid_fk', XMLDB_KEY_FOREIGN, ['instanceid'], 'smartvideo', ['id']);
        $table->add_index('instanceid_timecode_idx', XMLDB_INDEX_NOTUNIQUE, ['instanceid', 'timecode']);
        $table->add_index('parentid_idx', XMLDB_INDEX_NOTUNIQUE, ['parentid']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_mod_savepoint(true, 2026110506, 'smartvideo');
    }

    if ($oldversion < 2026110507) {
        // SmartVideo v1.5.0 upgrade savepoint (Analytics & Heatmap enhancements).
        upgrade_mod_savepoint(true, 2026110507, 'smartvideo');
    }

    if ($oldversion < 2026110700) {
        $table = new xmldb_table('smartvideo');

        $field = new xmldb_field('videosource', XMLDB_TYPE_CHAR, '50', null, XMLDB_NOTNULL, null, 'securelibrary', 'introformat');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('videourl', XMLDB_TYPE_CHAR, '1333', null, null, null, null, 'videosource');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('duration', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0', 'videourl');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('posterimage', XMLDB_TYPE_CHAR, '1024', null, null, null, null, 'duration');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_mod_savepoint(true, 2026110700, 'smartvideo');
    }

    if ($oldversion < 2026110800) {
        $table = new xmldb_table('smartvideo');

        $field = new xmldb_field('displayinline', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '1', 'posterimage');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('displayoptions', XMLDB_TYPE_TEXT, null, null, null, null, null, 'displayinline');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_mod_savepoint(true, 2026110800, 'smartvideo');
    }

    if ($oldversion < 2026110802) {
        $table = new xmldb_table('smartvideo');
        $field = new xmldb_field(
            'allowofflinedownload',
            XMLDB_TYPE_INTEGER,
            '1',
            null,
            XMLDB_NOTNULL,
            null,
            '1',
            'preventseeking'
        );
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_mod_savepoint(true, 2026110802, 'smartvideo');
    }

    if ($oldversion < 2026110902) {
        upgrade_mod_savepoint(true, 2026110902, 'smartvideo');
    }

    return true;
}
